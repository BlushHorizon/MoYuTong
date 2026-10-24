'use strict';
/**
 * 表情包（内置功能）
 * ---------------------------------------------------------------------------
 * - 自动收集：所有进来的消息里，商城表情(mface)与图片都会记进 data/stickers.json
 * - AI 发送：AI 回复里出现 [表情] 或 [表情:关键词] 标记时，自动从素材库挑一个
 *   跟在文字后面发出去；标记本身从回复文本里剥掉（AI 只按提示词写标记，
 *   不需要知道任何技术细节）。
 * - 冷却：默认 40 秒一张，防止 AI 上头刷屏（QQ 对高频发图会判骚扰 result=120）。
 * mface 用 emoji_id 永久有效；图片表情用 URL 重发（QQ 图链有时效，失效自动回退冷却）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic, readJson } = require('./atomic');
const http = require('http');
const https = require('https');

// 标记：[表情] 或 [表情:关键词]（关键词限 1-24 字符，不能含 ] 【 [）
const MARKER_RE = /\s*\[表情(?::\s*([^\]【\[]{1,24}))?\]\s*/g;

// 一条回复最多兑现几个标记（防呆上限；提示词引导 AI 一般写三四个）
const MAX_PER_REPLY = 5;

/** 按魔数识别图片格式（缓存文件后缀、缩略图 MIME 都靠它） */
function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'jpg';
}

class StickerLibrary {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir  数据目录（stickers.json 落这里）
   * @param {object} opts.adapter  qq-adapter（sendSegments 发表情）
   * @param {(t:string)=>void} [opts.log]
   */
  constructor({ dataDir, adapter, log, gallery }) {
    this.file = path.join(dataDir, 'stickers.json');
    this.cacheDir = path.join(dataDir, 'stickers'); // 本地副本目录（QQ 图链会过期，这里永不过期）
    this.adapter = adapter;
    this.log = log || (() => {});
    this.gallery = gallery || null; // 可选：在线图库（OnlineGallery），本地挑不到时兜底
    this._lib = null;            // 懒加载
    this._lastSentAt = 0;
    this._cooldownMs = 40 * 1000;
    this._caching = new Set();   // 正在后台下载的 key（防重复拉）
  }

  /** 运行期接上在线图库（server.js 里创建顺序靠后就晚绑） */
  setGallery(g) {
    this.gallery = g || null;
  }

  _load() {
    if (this._lib) return this._lib;
    try {
      this._lib = readJson(this.file) || {};
    } catch {
      // 主文件坏了 → 试试上次原子写留下的临时文件
      try { this._lib = readJson(this.file + '.tmp') || {}; this.log('素材库主文件损坏，已从临时文件恢复'); }
      catch { this._lib = {}; }
    }
    return this._lib;
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // 原子写：被强杀时不会留下半截 JSON 把整个表情库清空
      writeFileAtomic(this.file, JSON.stringify(this._lib, null, 2));
    } catch (e) {
      this.log('素材库写入失败: ' + e.message);
    }
  }

  /** 素材数量（/状态 展示用） */
  count() {
    return Object.keys(this._load()).length;
  }

  /** 统计（网页面板用） */
  stats() {
    const items = Object.values(this._load());
    return {
      count: items.length,
      mface: items.filter((x) => x.kind === 'mface').length,
      image: items.filter((x) => x.kind === 'image').length
    };
  }

  /** 最近的素材列表（网页面板用）——带 key 供删除定位 */
  list(limit = 40) {
    return Object.entries(this._load()).slice(-limit).reverse().map(([key, v]) => ({ key, ...v }));
  }

  /** 删除一条素材（管理员在面板操作）；返回被删素材，不存在返回 null */
  remove(key) {
    const lib = this._load();
    const k = String(key || '');
    if (!lib[k]) return null;
    const item = lib[k];
    this._dropEntry(lib, k);
    this._save();
    this.log(`管理员删除素材「${k.slice(-40)}」（库剩 ${Object.keys(lib).length} 个）`);
    return item;
  }

  /** 清空整个素材库（管理员在面板操作）；返回删除条数，本地副本一并清掉 */
  clear() {
    const n = this.count();
    try { fs.rmSync(this.cacheDir, { recursive: true, force: true }); } catch { /* 目录不在就算了 */ }
    this._lib = {};
    this._save();
    if (n) this.log(`管理员清空素材库（删了 ${n} 个，本地副本已清）`);
    return n;
  }

  /**
   * 图片素材的去重键：剔除会过期换值的参数（rkey/sign 等），保留身份参数（fileid 等）。
   * QQ 图链的身份全在 query 里——之前用"去 query 的 URL"当键，36 张不同的图
   * 全坍缩成 1 条记录；现在同图换 rkey 仍算同一张（count+1），不同图各自独立。
   */
  _imageKey(url) {
    const s = String(url);
    try {
      const u = new URL(s);
      const keep = [...u.searchParams.entries()]
        .filter(([k]) => !/^(rkey|sign|sig|signature|expires|token|ts|tk)$/i.test(k))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      return 'i:' + u.host + u.pathname + (keep ? '?' + keep : '');
    } catch {
      return 'i:' + s.split('?')[0].slice(-90);
    }
  }

  /** 按 key 取素材（面板缩略图路由、管理删除都用它） */
  get(key) {
    return this._load()[String(key || '')] || null;
  }

  /**
   * 后台把图片表情下载一份到本地缓存。
   * 图链会过期：面板缩略图要一直能看、发送不再依赖 QQ CDN，都靠这份本地副本。
   */
  _cacheAsync(key, url) {
    if (this._caching.has(key)) return;
    this._caching.add(key);
    this._fetchImage(url).then((buf) => {
      this._caching.delete(key);
      if (!buf || !buf.length) return; // 拉不下来就先放着（原链还能发；发送失败会自动剔除）
      const name = crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 24) + '.' + sniffImageExt(buf);
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        fs.writeFileSync(path.join(this.cacheDir, name), buf);
      } catch { return; }
      const lib = this._load();
      if (lib[key] && !lib[key].file) {
        lib[key].file = name;
        this._save();
        this.log(`已缓存表情包本地副本（${buf.length}B → ${name}）`);
      }
    });
  }

  /** 下载图片（8 秒超时、8MB 上限）；失败返回 null */
  _fetchImage(url) {
    return new Promise((resolve) => {
      let mod;
      try { mod = /^https:/i.test(url) ? https : http; } catch { return resolve(null); }
      const req = mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null); }
        const chunks = [];
        let n = 0;
        res.on('data', (c) => {
          n += c.length;
          if (n > 8 * 1024 * 1024) { req.destroy(); resolve(null); } else chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  /** 每条来信顺手收集素材（mface + 普通图片） */
  collect(msg) {
    if (!msg || msg.self || msg.system) return;
    const picks = [];
    for (const s of msg.stickers || []) {
      if (!s.emojiId) continue;
      picks.push({ kind: 'mface', emojiId: s.emojiId, packageId: s.packageId, key: s.key, text: s.text });
    }
    // 普通图片也入库（QQ 表情包很多就是一张图）；&amp; 残留再兜一道底
    for (const u of msg.images || []) {
      picks.push({ kind: 'image', url: String(u).replace(/&amp;/g, '&') });
    }
    if (!picks.length) return;
    const lib = this._load();
    let fresh = 0;
    for (const p of picks) {
      const key = p.kind === 'mface' ? 'm:' + p.emojiId : this._imageKey(p.url);
      if (lib[key]) {
        lib[key].count = (lib[key].count || 1) + 1;
        lib[key].seenAt = Date.now();
        // 老条目没有本地副本的，补拉一份（后台进行，不挡收集）
        if (p.kind === 'image' && !lib[key].file) this._cacheAsync(key, p.url);
      } else {
        lib[key] = { ...p, count: 1, seenAt: Date.now() };
        if (p.kind === 'image') this._cacheAsync(key, p.url); // 后台存本地副本
        fresh++;
      }
    }
    if (fresh) this.log(`新收 ${fresh} 个表情素材（库共 ${Object.keys(lib).length} 个）`);
    this._save();
  }

  /**
   * 按关键词挑一个（关键词命中描述优先；命不中/留空退随机；库空返回 null）。
   * exclude：随机挑选时排除已选的（池子够大就去重；命中同一关键词允许重复——三连是刻意的）。
   */
  pick(keyword, exclude) {
    const items = Object.values(this._load());
    if (!items.length) return null;
    let pool = items;
    const kw = String(keyword || '').trim().toLowerCase();
    if (kw) {
      const hit = items.filter((it) => String(it.text || '').toLowerCase().includes(kw));
      if (hit.length) pool = hit;
    } else if (exclude && exclude.size && pool.length > exclude.size) {
      pool = pool.filter((it) => !exclude.has(it));
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** 剥掉回复里的表情标记，返回 { text, keywords }（不改任何状态） */
  parseReply(reply) {
    let text = String(reply || '');
    const keywords = [];
    text = text.replace(MARKER_RE, (m, kw) => {
      keywords.push(kw ? kw.trim() : '');
      return m.includes('\n') ? '\n' : ' '; // 独占一行的标记保留换行
    });
    text = text
      .replace(/[ \t]{2,}/g, ' ')
      // 标点贴合：剥完标记不留"字 ！"这种空格
      .replace(/\s+([，。！？…、；：,.!?;:）)】》」』])/g, '$1')
      .replace(/([（【《「『(\[])\s+/g, '$1')
      .replace(/^[ \t\n]+|[ \t\n]+$/g, '');
    return { text: text.trim(), keywords };
  }

  /** 冷却中？（发过之后一段时间内不再打扰） */
  get cooling() {
    return Date.now() - this._lastSentAt < this._cooldownMs;
  }

  /**
   * 处理 AI 回复文本：剥掉全部表情标记，返回 { text, stickers }。
   * 一条回复里的所有标记都兑现（最多 MAX_PER_REPLY 个）；stickers 受冷却限制——
   * 冷却中或库里没有就只发文字（宁缺勿滥）。**只看本地素材库**（群友发过的）。
   */
  takeFromReply(reply) {
    const { text, keywords } = this.parseReply(reply);
    if (!keywords.length) return { text, stickers: [] };
    if (this.cooling) {
      this.log(`想发 ${keywords.length} 个表情包「${keywords.join('/') || '随机'}」但还在冷却（${Math.round(this._cooldownMs / 1000)}s），跳过`);
      return { text, stickers: [] };
    }
    const picks = [];
    const used = new Set();
    for (const kw of keywords.slice(0, MAX_PER_REPLY)) {
      const p = this.pick(kw, used);
      if (p) { picks.push(p); used.add(p); }
    }
    if (!picks.length) {
      this.log(`标记「${keywords.join('/') || '随机'}」但本地表情库是空的`);
      return { text, stickers: [] };
    }
    this._lastSentAt = Date.now();
    return { text, stickers: picks };
  }

  /**
   * 严格版 pick：有关键词时必须真的命中描述，命不中返回 null（不退回随机）。
   * 给「本地挑不到就去在线图库」用——不然本地随便给一张，在线图库永远轮不上。
   * 关键词为空时仍是随机。
   */
  pickStrict(keyword, exclude) {
    const kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return this.pick('', exclude);
    const hit = Object.values(this._load()).filter((it) => String(it.text || '').toLowerCase().includes(kw));
    if (!hit.length) return null;
    let pool = hit;
    if (exclude && exclude.size) {
      const rest = pool.filter((it) => !exclude.has(it));
      if (rest.length) pool = rest;
    }
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  /**
   * 同上，但本地素材库挑不到时去在线图库（梗鲸 DeepSeek娘）按描述找一张，
   * 下载到本地缓存后作为 image 段发出。在线图库不可用时自动退化成文字回复。
   * @returns {Promise<{text:string, stickers:Array}>}
   */
  async takeFromReplyAsync(reply) {
    const { text, keywords } = this.parseReply(reply);
    if (!keywords.length) return { text, stickers: [] };
    const wants = keywords.slice(0, MAX_PER_REPLY);
    if (keywords.length > MAX_PER_REPLY) {
      this.log(`标记 ${keywords.length} 个，超过上限按 ${MAX_PER_REPLY} 个兑现`);
    }
    // 冷却期内连本地都不发，更不必去下载，先挡住省流量
    if (this.cooling) {
      this.log(`想发 ${wants.length} 个表情包「${wants.join('/') || '随机'}」但还在冷却（${Math.round(this._cooldownMs / 1000)}s），跳过`);
      return { text, stickers: [] };
    }

    const picks = [];
    const usedLocal = new Set();
    const usedOnline = new Set();
    const online = this.gallery && this.gallery.stats().count ? this.gallery : null;

    // 先本地（同步、零网络），**严格匹配**命不中才去在线图库
    const pending = [];
    for (const kw of wants) {
      const p = this.pickStrict(kw, usedLocal);
      if (p) { picks.push(p); usedLocal.add(p); continue; }
      if (online) pending.push(kw);
    }

    if (pending.length) {
      const fetched = await Promise.all(pending.map(async (kw) => {
        try {
          // strict：关键词匹配不上就别硬塞一张无关图（随机标记 '' 仍会随机取）
          const item = online.pick(kw, usedOnline, { strict: true });
          if (!item) { this.log(`在线图库没有匹配「${kw}」的图`); return null; }
          usedOnline.add(item);
          const abs = await online.ensureLocal(item);
          return { kind: 'image', file: abs, text: `${item.title}（在线图库 #${item.id}）`, galleryId: item.id };
        } catch (e) {
          this.log(`在线图库取图失败「${kw || '随机'}」：${e.message}`);
          return null;
        }
      }));
      for (const p of fetched) if (p) picks.push(p);
    }

    if (!picks.length) {
      this.log(`标记「${keywords.join('/') || '随机'}」但本地和在线图库都没有可用素材，跳过`);
      return { text, stickers: [] };
    }
    this._lastSentAt = Date.now();
    return { text, stickers: picks };
  }

  /** 一个素材 → OneBot 段数组 */
  _segments(pick) {
    if (pick.kind === 'mface') {
      // SnowLuma OneBot 出站段字段为蛇形命名（emoji_id 是 32 位十六进制必填）
      const data = { emoji_id: pick.emojiId };
      if (pick.packageId) data.emoji_package_id = pick.packageId;
      if (pick.key) data.key = pick.key;
      if (pick.text) data.summary = pick.text;
      return [{ type: 'mface', data }];
    }
    // 有本地副本就发本地文件（QQ 图链会过期；本地路径真机验证可直发）
    if (pick.file) {
      // 在线图库给的是绝对路径，素材库给的是 cacheDir 里的文件名
      const abs = path.isAbsolute(String(pick.file)) ? String(pick.file) : path.join(this.cacheDir, pick.file);
      if (fs.existsSync(abs)) return [{ type: 'image', data: { file: abs } }];
    }
    return [{ type: 'image', data: { file: pick.url } }];
  }

  /** 删除素材并顺手删掉它的本地副本 */
  _dropEntry(lib, k) {
    const v = lib[k];
    delete lib[k];
    if (v && v.file) {
      try { fs.unlinkSync(path.join(this.cacheDir, v.file)); } catch { /* 文件不在了就算了 */ }
    }
  }

  /** 剔除失效素材（图链过期等） */
  _prune(pick) {
    const lib = this._load();
    for (const [k, v] of Object.entries(lib)) {
      if (v === pick) {
        this._dropEntry(lib, k);
        this.log(`图链失效，已剔除素材「${k.slice(-30)}」（库剩 ${Object.keys(lib).length} 个）`);
      }
    }
    this._save();
  }

  /**
   * 把多个表情包打进【一条】消息发出（OneBot 一次调用 = 一条消息，天然不算刷屏）。
   * 成功返回 true。
   */
  async sendBatch(chat, picks) {
    if (!Array.isArray(picks) || !picks.length) return false;
    const segs = [];
    for (const p of picks) segs.push(...this._segments(p));
    try {
      await this.adapter.sendSegments(chat, segs);
      const label = picks.map((p) => p.text || (p.kind === 'mface' ? p.emojiId : '图片')).join('、');
      this.log(`发出表情包 x${picks.length}「${label}」→ ${chat.type}:${chat.targetId}`);
      return true;
    } catch (e) {
      this._lastSentAt = 0; // 发送失败回退冷却，下次还有机会
      // 图片素材拉不下来（QQ 图链过期，OneBot 报 download failed）→ 剔除，别反复踩坑
      if (/download failed/i.test(String(e.message || ''))) {
        for (const p of picks) if (p.kind === 'image') this._prune(p);
      }
      this.log('表情包发送失败: ' + e.message);
      return false;
    }
  }

  /** 发单个表情包（sendBatch 的便捷包装）；成功返回 true */
  async send(chat, pick) {
    if (!pick) return false;
    return this.sendBatch(chat, [pick]);
  }
}

/**
 * 专属提示词：AI 的「表情包能力说明书」。
 * 自动追加在用户自己写的提示词之后——用户改人设不会弄丢这段，
 * AI 也因此明确知道：有这本事、怎么触发、什么时候该用什么时候别用。
 */
const MATERIAL_WITH_GALLERY = `素材有两处：群里大家发过的表情包，以及在线图库「梗鲸 · DeepSeek娘」——收录了几千张 DeepSeek 相关的表情图（开心、震惊、无语、摆烂、加油、睡觉、生气、害羞、求饶、摸鱼……各种情绪和动作都有）。关键词写情绪、动作或画面都行，系统会先翻群里的，翻不到再按描述去在线图库取一张。`;
const MATERIAL_LOCAL_ONLY = `素材来自群里大家发过的表情包，关键词写情绪或画面都行，翻不到会自动换成随机一张。`;

/**
 * 拼出「表情包能力说明书」。
 * @param {number} galleryCount 在线图库可用张数；0 表示图库不可用，只说群里的素材
 */
function buildStickerPrompt(galleryCount = 0) {
  const material = galleryCount > 0 ? MATERIAL_WITH_GALLERY : MATERIAL_LOCAL_ONLY;
  return `
【表情包能力】
你有发表情包的本领，会在聊天里根据情况自己发表情包：
- 想发表情包时，在回复里写一个标记：[表情] 表示随机来一个；[表情:关键词] 表示按关键词挑（比如 [表情:笑]、[表情:猫]、[表情:哭]、[表情:无语]）。${material}
- 标记不会显示给对方：系统收到你的回复后会自动把合适表情包发出去，并把标记从文字里删掉。标记写在想让表情包出现的那句话后面就行。
- 什么时候发由你看着办：开心/无语/赞同/吐槽/安慰/接梗这种带情绪的场合就发，让聊天更生动；纯通知、严肃话题、正经道歉不要发；想连发就连续写标记（比如 [表情:笑][表情:笑][表情:笑] 三连很有节目效果），一条回复最多写三四个，别排一长串；大部分回复正常说话，别每条都带。
- 有人明确要你发表情包（比如"发个表情包""来个表情"）时，一定要用标记回应——可以只回标记不带字，让表情包替你说话。
- 不要编造标记以外的发送方式，QQ 自带的基础表情不在此列。`.trim();
}

// 兜底常量：图库数量未知时用（群友素材版），老代码引用它也不至于报错
const STICKER_ABILITY_PROMPT = buildStickerPrompt(0);

module.exports = { StickerLibrary, STICKER_ABILITY_PROMPT, buildStickerPrompt, MAX_PER_REPLY };
