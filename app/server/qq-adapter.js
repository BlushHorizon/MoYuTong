'use strict';
/**
 * QQ 接入适配器
 * ---------------------------------------------------------------------------
 * 统一接口（OneBotAdapter / MockAdapter 都实现）：
 *   connect()                     建立连接
 *   on('event',   normalized)     收到消息 / 通知（已归一化）
 *   on('status',  {connected,...}) 连接状态变化
 *   call(action, params)          OneBot 动作调用
 *   sendText(chat, text)          发送文本消息
 *   fetchFriends() / fetchGroups() / selfInfo
 *
 * 说明：QQ NT 客户端已在 9.9.x 版本中屏蔽调试端口（--remote-debugging-port /
 * --inspect 均被移除，CDP 服务端也被裁剪），因此无法像 EAgent 驱动浏览器那样
 * 直接驱动 QQ 窗口；这里采用官方推荐的 OneBot 11 协议接入（NapCatQQ 提供实现）。
 */

const { EventEmitter } = require('events');

/* ============================ 公共工具 ============================ */

function textFromSegments(segments) {
  let text = '';
  for (const seg of Array.isArray(segments) ? segments : []) {
    if (seg && seg.type === 'text' && seg.data) text += String(seg.data.text || '');
  }
  return text.replace(/\[CQ:[^\]]+\]/g, '').trim();
}

function normalizeText(raw, message) {
  // 兼容两种上报格式：CQ 码字符串，以及 OneBot 消息段数组。
  // 后者如果直接 String(array) 会得到 [object Object]，正文就丢了。
  if (Array.isArray(message)) return textFromSegments(message);
  if (Array.isArray(raw)) return textFromSegments(raw);
  return String(raw || '')
    .replace(/\[CQ:[^\]]+\]/g, '')
    .trim();
}

/** 从 CQ 字符串或 OneBot 消息段里取出被 @ 的 QQ / all */
function extractMentionIds(raw, message) {
  const ids = [];
  for (const seg of Array.isArray(message) ? message : []) {
    if (seg && seg.type === 'at' && seg.data && seg.data.qq != null) {
      ids.push(String(seg.data.qq));
    }
  }
  const re = /\[CQ:at,[^\]]*?qq=([^,\]]+)/g;
  let m;
  while ((m = re.exec(String(raw || '')))) ids.push(String(m[1]));
  return [...new Set(ids)];
}

function mentionsMe(raw, message, selfId) {
  const id = String(selfId || '');
  return extractMentionIds(raw, message).some((qq) => qq === 'all' || (!!id && qq === id));
}

/* ============================ OneBot 11 适配器 ============================ */

class OneBotAdapter extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.wsUrl = opts.wsUrl || 'ws://127.0.0.1:3001';
    this.accessToken = opts.accessToken || '';
    this.timeoutMs = opts.timeoutMs || 15000;
    this.ws = null;
    this.connected = false;
    this.self = { userId: 0, nickname: '' };
    this._echo = 0;
    this._pending = new Map();
    this._closedByUser = false;
    this._retryTimer = null;   // 重连定时器句柄（close() 要靠它清理）
  }

  connect() {
    this._closedByUser = false;
    // 已有的 socket 先关掉：connect() 可能被重复调用（改设置重建 + 手动重连），
    // 不关的话旧连接会一直挂着，和新连接抢同一个 OneBot 服务。
    // 注意：旧 socket 的 close 事件要靠下面的 `this.ws !== ws` 判断屏蔽掉，
    // 否则它还会再排一次 5 秒重连，越滚越多。
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(); } catch { /* noop */ }
    }
    // accessToken 统一走 query 参数（NapCat / SnowLuma / Lagrange 均支持）
    let url = this.wsUrl;
    if (this.accessToken && !/[?&]access_token=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(this.accessToken);
    }

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.emit('status', { connected: false, message: `地址无效: ${err.message}` });
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', async () => {
      if (this.ws !== ws) return;   // 已被新连接取代，旧 socket 的事件全部忽略
      this.connected = true;
      this.emit('status', { connected: true, message: '已连接 OneBot 服务' });
      try {
        // 账号切换窗口期该调用可能瞬时失败，做几次重试
        let info = null;
        for (let i = 0; i < 4 && !info; i++) {
          try { info = await this.call('get_login_info'); }
          catch { await new Promise(r => setTimeout(r, 1500)); }
        }
        if (info && this.ws === ws) {
          this.self = { userId: info.user_id, nickname: info.nickname || '' };
          this.emit('status', { connected: true, message: `已连接：${this.self.nickname}(${this.self.userId})`, self: this.self });
        }
      } catch { /* 忽略取登录信息失败 */ }
      try {
        if (this.ws === ws) await this.call('get_version_info');
      } catch { /* 可选动作 */ }
    });

    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return;
      let data;
      try { data = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); }
      catch { return; }
      // messageFormat: "array" 的实现（如 SnowLuma / NapCat）会一帧发多条
      if (Array.isArray(data)) {
        for (const item of data) this._onMessage(item);
        return;
      }
      this._onMessage(data);
    });

    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;   // 旧 socket 的关闭事件，别触发重连
      this.connected = false;
      for (const [, p] of this._pending) { clearTimeout(p.timer); p.reject(new Error('连接已断开')); }
      this._pending.clear();
      this.emit('status', { connected: false, message: '连接已断开' });
      if (!this._closedByUser) this._reconnect();
    });

    ws.addEventListener('error', () => {
      if (this.ws !== ws) return;
      this.emit('status', { connected: false, message: '连接错误（NapCat 未启动？）' });
    });
  }

  _onMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.echo !== undefined && this._pending.has(data.echo)) {
      const { resolve, reject, timer } = this._pending.get(data.echo);
      clearTimeout(timer);
      this._pending.delete(data.echo);
      if (data.status === 'failed' || (data.retcode !== undefined && data.retcode !== 0)) {
        reject(new Error(data.message || data.wording || `retcode=${data.retcode}`));
      } else resolve(data.data);
      return;
    }
    if (data.post_type) this._onRawEvent(data);
  }

  _reconnect() {
    // 必须留住定时器句柄，否则 close() 清不掉：
    // 旧适配器会在关闭 5 秒后自己诈尸重连，和新适配器抢同一个 OneBot 连接。
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this.connect();
    }, 5000);
  }

  close() {
    this._closedByUser = true;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  call(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        return reject(new Error('OneBot 未连接'));
      }
      const echo = `e${++this._echo}`;
      const timer = setTimeout(() => {
        this._pending.delete(echo);
        reject(new Error(`动作 ${action} 超时`));
      }, this.timeoutMs);
      this._pending.set(echo, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ action, params, echo }));
    });
  }

  async fetchFriends() {
    const list = await this.call('get_friend_list');
    return (list || []).map((f) => ({
      id: String(f.user_id),
      name: f.remark || f.nickname || String(f.user_id),
      raw: String(f.user_id)
    }));
  }

  async fetchGroups() {
    const list = await this.call('get_group_list');
    return (list || []).map((g) => ({
      id: String(g.group_id),
      name: g.group_name || String(g.group_id),
      members: g.member_count,
      raw: String(g.group_id)
    }));
  }

  /**
   * 发送文本
   * @param {{type:string,targetId:string}} chat
   * @param {string} text
   * @param {{at?:string,quoteId?:string|number}} [opts] 群聊附加：@成员 / 引用原消息
   */
  async sendText(chat, text, opts = {}) {
    if (chat.type === 'group') {
      const segs = [];
      // 引用段必须放第一位，QQ 才会渲染成"回复"样式
      if (opts.quoteId) {
        const qid = /^-?\d+$/.test(String(opts.quoteId)) ? Number(opts.quoteId) : String(opts.quoteId);
        segs.push({ type: 'reply', data: { id: qid } });
      }
      if (opts.at) segs.push({ type: 'at', data: { qq: String(opts.at) } });
      segs.push({ type: 'text', data: { text } });
      const message = segs.length > 1 ? segs : text;  // 无附加段时保持纯文本，兼容性最好
      return this.call('send_group_msg', { group_id: Number(chat.targetId), message });
    }
    return this.call('send_private_msg', { user_id: Number(chat.targetId), message: text });
  }

  /**
   * 发送任意 OneBot 段数组（表情包 / 图片 / 混合消息 —— 表情包功能用）
   * @param {{type:string,targetId:string}} chat
   * @param {Array<{type:string,data:object}>} segments
   */
  async sendSegments(chat, segments) {
    if (!Array.isArray(segments) || !segments.length) throw new Error('sendSegments: 段数组为空');
    if (chat.type === 'group') {
      return this.call('send_group_msg', { group_id: Number(chat.targetId), message: segments });
    }
    return this.call('send_private_msg', { user_id: Number(chat.targetId), message: segments });
  }

  /** 透传任意 OneBot 动作（踢人 / 禁言等群管理操作） */
  callAction(action, params = {}) {
    return this.call(action, params);
  }

  /* ---------- 事件归一化 ---------- */
  _onRawEvent(data) {
    if (data.post_type === 'meta_event') {
      this.emit('meta', data.meta_event_type);
      return;
    }
    if (data.post_type !== 'message' && data.post_type !== 'message_sent') return;

    const isGroup = data.message_type === 'group';
    const selfId = String(data.self_id || this.self?.userId || '');
    const senderId = String(data.sender?.user_id ?? data.user_id ?? '');
    // 自己发的消息（含自己给自己发）一律标记 self，避免 AI 自己回自己
    const self = data.post_type === 'message_sent' ||
      (!!selfId && (senderId === selfId || String(data.user_id ?? '') === selfId));
    const senderName = data.sender?.card || data.sender?.nickname || (self ? (this.self?.nickname || '') : String(data.user_id));
    const raw = data.raw_message || data.message || '';

    const msg = {
      id: String(data.message_id ?? `${Date.now()}`),
      chatType: isGroup ? 'group' : 'private',
      chatId: isGroup ? String(data.group_id) : String(data.user_id),
      chatName: isGroup ? '' : (data.sender?.nickname || ''),
      fromId: String(data.user_id ?? ''),
      fromName: senderName,
      self,
      text: normalizeText(raw, data.message),
      raw,
      mentionsMe: mentionsMe(raw, data.message, selfId),
      mentions: extractMentionIds(raw, data.message).length,
      images: extractImages(raw, data.message),
      stickers: extractStickers(raw, data.message),
      time: Date.now()
    };
    this.emit('event', msg);
  }
}

/** OneBot CQ 码字符串转义还原（& → &amp;、[ → &#91;、] → &#93;、, → &#44;）。
 *  不还原的后果：同一张表情包被存成 & 和 &amp; 两条素材，且 &amp; 版链接发出去必 400。 */
function unescapeCQ(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#44;/g, ',');
}

/** 从消息里提取图片地址（兼容 string CQ 码 与 array 段 两种上报格式） */
function extractImages(raw, message) {
  const urls = [];
  if (Array.isArray(message)) {
    for (const seg of message) {
      if (seg && seg.type === 'image' && seg.data) {
        const u = seg.data.url || seg.data.file;
        if (u && /^https?:\/\//.test(String(u))) urls.push(unescapeCQ(u));
      }
    }
  }
  const re = /\[CQ:image,[^\]]*?url=([^\],]+)/g;
  let m;
  const s = String(raw || '');
  while ((m = re.exec(s))) urls.push(unescapeCQ(m[1]));
  // 还原后 array 段与 CQ 码两条来源得到同一 URL，Set 顺手去重（同一消息不上报两次）
  return [...new Set(urls)];
}

/** 从消息里提取商城表情（mface；兼容 array 段与 CQ 码两种上报格式） */
function extractStickers(raw, message) {
  const out = [];
  if (Array.isArray(message)) {
    for (const seg of message) {
      if (!seg || !seg.data) continue;
      if (seg.type === 'mface') {
        out.push({
          emojiId: String(seg.data.emojiId || seg.data.emoji_id || ''),
          packageId: String(seg.data.emojiPackageId || seg.data.emoji_package_id || ''),
          key: String(seg.data.emojiKey || seg.data.key || ''),
          text: String(seg.data.text || seg.data.name || '')
        });
      } else if (seg.type === 'image' && (seg.data.emoji_id || seg.data.emojiId)) {
        // SnowLuma 的商城表情也可能以“带 emoji 标记的 image 段”上报
        out.push({
          emojiId: String(seg.data.emoji_id || seg.data.emojiId || ''),
          packageId: String(seg.data.emoji_package_id || seg.data.emojiPackageId || ''),
          key: String(seg.data.key || ''),
          text: String(seg.data.summary || seg.data.name || '')
        });
      }
    }
  }
  const re = /\[CQ:mface([^\]]*)\]/g;
  let m;
  const s = String(raw || '');
  while ((m = re.exec(s))) {
    const attrs = {};
    for (const kv of m[1].split(',').slice(1)) {
      const i = kv.indexOf('=');
      if (i > 0) attrs[kv.slice(0, i)] = unescapeCQ(kv.slice(i + 1));
    }
    out.push({
      emojiId: attrs.emojiId || attrs.emoji_id || '',
      packageId: attrs.emojiPackageId || attrs.emoji_package_id || '',
      key: attrs.emojiKey || attrs.key || '',
      text: attrs.name || attrs.text || ''
    });
  }
  return out.filter((x) => x.emojiId);
}

/* ============================ 演示（模拟）适配器 ============================ */

const MOCK_FRIENDS = [
  { id: '10001', name: '林小满' },
  { id: '10002', name: '阿泽' },
  { id: '10003', name: '产品群主-老王' }
];

const MOCK_GROUPS = [
  { id: '20001', name: '项目研发群', members: 86 },
  { id: '20002', name: '周末爬山小队', members: 12 }
];

const MOCK_PEER_REPLIES = [
  '收到，我稍后看看～',
  '哈哈哈哈这个有意思',
  '好嘞，那就这么定了',
  '在的，你说',
  '我刚忙完，这就看'
];

const MOCK_INCOMING = [
  '在吗？帮我看下这个方案怎么写',
  '刚收到通知，下午三点的会你还去吗',
  '这个需求你估个工时给我',
  '晚上一起吃饭？'
];

class MockAdapter extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.self = { userId: 99999, nickname: '我' };
    this._timers = new Set();
    this._replyIdx = 0;
    this._inIdx = 0;
    this.connected = true;
  }

  connect() {
    setTimeout(() => {
      this.emit('status', { connected: true, message: `演示模式：${this.self.nickname}(${this.self.selfId || this.self.userId})`, self: this.self });
      // 启动后自动来一条消息，便于体验 AI 自动回复
      this._later(() => this.simulateIncoming('private', '10001'), 1500);
    }, 200);
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
  }

  close() { for (const t of this._timers) clearTimeout(t); this._timers.clear(); }

  async call(action) {
    if (action === 'get_login_info') return { user_id: this.self.userId, nickname: this.self.nickname };
    return {};
  }

  async fetchFriends() { return MOCK_FRIENDS; }
  async fetchGroups() { return MOCK_GROUPS; }

  async sendText(chat, text) {
    // 回显自己发出的消息
    this._later(() => this.emit('event', {
      id: `m-self-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatType: chat.type, chatId: String(chat.targetId), chatName: '',
      fromId: String(this.self.userId), fromName: this.self.nickname,
      self: true, text, raw: text, mentionsMe: false, mentions: 0, time: Date.now()
    }), 150);

    // 对方回一句，让会话有来有回
    if (chat.type === 'private') {
      const reply = MOCK_PEER_REPLIES[this._replyIdx++ % MOCK_PEER_REPLIES.length];
      const peer = MOCK_FRIENDS.find((f) => f.id === String(chat.targetId));
      this._later(() => this.emit('event', {
        id: `m-peer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        chatType: 'private', chatId: String(chat.targetId), chatName: peer?.name || '',
        fromId: String(chat.targetId), fromName: peer?.name || '好友',
        self: false, text: reply, raw: reply, mentionsMe: false, mentions: 0, time: Date.now()
      }), 1600);
    }
    return { message_id: Date.now() };
  }

  simulateIncoming(chatType = 'private', chatId = '10001') {
    const text = MOCK_INCOMING[this._inIdx++ % MOCK_INCOMING.length];
    const name = chatType === 'group'
      ? (MOCK_GROUPS.find((g) => g.id === chatId)?.name || '群成员')
      : (MOCK_FRIENDS.find((f) => f.id === chatId)?.name || '好友');
    this._later(() => this.emit('event', {
      id: `m-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatType, chatId: String(chatId), chatName: chatType === 'group' ? '' : name,
      fromId: chatId, fromName: name,
      self: false, text, raw: text, mentionsMe: chatType === 'group', mentions: chatType === 'group' ? 1 : 0, time: Date.now()
    }), 500);
  }
}

/* ============================ 工厂 ============================ */

function createAdapter(qqConfig) {
  if (qqConfig.mode === 'onebot') {
    return new OneBotAdapter({
      wsUrl: qqConfig.onebot?.wsUrl,
      accessToken: qqConfig.onebot?.accessToken
    });
  }
  return new MockAdapter();
}

module.exports = { createAdapter, OneBotAdapter, MockAdapter, normalizeText };