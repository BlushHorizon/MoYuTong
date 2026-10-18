'use strict';
/**
 * 轻量会话存储：内存 + 落盘（data/store.json）。
 * 只保留最近若干条消息，避免文件无限增长。
 */
const fs = require('fs');
const path = require('path');

const MAX_MESSAGES_PER_CHAT = 300;
const MAX_CHATS = 200;

class Store {
  constructor(root) {
    this.file = path.join(root, 'data', 'store.json');
    /** @type {Map<string, object>} key: 'private:123' | 'group:456' */
    this.chats = new Map();
    /** @type {Map<string, object[]>} */
    this.messages = new Map();
    this._dirty = false;
    this._timer = null;
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const c of raw.chats || []) this.chats.set(c.id, c);
      for (const [k, arr] of Object.entries(raw.messages || {})) this.messages.set(k, arr);
      console.log(`[store] 已载入 ${this.chats.size} 个会话、${[...this.messages.values()].reduce((a, b) => a + b.length, 0)} 条消息`);
    } catch (err) {
      console.warn('[store] 载入失败:', err.message);
    }
  }

  scheduleSave() {
    this._dirty = true;
    if (this._timer) return;
    // 短防抖：进程被强杀时最多丢 200ms 内的数据
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this.save();
    }, 200);
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const payload = {
        savedAt: Date.now(),
        chats: [...this.chats.values()],
        messages: Object.fromEntries(this.messages)
      };
      fs.writeFileSync(this.file, JSON.stringify(payload), 'utf8');
      this._dirty = false;
    } catch (err) {
      console.warn('[store] 保存失败:', err.message);
    }
  }

  chatKey(type, id) {
    return `${type}:${id}`;
  }

  ensureChat(type, id, name, extra = {}) {
    const key = this.chatKey(type, id);
    let chat = this.chats.get(key);
    if (!chat) {
      chat = { id: key, type, targetId: String(id), name: name || String(id), lastText: '', lastTime: 0, unread: 0 };
      this.chats.set(key, chat);
      if (this.chats.size > MAX_CHATS) {
        const oldest = [...this.chats.values()].sort((a, b) => (a.lastTime || 0) - (b.lastTime || 0))[0];
        if (oldest) {
          this.chats.delete(oldest.id);
          this.messages.delete(oldest.id);
        }
      }
    }
    if (name) chat.name = name;
    Object.assign(chat, extra);
    this.scheduleSave();
    return chat;
  }

  addMessage(msg) {
    const key = this.chatKey(msg.chatType, msg.chatId);
    if (!this.messages.has(key)) this.messages.set(key, []);
    const arr = this.messages.get(key);
    // 去重：同一 chat 下相同 id 只留一条
    if (msg.id && arr.some((m) => m.id === msg.id)) {
      const exist = arr.find((m) => m.id === msg.id);
      Object.assign(exist, msg);
      return exist;
    }
    arr.push(msg);
    // 去重：3 秒内相同内容、相同发送者的消息只保留一条
    // （OneBot 实现可能同时回报动作响应与事件，或本地已先做乐观回显）
    const tail = arr.slice(-4);
    const dup = tail.find((m) =>
      m.chatType === msg.chatType && m.chatId === msg.chatId &&
      m.self === msg.self && m.text === msg.text &&
      Math.abs((m.time || 0) - (msg.time || 0)) < 3000
    );
    if (dup) {
      Object.assign(dup, msg);
      return dup;
    }
    if (arr.length > MAX_MESSAGES_PER_CHAT) arr.splice(0, arr.length - MAX_MESSAGES_PER_CHAT);
    const chat = this.ensureChat(msg.chatType, msg.chatId, msg.chatName);
    chat.lastText = msg.text || chat.lastText;
    chat.lastTime = msg.time || Date.now();
    this.scheduleSave();
    return msg;
  }

  getMessages(chatId, limit = 200) {
    const arr = this.messages.get(chatId) || [];
    return arr.slice(-limit);
  }

  setUnread(chatId, n) {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    chat.unread = n;
    this.scheduleSave();
  }

  markRead(chatId) {
    this.setUnread(chatId, 0);
  }

  listChats() {
    return [...this.chats.values()].sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  }

  /** 供 AI 使用的会话上下文 */
  recentTurns(chatId, turns) {
    const arr = (this.messages.get(chatId) || []).slice(-turns * 2);
    return arr
      .filter((m) => m.text && !m.system)
      .map((m) => ({ role: m.self ? 'assistant' : 'user', content: m.text }));
  }

  historyForDisplay(chatId, limit = 200) {
    return this.getMessages(chatId, limit);
  }
}

module.exports = { Store };