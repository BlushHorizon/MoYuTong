'use strict';
/**
 * 群崽 QunZai · 更新检查与下载
 * ---------------------------------------------------------------------------
 * 安全边界：
 *   · 只检查，不自动下载；下载必须由用户点“更新”后显式调用；
 *   · 下载地址和 SHA256 只认 manifest 里的值，不接收前端传来的任意 URL；
 *   · 下载文件只落在 data/updates，安装前先校验 SHA256；
 *   · 安装也要再确认一次，不做静默更新。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL, fileURLToPath } = require('url');

function cmpVersion(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function readLocalText(source) {
  if (/^file:\/\//i.test(source)) return fs.readFileSync(fileURLToPath(source), 'utf8');
  return fs.readFileSync(source, 'utf8');
}

function fetchText(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = /^https:/i.test(url) ? https : http;
    const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'QunZai-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchText(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

function downloadFile(url, dest, expectedSha256, expectedSize) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const part = dest + '.part';
    try { fs.rmSync(part, { force: true }); } catch { /* noop */ }

    const onDone = () => {
      try {
        const buf = fs.readFileSync(part);
        if (expectedSize && buf.length !== Number(expectedSize)) {
          fs.rmSync(part, { force: true });
          return reject(new Error(`文件大小不一致（期望 ${expectedSize}，实际 ${buf.length}）`));
        }
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        if (expectedSha256 && hash.toLowerCase() !== String(expectedSha256).toLowerCase()) {
          fs.rmSync(part, { force: true });
          return reject(new Error('SHA256 校验失败，已删除下载文件'));
        }
        fs.renameSync(part, dest);
        resolve({ file: dest, bytes: buf.length, sha256: hash });
      } catch (err) {
        try { fs.rmSync(part, { force: true }); } catch { /* noop */ }
        reject(err);
      }
    };

    if (/^file:\/\//i.test(url)) {
      try {
        fs.copyFileSync(fileURLToPath(url), part);
        return onDone();
      } catch (err) { return reject(err); }
    }
    if (!/^https?:\/\//i.test(url)) return reject(new Error('只支持 http / https / file 下载地址'));

    const lib = /^https:/i.test(url) ? https : http;
    const req = lib.get(url, { timeout: 30000, headers: { 'User-Agent': 'QunZai-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFile(new URL(res.headers.location, url).toString(), dest, expectedSha256, expectedSize).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`下载失败：HTTP ${res.statusCode}`));
      }
      const out = fs.createWriteStream(part);
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; if (bytes > 250 * 1024 * 1024) req.destroy(new Error('文件超过 250MB，已中止')); });
      res.pipe(out);
      out.on('finish', onDone);
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('下载超时')));
    req.on('error', reject);
  });
}

class Updater {
  constructor(opts = {}) {
    this.root = opts.root;
    this.currentVersion = opts.currentVersion;
    this.getConfig = opts.getConfig || (() => ({}));
    this.updatesDir = path.join(this.root, 'data', 'updates');
    this.last = null;
    this.lastDownload = null;
  }

  _manifestSource() {
    const cfg = this.getConfig().update || {};
    if (cfg.manifestUrl && String(cfg.manifestUrl).trim()) {
      const raw = String(cfg.manifestUrl).trim();
      if (/^file:\/\//i.test(raw) || /^https?:\/\//i.test(raw) || path.isAbsolute(raw)) return raw;
      return path.resolve(this.root, raw);
    }
    const local = path.join(this.root, 'data', 'update.json');
    if (fs.existsSync(local)) return local;
    return '';
  }

  async _load() {
    const source = this._manifestSource();
    if (!source) {
      return { ok: false, configured: false, error: '还没有配置更新地址（设置 → 自动更新），也没有 data/update.json' };
    }
    const text = (/^https?:\/\//i.test(source) ? await fetchText(source) : readLocalText(source)).replace(/^\uFEFF/, '');
    let manifest;
    try { manifest = JSON.parse(text); } catch (e) { throw new Error('更新清单不是合法 JSON：' + e.message); }
    if (!manifest || !manifest.version) throw new Error('更新清单缺少 version');
    return { ok: true, configured: true, source, manifest };
  }

  _manifestBase(source) {
    if (/^https?:\/\//i.test(source)) return new URL('.', source).toString();
    if (/^file:\/\//i.test(source)) return new URL('.', source).toString();
    return path.dirname(source) + path.sep;
  }

  _resolveFileUrl(source, url) {
    const raw = String(url || '').trim();
    if (!raw) throw new Error('更新清单缺少下载地址');
    if (/^(https?|file):\/\//i.test(raw)) return raw;
    const base = this._manifestBase(source);
    if (/^https?:\/\//i.test(base) || /^file:\/\//i.test(base)) return new URL(raw, base).toString();
    return pathToFileURL(path.resolve(base, raw)).toString();
  }

  async check() {
    const loaded = await this._load();
    if (!loaded.ok) {
      this.last = loaded;
      return loaded;
    }
    const m = loaded.manifest;
    const latest = String(m.version).replace(/^v/i, '');
    const available = cmpVersion(latest, this.currentVersion) > 0;
    const file = Array.isArray(m.files) && m.files.length ? m.files[0] : null;
    let downloadUrl = '';
    if (file && file.url) {
      try { downloadUrl = this._resolveFileUrl(loaded.source, file.url); } catch { /* 下面标记不完整 */ }
    }
    this.last = {
      ok: true,
      configured: true,
      source: loaded.source,
      current: this.currentVersion,
      latest,
      updateAvailable: available,
      notes: m.notes || '',
      pubDate: m.pubDate || '',
      file: file ? {
        url: downloadUrl,
        sha256: String(file.sha256 || ''),
        size: Number(file.size) || 0
      } : null,
      error: available && !downloadUrl ? '更新清单有版本号，但没有可用的下载地址' : ''
    };
    return this.last;
  }

  async download() {
    const checked = await this.check();
    if (!checked.ok) throw new Error(checked.error || '检查更新失败');
    if (!checked.updateAvailable) throw new Error('当前已经是最新版本');
    if (!checked.file || !checked.file.url) throw new Error(checked.error || '更新清单没有下载地址');
    if (!checked.file.sha256) throw new Error('更新清单缺少 SHA256，拒绝下载未校验的文件');
    const safeVersion = checked.latest.replace(/[^0-9A-Za-z._-]/g, '_');
    const dest = path.join(this.updatesDir, `QunZai-${safeVersion}-setup.exe`);
    const got = await downloadFile(checked.file.url, dest, checked.file.sha256, checked.file.size);
    this.lastDownload = { ...got, version: checked.latest };
    return { ok: true, ...this.lastDownload };
  }

  install() {
    if (!this.lastDownload || !fs.existsSync(this.lastDownload.file)) {
      return { ok: false, error: '还没有下载好更新文件，请先点“下载更新”' };
    }
    const file = path.resolve(this.lastDownload.file);
    if (!file.startsWith(path.resolve(this.updatesDir) + path.sep)) {
      return { ok: false, error: '更新文件路径不合法' };
    }
    if (!/\.exe$/i.test(file)) return { ok: false, error: '更新文件不是 exe' };
    // 这里故意不再用 /S 静默安装：
    //   1) 用户能看到安装器真的启动了；
    //   2) 安装器会先结束旧宿主和旧 Node 服务，再覆盖文件；
    //   3) 交互安装的完成页会直接启动新版本。
    // 延迟 800ms 是为了先把 HTTP 响应发回页面；否则安装器结束 Node 时，
    // 页面只会看到“网络错误”，而不是“安装程序已启动”。
    setTimeout(() => {
      try {
        const child = spawn(file, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
          cwd: path.dirname(file)
        });
        child.unref();
      } catch { /* 错误由安装器自身提示 */ }
    }, 800);
    return { ok: true, file, scheduled: true };
  }
}

module.exports = { Updater, cmpVersion };
