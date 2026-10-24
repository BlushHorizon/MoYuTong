'use strict';
/**
 * 在线表情图库（梗鲸 · aigengtu.com）
 * ---------------------------------------------------------------------------
 * 内置素材库（stickers.js）只能收群里出现过的表情；这里补一个"网上现成的"：
 * 启动后自动拉取梗鲸的 DeepSeek娘图库目录（约 2300 张，每张带一句台词级描述），
 * AI 回复里写 [表情:关键词] 时优先在群里素材里找，找不到就到这边按描述匹配，
 * 命中就下载原图直接发出去。
 *
 * 设计要点：
 * - 目录只在本地缓存（data/gallery.json），7 天或手动刷新才重新拉，别每次启动都打扰对方站点；
 * - 图库是"只读远端"：不发 README、不镜像整套图，用到哪张下哪张，下载后落 data/stickers 复用现有缓存目录；
 * - 站点不可达/改版时静默降级，绝不影响 QQ 主流程（下拉失败就当作没这功能）。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { writeFileAtomic, readJson } = require('./atomic');

const SOURCE = {
  id: 'gengjing-deepseek',
  name: '梗鲸 · DeepSeek娘',
  site: 'https://aigengtu.com',
  listUrl: 'https://aigengtu.com/DeepSeek%E5%A8%98',
  // 列表页里每张图：<a class="card" href="/zh/meme/001" title="…"><img src="https://img.aigengtu.com/0_preview/meme/001.webp">
  cardRe: /<a class="card" href="\/zh\/meme\/(\d+)" title="([^"]*)"><img src="([^"]*)"/g,
  // 原图：预览图把 /0_preview/ 去掉即可（实测 200，体积约两倍）
  originalFromPreview: (preview) => String(preview).replace('img.aigengtu.com/0_preview/', 'img.aigengtu.com/')
};

const REFRESH_MS = 7 * 24 * 3600 * 1000; // 目录 7 天过期
const MAX_BYTES = 8 * 1024 * 1024;       // 单张上限，和本地素材库一致

/** 常见 HTML 实体解码（站点标题里带 &quot; 之类） */
function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** 一次性 GET（跟随最多 3 次跳转），返回 { status, buf } */
function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    const go = (u, hop) => {
      let mod;
      try { mod = /^https:/i.test(u) ? https : require('http'); } catch { return reject(new Error('bad url')); }
      const req = mod.get(u, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (QunZai)' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hop < 3) {
          res.resume();
          return go(new URL(res.headers.location, u).toString(), hop + 1);
        }
        const chunks = [];
        let n = 0;
        res.on('data', (c) => {
          n += c.length;
          if (n > MAX_BYTES + 4 * 1024 * 1024) { req.destroy(); reject(new Error('响应过大')); } else chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    };
    go(url, 0);
  });
}

class OnlineGallery {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir    数据目录（gallery.json 落这里）
   * @param {string} opts.cacheDir   图片缓存目录（与本地素材库共用）
   * @param {(t:string)=>void} [opts.log]
   */
  constructor({ dataDir, cacheDir, log }) {
    this.dataDir = path.resolve(dataDir);
    this.cacheDir = path.resolve(cacheDir);
    this.file = path.join(this.dataDir, 'gallery.json');
    this.log = log || (() => {});
    this._data = null;        // { fetchedAt, source, items: [{ id, title, img, orig }] }
    this._byId = new Map();
    this._busy = null;        // 正在刷新时的 Promise（并发合并）
    this._files = new Map();  // id -> 本地文件名（进程内缓存，避免反复 stat）
  }

  _load() {
    if (this._data) return this._data;
    try {
      const d = readJson(this.file);
      if (d && Array.isArray(d.items)) {
        this._data = d;
        for (const it of d.items) this._byId.set(it.id, it);
      }
    } catch { /* 首次运行或文件损坏：当作空，等刷新 */ }
    if (!this._data) this._data = { fetchedAt: 0, source: SOURCE.name, items: [] };
    return this._data;
  }

  _save() {
    try { writeFileAtomic(this.file, JSON.stringify(this._data)); } catch (e) { this.log('目录写入失败: ' + e.message); }
  }

  /** 当前状态（网页面板用） */
  stats() {
    const d = this._load();
    return {
      count: d.items.length,
      source: d.source || SOURCE.name,
      site: SOURCE.site,
      fetchedAt: d.fetchedAt || 0,
      ageDays: d.fetchedAt ? Math.floor((Date.now() - d.fetchedAt) / 86400000) : null,
      refreshing: !!this._busy
    };
  }

  /** 是否需要刷新（从没拉过 / 过期 / 强制） */
  stale(force) {
    const d = this._load();
    return force || !d.items.length || Date.now() - (d.fetchedAt || 0) > REFRESH_MS;
  }

  /**
   * 拉取目录（并发调用会复用同一个请求）。失败时保留旧目录不破坏现状。
   * @param {boolean} [force]
   * @returns {Promise<{ ok:boolean, count:number, error?:string }>}
   */
  refresh(force) {
    if (this._busy) return this._busy;
    if (!this.stale(force)) return Promise.resolve({ ok: true, count: this._load().items.length, cached: true });
    this._busy = (async () => {
      try {
        this.log('正在拉取在线表情图库目录…');
        const res = await fetchOnce(SOURCE.listUrl);
        if (res.status !== 200) throw new Error('HTTP ' + res.status);
        const html = res.buf.toString('utf8');
        const items = [];
        const seen = new Set();
        let m;
        SOURCE.cardRe.lastIndex = 0;
        while ((m = SOURCE.cardRe.exec(html))) {
          const id = m[1];
          if (seen.has(id)) continue;
          seen.add(id);
          const preview = decodeEntities(m[3]);
          items.push({ id, title: decodeEntities(m[2]), img: preview, orig: SOURCE.originalFromPreview(preview) });
        }
        if (!items.length) throw new Error('页面里没解析到图片（站点可能改版）');
        this._data = { fetchedAt: Date.now(), source: SOURCE.name, items };
        this._byId = new Map(items.map((x) => [x.id, x]));
        this._files.clear();
        this._save();
        this.log(`在线表情图库就绪：${items.length} 张（${SOURCE.name}）`);
        return { ok: true, count: items.length };
      } catch (e) {
        this.log('在线表情图库拉取失败（不影响聊天）：' + e.message);
        return { ok: false, count: this._load().items.length, error: e.message };
      } finally {
        this._busy = null;
      }
    })();
    return this._busy;
  }

  /** 后台预热：启动时调用，过期才真去拉 */
  warm() {
    if (!this.stale(false)) return;
    this.refresh(false).catch(() => { /* refresh 内部已兜底 */ });
  }

  /**
   * 按描述挑：先整句包含，再退到逐字命中（要求命中字数过半，避免「求饶」匹配到
   * 只含一个「求」字的无关图）。真的一个都对不上：strict 模式返回 null，否则随机。
   * @param {string} keyword
   * @param {Set} [exclude] 本次已经挑过的，尽量别重复
   * @param {{strict?:boolean}} [opts]
   */
  pick(keyword, exclude, opts) {
    const items = this._load().items;
    if (!items.length) return null;
    const strict = !!(opts && opts.strict);
    let pool = items;
    let matched = false;
    const kw = String(keyword || '').trim().toLowerCase();
    if (kw) {
      const hit = items.filter((it) => String(it.title || '').toLowerCase().includes(kw));
      if (hit.length) { pool = hit; matched = true; }
      else {
        // 关键词可能是多个字：「无语流泪」→ 拆成单字都试一遍，命中越多越靠前。
        // 只对 2–4 字的短词降级：长短语拆字会把「不存在的词」拆成一堆常见字乱命中。
        const chars = [...kw].filter((c) => !/\s/.test(c));
        if (chars.length >= 2 && chars.length <= 4) {
          const need = Math.max(2, Math.ceil(chars.length * 0.5));
          const scored = items
            .map((it) => {
              const t = String(it.title || '').toLowerCase();
              let score = 0;
              for (const c of chars) if (t.includes(c)) score++;
              return { it, score };
            })
            .filter((x) => x.score >= need)
            .sort((a, b) => b.score - a.score);
          if (scored.length) { pool = scored.map((x) => x.it); matched = true; }
        }
      }
      if (!matched && strict) return null;
    }
    if (exclude && exclude.size) {
      const rest = pool.filter((it) => !exclude.has(it));
      if (rest.length) pool = rest;
    }
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  /** 本地缓存文件名（有就复用，没有就下载） */
  async ensureLocal(item) {
    const hit = this._files.get(item.id);
    if (hit) {
      const abs = path.join(this.cacheDir, hit);
      if (fs.existsSync(abs)) return abs;
      this._files.delete(item.id);
    }
    // 缓存文件名按 id 走，避免同一张图重复下载
    for (const ext of ['webp', 'png', 'jpg', 'gif']) {
      const name = `gallery-${item.id}.${ext}`;
      const abs = path.join(this.cacheDir, name);
      if (fs.existsSync(abs) && fs.statSync(abs).size > 0) { this._files.set(item.id, name); return abs; }
    }
    const urls = [item.orig, item.img].filter(Boolean);
    let lastErr = null;
    for (const u of urls) {
      try {
        const res = await fetchOnce(u);
        if (res.status !== 200 || !res.buf.length) throw new Error('HTTP ' + res.status);
        const ext = sniffExt(res.buf);
        const name = `gallery-${item.id}.${ext}`;
        writeFileAtomicBuffer(path.join(this.cacheDir, name), res.buf);
        this._files.set(item.id, name);
        return path.join(this.cacheDir, name);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('下载失败');
  }

  /** 从缓存目录反查（面板缩略图用；不下网络） */
  cachedPath(id) {
    for (const ext of ['webp', 'png', 'jpg', 'gif']) {
      const abs = path.join(this.cacheDir, `gallery-${id}.${ext}`);
      if (fs.existsSync(abs) && fs.statSync(abs).size > 0) return abs;
    }
    return null;
  }

  /** 按 id 取一条（面板缩略图用） */
  get(id) {
    this._load();
    return this._byId.get(String(id)) || null;
  }

  /** 面板列表：按关键词过滤，返回前 limit 条 */
  list(keyword, limit = 60) {
    const items = this._load().items;
    const kw = String(keyword || '').trim().toLowerCase();
    const pool = kw ? items.filter((it) => String(it.title || '').toLowerCase().includes(kw)) : items;
    return pool.slice(0, limit).map((it) => ({ id: it.id, title: it.title, local: !!this.cachedPath(it.id) }));
  }
}

/** 图片魔数 → 扩展名 */
function sniffExt(buf) {
  if (!buf || buf.length < 12) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'jpg';
}

// writeFileAtomic 只吃文本，图片走 Buffer；这里单独写一份二进制原子写
function writeFileAtomicBuffer(file, buf) {
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, buf);
  try { fs.renameSync(tmp, file); } catch {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    fs.writeFileSync(file, buf);
  }
}

module.exports = { OnlineGallery, SOURCE };
