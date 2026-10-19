'use strict';
/**
 * 宣传片 v2 抓帧：40s / 30fps / 1280x720 → frames-promo/f00000.jpg
 * 用法：node capture-promo.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const DUR = 40;
const TOTAL = FPS * DUR;
const PORT = 9352;
const EDGE = [
  `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
].find((p) => p && fs.existsSync(p));

const ROOT = __dirname;
const OUT = path.join(ROOT, 'frames-promo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpJson = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { signal: AbortSignal.timeout(3000) })).json();

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.edge-capture-promo')}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--run-all-compositor-stages-before-draw', '--disable-new-content-rendering-timeout',
    '--window-size=1280,720', 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  let alive = false;
  for (let i = 0; i < 40; i++) { try { await httpJson('/json/version'); alive = true; break; } catch { await sleep(600); } }
  if (!alive) throw new Error('Edge 没起来');

  const page = (await httpJson('/json')).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map(); let msgId = 0;
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('WS 失败')));
    setTimeout(() => rej(new Error('WS 超时')), 8000);
  });
  const cdp = (method, params = {}, t = 30000) => new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, t);
  });

  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception || {}).description);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value).join(' '));
  });

  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: 'file:///' + path.join(ROOT, 'promo.html').replace(/\\/g, '/') + '?cap=1' });
  await sleep(3600);
  const ok = await cdp('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true });
  if (!ok.result.value) throw new Error('页面未就绪');
  if (logs.length) throw new Error('页面报错：' + logs.join(' | '));

  const t0 = Date.now();
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    await cdp('Runtime.evaluate', { expression: `window.renderAt(${t})`, returnByValue: true }, 15000);
    await sleep(38);
    const s = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true, optimizeForSpeed: true }, 20000);
    fs.writeFileSync(path.join(OUT, 'f' + String(i).padStart(5, '0') + '.jpg'), Buffer.from(s.data, 'base64'));
    if (i % 120 === 0 || i === TOTAL - 1) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`  ${i + 1}/${TOTAL}  ${el.toFixed(0)}s  剩 ~${((el / (i + 1)) * (TOTAL - i - 1)).toFixed(0)}s\n`);
    }
  }
  console.log(`抓帧完成：${TOTAL} 帧 → ${OUT}`);
  ws.close();
  try { process.kill(child.pid); } catch { }
  process.exit(0);
})().catch((e) => { console.error('抓帧失败: ' + e.message); process.exit(1); });
