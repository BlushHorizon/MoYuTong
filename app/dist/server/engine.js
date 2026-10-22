'use strict';
/**
 * 群崽 QQ 内核 · 本机 OneBot 运行时集成层
 * ---------------------------------------------------------------------------
 * 这里不打包、不复制任何第三方 QQ 运行时，只做三件事：
 *   1. 在用户指定的目录（或常见安装目录）里找到兼容的 OneBot 运行时；
 *   2. 如果它还没运行，就按它自己的入口启动；
 *   3. 读取它自己的 OneBot 配置，把 WS 端口和 Token 同步到群崽。
 *
 * 运行时本身仍然是用户自己安装的那一份，群崽只负责“发现 + 启动 + 对接”。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function isPortOpen(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* noop */ }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function httpJson(port, pathname, token, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('返回不是 JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

function waitPort(port, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = async () => {
      if (await isPortOpen(port)) return resolve(true);
      if (Date.now() >= until) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

class QQEngine {
  constructor(opts = {}) {
    this.root = opts.root;
    this.getConfig = opts.getConfig || (() => ({}));
    this.saveConfig = opts.saveConfig || (() => {});
    this.startedProcess = null;
    this.lastError = '';
    this.lastInfo = null;
    this.lastStartedAt = 0;
    this.autoPromise = null;
  }

  _candidateDirs(overrideDir) {
    const cfg = this.getConfig();
    const dirs = [];
    const add = (p) => {
      if (!p) return;
      const abs = path.resolve(String(p));
      if (!dirs.some((x) => x.toLowerCase() === abs.toLowerCase())) dirs.push(abs);
    };

    add(overrideDir);
    add(cfg.qq?.engine?.dir);
    add(process.env.QUNZAI_ENGINE_DIR);
    add(path.resolve(this.root, '..', 'engine'));
    add(path.join(os.homedir(), 'QunZaiEngine'));
    if (process.env.LOCALAPPDATA) add(path.join(process.env.LOCALAPPDATA, 'QunZai', 'engine'));

    // 只在常见盘符顶层找“名字像 OneBot 运行时”的目录，不做全盘递归。
    if (process.platform === 'win32') {
      for (const drive of ['D:\\', 'E:\\', 'C:\\']) {
        try {
          for (const name of fs.readdirSync(drive)) {
            if (/snowluma|onebot|napcat|qunzai[-_ ]?engine/i.test(name)) {
              add(path.join(drive, name));
            }
          }
        } catch { /* 盘符不存在或没权限 */ }
      }
    }
    return dirs;
  }

  _findConfig(dir) {
    const candidates = [
      path.join(dir, 'config'),
      dir
    ];
    const files = [];
    for (const base of candidates) {
      try {
        for (const name of fs.readdirSync(base)) {
          if (!/^onebot_.+\.json$/i.test(name)) continue;
          if (/\.disabled$/i.test(name)) continue;
          files.push(path.join(base, name));
        }
      } catch { /* 没有这个目录 */ }
    }
    return files;
  }

  _inspect(dir, wantedAccount) {
    if (!dir || !exists(dir)) return null;
    const files = this._findConfig(dir);
    if (!files.length) return null;

    let file = null;
    let account = '';
    if (wantedAccount) {
      file = files.find((f) => path.basename(f).includes(String(wantedAccount))) || null;
      if (!file) return null;
    } else {
      // 没有指定账号时，优先选带数字账号的文件；仍然只选未禁用的配置。
      file = files.find((f) => /onebot_\d+\.json$/i.test(path.basename(f))) || files[0];
    }
    const base = path.basename(file);
    const m = base.match(/onebot_([0-9]+)\.json$/i);
    account = m ? m[1] : (wantedAccount ? String(wantedAccount) : '');

    const cfg = readJson(file);
    if (!cfg || !cfg.networks) return null;
    const ws = Array.isArray(cfg.networks.wsServers) ? cfg.networks.wsServers[0] : null;
    const httpServer = Array.isArray(cfg.networks.httpServers) ? cfg.networks.httpServers[0] : null;
    if (!ws || !ws.port) return null;

    let entry = null;
    if (exists(path.join(dir, 'index.mjs'))) {
      entry = { cmd: exists(path.join(dir, 'node.exe')) ? path.join(dir, 'node.exe') : 'node', args: ['index.mjs'] };
    } else if (exists(path.join(dir, 'app.js'))) {
      entry = { cmd: exists(path.join(dir, 'node.exe')) ? path.join(dir, 'node.exe') : 'node', args: ['app.js'] };
    } else if (exists(path.join(dir, 'launcher.bat'))) {
      entry = { cmd: 'cmd.exe', args: ['/c', 'launcher.bat'] };
    } else if (exists(path.join(dir, 'start.bat'))) {
      entry = { cmd: 'cmd.exe', args: ['/c', 'start.bat'] };
    }

    return {
      ok: true,
      dir,
      account,
      configFile: file,
      wsPort: Number(ws.port) || 3001,
      wsToken: String(ws.accessToken || ''),
      apiPort: Number(httpServer?.port) || 3000,
      httpToken: String(httpServer?.accessToken || ''),
      entry,
      // 不把 token 放进 public 字段；只有 start() 内部用
      public: {
        dir,
        account,
        configFile: path.basename(file),
        wsPort: Number(ws.port) || 3001,
        apiPort: Number(httpServer?.port) || 3000,
        entry: entry ? path.basename(entry.cmd) + ' ' + entry.args.join(' ') : '未找到启动入口'
      }
    };
  }

  async discover(override = {}) {
    const wanted = override.account || this.getConfig().qq?.engine?.account || '';
    const tried = [];
    for (const dir of this._candidateDirs(override.dir)) {
      tried.push(dir);
      const info = this._inspect(dir, wanted);
      if (info) {
        this.lastInfo = info;
        return { ...info, tried };
      }
    }
    return {
      ok: false,
      error: wanted
        ? `在常见目录里没有找到账号 ${wanted} 的 OneBot 配置`
        : '没有找到兼容的 OneBot 运行时，请在设置里填写运行时目录',
      tried
    };
  }

  async status() {
    const cfg = this.getConfig();
    const engineCfg = cfg.qq?.engine || {};
    const info = this.lastInfo || null;
    const port = info?.apiPort || Number(engineCfg.apiPort) || 3000;
    const running = await isPortOpen(port);
    return {
      enabled: engineCfg.enabled !== false,
      autoStart: engineCfg.autoStart !== false,
      dir: engineCfg.dir || '',
      account: engineCfg.account || '',
      running,
      startedByApp: !!this.startedProcess,
      wsPort: info?.wsPort || null,
      apiPort: port,
      lastError: this.lastError,
      configFile: info?.public?.configFile || '',
      entry: info?.public?.entry || ''
    };
  }

  async start(override = {}) {
    const found = await this.discover(override);
    if (!found.ok) {
      this.lastError = found.error;
      return { ok: false, error: found.error, tried: found.tried };
    }
    const info = found;
    this.lastInfo = info;

    let alreadyRunning = await isPortOpen(info.apiPort);
    let started = false;
    if (!alreadyRunning) {
      if (!info.entry) {
        this.lastError = '找到了配置，但没有找到可启动的入口（index.mjs / app.js / launcher.bat）';
        return { ok: false, error: this.lastError, info: info.public };
      }
      try {
        const child = spawn(info.entry.cmd, info.entry.args, {
          cwd: info.dir,
          detached: true,
          windowsHide: true,
          stdio: 'ignore',
          env: { ...process.env }
        });
        child.unref();
        this.startedProcess = child;
        this.lastStartedAt = Date.now();
        started = true;
      } catch (err) {
        this.lastError = '启动运行时失败：' + err.message;
        return { ok: false, error: this.lastError, info: info.public };
      }
      alreadyRunning = await waitPort(info.apiPort, 30000);
      if (!alreadyRunning) {
        this.lastError = `运行时没有在 30 秒内监听 ${info.apiPort} 端口，请查看它的日志`;
        return { ok: false, error: this.lastError, info: info.public, started };
      }
    }

    let login = null;
    try {
      login = await httpJson(info.apiPort, '/get_login_info', info.httpToken, 5000);
    } catch {
      // 有些实现要等 QQ 登录完成后才允许调用；端口已起来，继续同步配置。
    }
    const loginId = login?.data?.user_id != null ? String(login.data.user_id) : '';
    if (info.account && loginId && loginId !== String(info.account)) {
      this.lastError = `运行时登录的是 ${loginId}，与目标机器人号 ${info.account} 不一致，已停止同步`;
      return { ok: false, error: this.lastError, info: info.public };
    }

    const before = this.getConfig().qq || {};
    const nextOnebot = {
      wsUrl: `ws://127.0.0.1:${info.wsPort}`,
      accessToken: info.wsToken
    };
    this.saveConfig({
      qq: {
        mode: 'onebot',
        onebot: nextOnebot,
        engine: {
          ...(before.engine || {}),
          enabled: true,
          dir: info.dir,
          account: info.account,
          lastConnectedAt: new Date().toISOString()
        }
      }
    });
    this.lastError = '';
    const changed = before.mode !== 'onebot'
      || before.onebot?.wsUrl !== nextOnebot.wsUrl
      || before.onebot?.accessToken !== nextOnebot.accessToken;

    return {
      ok: true,
      started,
      alreadyRunning: !started,
      changed,
      login: loginId || null,
      info: info.public
    };
  }

  async auto() {
    if (this.autoPromise) return this.autoPromise;
    this.autoPromise = (async () => {
      const cfg = this.getConfig();
      if (cfg.qq?.engine?.autoStart === false) {
        return { ok: false, skipped: true, error: '自动启动已关闭' };
      }
      return this.start({});
    })();
    try {
      return await this.autoPromise;
    } finally {
      this.autoPromise = null;
    }
  }

  stop() {
    if (!this.startedProcess) {
      return { ok: false, error: '当前没有由群崽启动的运行时；为避免误杀，未停止其他进程' };
    }
    const pid = this.startedProcess.pid;
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      } else {
        this.startedProcess.kill('SIGTERM');
      }
    } catch (err) {
      return { ok: false, error: '停止失败：' + err.message };
    }
    this.startedProcess = null;
    return { ok: true, pid };
  }
}

module.exports = { QQEngine };
