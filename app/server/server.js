'use strict';
/**
 * 网页版 QQ 服务端
 *   - 托管 public/ 静态页面
 *   - REST：状态 / 会话 / 消息 / 发送 / 设置 / 好友群列表
 *   - SSE  ：实时把 QQ 消息、AI 状态推给网页
 *   - QQ   ：通过 qq-adapter 接入（OneBot 11 或演示模式）
 *   - AI   ：ai.js 自动回复
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const configLib = require('./config');
const { Store } = require('./store');
const { createAdapter } = require('./qq-adapter');
const { AIResponder } = require('./ai');
const { DeepSeekWeb, siteList } = require('./deepseek-web');
const { StickerLibrary } = require('./stickers');

/* ---------------- 日志系统：控制台实时显示 + data\app.log 持久落盘（追加、不截断） ---------------- */
const _tsNow = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const _logDir = path.join(__dirname, '..', 'data');
const _logFile = path.join(_logDir, 'app.log');
function _rotateIfNeeded() {
  try {
    fs.mkdirSync(_logDir, { recursive: true });
    // 超 5MB 自动留档，重新开一个（旧日志 app.<时间戳>.log 保留可查）
    if (fs.existsSync(_logFile) && fs.statSync(_logFile).size > 5 * 1024 * 1024) {
      fs.renameSync(_logFile, path.join(_logDir, `app.${Date.now()}.log`));
    }
  } catch { /* noop */ }
}
function _toLine(args) {
  return args.map((x) => {
    if (typeof x === 'string') return x;
    if (x && x.stack) return x.stack;
    try { return JSON.stringify(x); } catch { return String(x); }
  }).join(' ');
}
function _writeLog(line) {
  try { fs.appendFileSync(_logFile, line + '\n'); } catch { /* noop */ }
}
console.log = ((orig) => (...a) => { const l = `[${_tsNow()}] [INFO] ${_toLine(a)}`; orig(l); _writeLog(l); })(console.log);
console.warn = ((orig) => (...a) => { const l = `[${_tsNow()}] [WARN] ${_toLine(a)}`; orig(l); _writeLog(l); })(console.warn);
console.error = ((orig) => (...a) => { const l = `[${_tsNow()}] [ERROR] ${_toLine(a)}`; orig(l); _writeLog(l); })(console.error);
_rotateIfNeeded();
{
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  console.log(`======== 摸鱼瞳 MoYuTong 服务启动 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ========`);
  console.log('  -----------------------------------------------');
  console.log('  ⚠️ 玩具级学习作品，非生产级产品。使用即表示你已接受：');
  console.log('     · 自动发送 AI 生成内容到 QQ，请勿用于骚扰/刷屏，建议小号');
  console.log('     · 限时试用：作者希望你下载后 24 小时内删除它——它是玩具，试过就好');
  console.log('     · 非反代/无中转/无逆向，但 CDP 驱动网页版违反 DeepSeek 用户协议');
  console.log('     · 数据仅存本机，无遥测；一切后果由使用者自担');
  console.log('     · 侵权/投诉/合作：1413214574@qq.com   MIT 开源');
  console.log('  -----------------------------------------------');
}
/** 运行计数（由 broadcast 汇总，供心跳行输出） */
const stats = { inMsgs: 0, aiReplies: 0, skips: 0 };

const cfg = configLib.load();
const ROOT = configLib.ROOT;
const PUBLIC_DIR = path.join(ROOT, 'public');

const store = new Store(ROOT);

/* ---------------- SSE 客户端 ---------------- */
const sseClients = new Set();

function broadcast(evt) {
  // 运行计数（心跳行用）
  if (evt.type === 'message' && evt.message && !evt.message.self) stats.inMsgs++;
  if (evt.type === 'ai_replied') stats.aiReplies++;
  if (evt.type === 'ai_skip') stats.skips++;
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

/* ---------------- QQ 适配器 ---------------- */
let adapter = createAdapter(cfg.qq);
let qqStatus = { connected: false, message: '未连接', mode: cfg.qq.mode };

adapter.on('status', (s) => {
  qqStatus = { ...s, mode: cfg.qq.mode };
  console.log(`[qq:${cfg.qq.mode}] ${s.message}`);
  broadcast({ type: 'qq_status', status: qqStatus, ai: ai.status() });
  if (s.connected && cfg.qq.mode === 'onebot') seedContacts();
});

/** 把好友/群拉进会话列表，这样网页打开就能直接看到全部联系人 */
let seeding = false;
async function seedContacts() {
  if (seeding) return;
  seeding = true;
  try {
    const [friends, groups] = await Promise.all([
      adapter.fetchFriends().catch(() => []),
      adapter.fetchGroups().catch(() => [])
    ]);
    for (const f of friends || []) store.ensureChat('private', f.raw ?? f.id, f.name);
    for (const g of groups || []) store.ensureChat('group', g.raw ?? g.id, g.name);
    broadcast({ type: 'contacts_seeded', chats: store.listChats() });
    console.log(`[qq] 已载入联系人：${(friends || []).length} 好友 / ${(groups || []).length} 群`);
  } catch (err) {
    console.warn('[qq] 载入联系人失败:', err.message);
  } finally {
    seeding = false;
  }
}

adapter.on('event', async (msg) => {
  const chat = store.ensureChat(msg.chatType, msg.chatId, msg.chatName || undefined);
  if (!msg.chatName && msg.chatType === 'private') chat.name = msg.fromName || chat.name;
  store.addMessage(msg);
  {
    // 每条来信入日志：群/私 + 来源 + 内容（或图片）
    const where = msg.chatType === 'group' ? `群[${chat.name || msg.chatId}]` : `私[${msg.fromName || msg.chatId}]`;
    const body = msg.text || (msg.images && msg.images.length ? `<图片x${msg.images.length}>` : msg.raw || '(空)');
    console.log(`[消息] 收到 ${where} ${msg.fromName || ''}: ${String(body).slice(0, 80)}`);
  }
  broadcast({ type: 'message', message: msg, chat });

  // 表情包素材收集（内置功能），出错不影响主流程
  try { stickerLib.collect(msg); } catch { /* noop */ }

  // 触发 AI 自动回复（EAgent 式自动应答）
  ai.handle(msg).catch((e) => console.warn('[ai] handle 出错:', e.message));
});

/* ---------------- AI ---------------- */
const deepseek = new DeepSeekWeb({
  port: cfg.ai?.cdpPort || 9222,
  profileDir: path.join(ROOT, 'data', 'deepseek_profile'),
  browserPath: cfg.ai?.browserPath || '',
  site: cfg.ai?.webProvider || 'deepseek',   // 网页版站点：deepseek / qianwen / kimi / mimo
  // 提示词不在这给：等 ai 创建后统一 configure(ai._fullPrompt())——
  // 完整提示词 = 用户人设 + 【表情包能力】段，所有入口只认这一个来源
  prompt: '',
  maxRounds: cfg.ai?.webMaxRounds || 50,
  onStatus: (st) => {
    console.log(`[deepseek:${st.site}] ${st.state}: ${st.message}`);
    broadcast({ type: 'deepseek_status', status: st, ai: ai.status() });
  }
});

/* ---------------- 表情包（内置） ---------------- */
const stickerLib = new StickerLibrary({
  dataDir: path.join(ROOT, 'data'),
  adapter,
  log: (t) => console.log(`[表情包] ${t}`)
});

const ai = new AIResponder({
  config: cfg.ai,
  store,
  adapter,
  broadcast,
  deepseek,
  sticker: stickerLib,
  getConfig: () => configLib.get(),
  saveConfig: () => configLib.save({})
});

// 唯一提示词入口：完整提示词（人设 +【表情包能力】段）在此注入 DeepSeek 驱动。
// 之后启动自动发、②新建对话、50 轮换轮、保存设置、每条消息补发——全部用它。
deepseek.configure({ site: cfg.ai?.webProvider || 'deepseek', prompt: ai._fullPrompt(), maxRounds: cfg.ai?.webMaxRounds || 50 });

// 防抽风看门狗：DeepSeek 驱动思考卡死超时自动复位（每分钟检查一次）
setInterval(() => {
  try { deepseek.watchdog?.(); } catch { /* noop */ }
}, 60 * 1000).unref?.();

// 心跳行：每 60 秒一条运行状态（日志窗口始终“活着”，随时可巡检）
setInterval(() => {
  let dsState = '-';
  try { dsState = deepseek.status ? deepseek.status().state : '-'; } catch { /* noop */ }
  console.log(`[心跳] QQ=${qqStatus.connected ? '已连接' : '断开'} | 会话=${store.chats.size} | 收信=${stats.inMsgs} AI回=${stats.aiReplies} 跳过=${stats.skips} | DeepSeek=${dsState}`);
}, 60 * 1000).unref?.();

/* ---------------- 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([\\/])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // 单页应用兜底
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

/* ---------------- 路由 ---------------- */
async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      qq: qqStatus,
      self: adapter.self,
      ai: ai.status(),
      version: '1.0.0'
    });
  }

  if (p === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    res.write(`data: ${JSON.stringify({ type: 'hello', qq: qqStatus, ai: ai.status() })}\n\n`);
    sseClients.add(res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* noop */ } }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
    return;
  }

  if (p === '/api/chats' && req.method === 'GET') {
    return sendJson(res, 200, { chats: store.listChats() });
  }

  if (p.startsWith('/api/chats/') && p.endsWith('/messages')) {
    const chatId = decodeURIComponent(p.slice('/api/chats/'.length, -'/messages'.length));
    return sendJson(res, 200, { messages: store.historyForDisplay(chatId) });
  }

  if (p === '/api/contacts' && req.method === 'GET') {
    try {
      const [friends, groups] = await Promise.all([
        adapter.fetchFriends().catch(() => []),
        adapter.fetchGroups().catch(() => [])
      ]);
      return sendJson(res, 200, { friends, groups });
    } catch (err) {
      return sendJson(res, 500, { error: err.message, friends: [], groups: [] });
    }
  }

  if (p === '/api/send' && req.method === 'POST') {
    const body = await readBody(req);
    const { chatId, text } = body;
    if (!chatId || !text || !String(text).trim()) {
      return sendJson(res, 400, { error: '缺少 chatId 或 text' });
    }
    const chat = store.chats.get(chatId);
    if (!chat) return sendJson(res, 404, { error: '会话不存在' });
    try {
      const trimmed = String(text).trim();
      // 可选调试参数：body.at 群聊@成员，body.quoteId 引用消息（仅群聊生效）
      const sendOpts = { at: body.at ? String(body.at) : '', quoteId: body.quoteId || '' };
      await adapter.sendText({ type: chat.type, targetId: chat.targetId }, trimmed, sendOpts);
      // 多数 OneBot 实现（SnowLuma / NapCat）默认不上报自己发送的消息，
      // 这里补一条本地回显，保证网页端能立即看到自己发出的内容
      const echoMsg = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        chatType: chat.type,
        chatId: String(chat.targetId),
        chatName: chat.name,
        fromId: String(adapter.self?.userId || ''),
        fromName: adapter.self?.nickname || '我',
        self: true,
        text: trimmed,
        raw: trimmed,
        mentionsMe: false,
        mentions: 0,
        time: Date.now()
      };
      store.addMessage(echoMsg);
      const updated = store.chats.get(chatId) || chat;
      broadcast({ type: 'message', message: echoMsg, chat: updated });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (p === '/api/chat/read' && req.method === 'POST') {
    const body = await readBody(req);
    store.markRead(body.chatId);
    const chat = store.chats.get(body.chatId);
    return sendJson(res, 200, { ok: true, chat });
  }

  if (p === '/api/settings') {
    // 读=GET、写=POST（内层已限定），其他方法不放行
    if (req.method === 'GET') {
      const c = configLib.get();
      // 不回传明文 Key，只回传是否已配置
      return sendJson(res, 200, {
        server: c.server,
        qq: c.qq,
        ai: { ...c.ai, apiKey: c.ai.apiKey ? '********' : '', hasKey: !!c.ai.apiKey }
      });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const patch = {};
      if (body.ai) {
        patch.ai = { ...body.ai };
        if (!body.ai.apiKey || body.ai.apiKey === '********') patch.ai.apiKey = configLib.get().ai.apiKey;
      }
      if (body.qq) patch.qq = body.qq;
      configLib.save(patch);
      if (patch.ai) {
        const c = configLib.get();
        deepseek.configure({
          site: c.ai.webProvider || 'deepseek',   // 网页版站点档案见 server/web-sites.js
          prompt: ai._fullPrompt(),   // 用户人设 +【表情包能力】段（与启动/新建对话同源）
          maxRounds: c.ai.webMaxRounds ?? 50,
          port: c.ai.cdpPort,
          browserPath: c.ai.browserPath
        });
      }
      broadcast({ type: 'settings_changed', ai: ai.status(), qq: qqStatus });
      return sendJson(res, 200, { ok: true });
    }
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '仅支持 GET / POST' }));
    return;
  }

  /* ---------------- 网页版模型（切换模型） ---------------- */
  if (p === '/api/web/sites' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, sites: siteList(), current: deepseek.status().site });
  }

  if (p === '/api/web/open' && req.method === 'POST') {
    const body = await readBody(req);
    const site = String(body.site || '').trim();
    if (site) deepseek.configure({ site });
    const st = deepseek.status();
    const okOpen = await deepseek.openPage();
    return sendJson(res, 200, { ok: !!okOpen, site: st.site, siteName: st.siteName, url: st.siteUrl });
  }

  if (p === '/api/ai/toggle' && req.method === 'POST') {
    const body = await readBody(req);
    configLib.save({ ai: { enabled: !!body.enabled } });
    broadcast({ type: 'settings_changed', ai: ai.status(), qq: qqStatus });
    return sendJson(res, 200, { ok: true, ai: ai.status() });
  }

  if (p === '/api/mock/incoming' && req.method === 'POST') {
    if (cfg.qq.mode !== 'mock') return sendJson(res, 400, { error: '非演示模式' });
    const body = await readBody(req);
    const chat = store.chats.get(body.chatId);
    adapter.simulateIncoming(chat?.type || 'private', chat?.targetId || body.chatId || '10001');
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/ai/deepseek/status' && req.method === 'GET') {
  return sendJson(res, 200, deepseek.status());
}

if (p === '/api/ai/deepseek/open' && req.method === 'POST') {
  const ok = await deepseek.openPage();
  return sendJson(res, 200, { ok, status: deepseek.status() });
}

if (p === '/api/ai/deepseek/new' && req.method === 'POST') {
  const ok = await deepseek.newConversation();
  broadcast({ type: 'deepseek_status', status: deepseek.status() });
  return sendJson(res, 200, { ok });
}

if (p === '/api/ai/deepseek/test' && req.method === 'POST') {
  try {
    const body = await readBody(req);
    const text = body.text || '用一句话跟朋友说你晚上有空吃饭。';
    const started = Date.now();
    const reply = await deepseek.ask(text);
    return sendJson(res, 200, { ok: true, reply, ms: Date.now() - started });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message, status: deepseek.status() });
  }
}

if (p === '/api/dev/ai-reply' && req.method === 'POST') {
    // 本地调试用：模拟一条"对方发来的消息"，跑通 消息 → DeepSeek 网页版 → 回发 QQ 全链路
    const body = await readBody(req);
    const chatId = String(body.chatId || '');
    if (!chatId) return sendJson(res, 400, { error: '缺少 chatId（如 private:12345 / group:67890）' });
    const chat = store.chats.get(chatId);
    if (!chat) return sendJson(res, 404, { error: '会话不存在' });
    const synthetic = {
      id: `dev-${Date.now()}`,
      chatType: chat.type,
      chatId: String(chat.targetId),
      chatName: chat.name,
      fromId: body.fromId ? String(body.fromId) : 'dev-tester',
      fromName: body.fromName || '测试消息',
      self: false,
      text: body.text || (body.imageUrl ? '' : '在吗？晚上有空一起吃饭吗'),
      raw: body.text || '',
      mentionsMe: body.mentionsMe !== false,   // 传 {mentionsMe:false} 可测群聊规则（@/概率/关键词闸门）
      mentions: body.mentionsMe !== false ? 1 : 0,
      images: body.imageUrl ? [String(body.imageUrl)] : [],
      time: Date.now()
    };
    store.addMessage(synthetic);
    broadcast({ type: 'message', message: synthetic, chat });
    const reply = await ai.handle(synthetic);
    return sendJson(res, 200, { ok: true, handled: true, ai: ai.status() });
  }

if (p === '/api/qq/reconnect' && req.method === 'POST') {
    try { adapter.close(); } catch { /* noop */ }
    setTimeout(() => adapter.connect(), 300);
    return sendJson(res, 200, { ok: true });
  }

  /* ---------------- 表情包 API ---------------- */
  if (p === '/api/stickers' && req.method === 'GET') {
    const st = stickerLib.stats();
    const items = stickerLib.list(40).map((x) => ({
      key: x.key,
      kind: x.kind,
      text: x.kind === 'mface'
        ? String(x.text || x.emojiId)
        : (String(x.url || '').match(/fileid=([^&]+)/) ? 'fileid …' + String(x.url).match(/fileid=([^&]+)/)[1].slice(-22) : String(x.url || '').slice(-46)),
      local: !!x.file,
      count: x.count || 1,
      seenAt: x.seenAt || 0
    }));
    return sendJson(res, 200, { ok: true, ...st, items });
  }

  // 缩略图：发本地副本（QQ 图链会过期，面板必须永远能看）
  if (p === '/api/stickers/img' && req.method === 'GET') {
    const key = new URL(req.url, 'http://localhost').searchParams.get('key') || '';
    const item = stickerLib.get(key);
    const m = item && item.file && String(item.file).match(/^([a-f0-9]{16,32})\.(png|jpe?g|gif|webp)$/i);
    if (!m) return sendJson(res, 404, { error: '该素材没有本地副本' });
    const abs = path.join(stickerLib.cacheDir, item.file);
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[m[2].toLowerCase()] || 'application/octet-stream';
    fs.readFile(abs, (err, buf) => {
      if (err) return sendJson(res, 404, { error: '本地副本不存在' });
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length });
      res.end(buf);
    });
    return;
  }

  if (p === '/api/stickers' && req.method === 'DELETE') {
    const body = await readBody(req);
    const gone = stickerLib.remove(String(body.key || ''));
    if (!gone) return sendJson(res, 404, { error: '没有这条素材' });
    return sendJson(res, 200, { ok: true, count: stickerLib.stats().count });
  }

  if (p === '/api/stickers/clear' && req.method === 'POST') {
    const removed = stickerLib.clear();
    return sendJson(res, 200, { ok: true, removed });
  }

  if (p === '/api/stickers/test' && req.method === 'POST') {
    const body = await readBody(req);
    const st = stickerLib.stats();
    if (!st.count) {
      return sendJson(res, 400, {
        error: '素材库是空的——先给机器人丢几个表情包（私聊发给它、或在群里发），它会自动收藏，然后就能发了'
      });
    }
    // 测试发给"指令发送人"名单里的主人 QQ；没配就发给机器人自己
    const owner = String(configLib.get().ai?.commandSenders || '').split(/[,，;；\s]+/).filter(Boolean)[0];
    const target = owner || String(adapter.self?.userId || '');
    if (!target) return sendJson(res, 400, { error: 'QQ 未连接' });
    const kw = String(body.keyword || '').trim().slice(0, 24);
    const pick = stickerLib.pick(kw);
    const okSend = await stickerLib.send({ type: 'private', targetId: target }, pick);
    if (!okSend) return sendJson(res, 500, { error: '发送失败（看日志：可能图链失效）' });
    return sendJson(res, 200, {
      ok: true,
      sent: { kind: pick.kind, text: pick.text || pick.emojiId || '图片' },
      to: 'private:' + target
    });
  }

  return sendJson(res, 404, { error: 'unknown api' });
}

/* ---------------- 启动 ---------------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.warn('[http] api 出错:', err);
      if (!res.headersSent) sendJson(res, 500, { error: err.message });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(cfg.server.port, cfg.server.host, () => {
  const url = `http://${cfg.server.host}:${cfg.server.port}`;
  console.log('--------------------------------------------------');
  console.log('  网页版 QQ 助手已启动');
  console.log(`  地址：${url}`);
  console.log(`  QQ 接入模式：${cfg.qq.mode === 'onebot' ? `OneBot 11 (${cfg.qq.onebot.wsUrl})` : '演示模式（模拟消息）'}`);
  console.log(`  AI 自动回复：${ai.status().provider}`);
  console.log('--------------------------------------------------');
  adapter.connect();
});

// 定时心跳事件，便于前端确认连接
setInterval(() => broadcast({ type: 'ping', t: Date.now() }), 30000).unref?.();

const shutdown = () => {
  console.log('\n退出中…');
  try { adapter.close(); } catch { /* noop */ }
  try { store.save(); } catch { /* noop */ }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);