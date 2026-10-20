'use strict';
/**
 * 宣传片关键帧预览：渲染指定时点并截图，用于人工检查画面。
 *   node preview-promo.js 0.6 2.2 8.1 ...
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIMES = process.argv.slice(2).map(Number).filter((n) => !isNaN(n));
const PORT = 9351;
const EDGE = [
  `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
].find((p) => p && fs.existsSync(p));

const ROOT = __dirname;
const OUT = path.join(ROOT, 'preview-promo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpJson = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { signal: AbortSignal.timeout(3000) })).json();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    const p = path.join(OUT, f);
    if (f.endsWith('.png') && fs.statSync(p).isFile()) fs.unlinkSync(p);
  }

  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.edge-preview-promo')}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=1280,720', 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  let alive = false;
  for (let i = 0; i < 30; i++) { try { await httpJson('/json/version'); alive = true; break; } catch { await sleep(700); } }
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

  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: 'file:///' + path.join(ROOT, 'promo.html').replace(/\\/g, '/') + '?cap=1' });
  await sleep(3200);
  const ok = await cdp('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true }, 30000);
  if (!ok.result.value) throw new Error('页面未就绪');

  let idx = 0;
  for (const t of TIMES) {
    await cdp('Runtime.evaluate', { expression: `window.renderAt(${t})`, returnByValue: true }, 15000);
    await sleep(140);
    const s = await cdp('Page.captureScreenshot', { format: 'png' }, 20000);
    fs.writeFileSync(path.join(OUT, 'f' + String(idx++).padStart(2, '0') + '.png'), Buffer.from(s.data, 'base64'));
    process.stdout.write(`  ${t}s -> f${String(idx - 1).padStart(2, '0')}.png\n`);
  }
  console.log('预览帧完成：' + fs.readdirSync(OUT).length + ' 张 → ' + OUT);
  ws.close();
  try { process.kill(child.pid); } catch { }
  process.exit(0);
})().catch((e) => { console.error('预览失败: ' + e.message); process.exit(1); });
