'use strict';
/**
 * 教程 MV 抓帧：headless Edge + CDP，逐帧渲染 tutorial.html 的 renderAt(t)
 * 用法：node capture-tutorial.js [fps]   默认 24fps / 82 秒
 * 产物：frames/f00001.jpg → ffmpeg 合成视频
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = Number(process.argv[2] || 24);
const DUR = 82;
const PORT = 9335;
const EDGE = [
  `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`
].find((p) => p && fs.existsSync(p));

const ROOT = __dirname;
const FRAMES = path.join(ROOT, 'frames');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpJson = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { signal: AbortSignal.timeout(3000) })).json();

(async () => {
  fs.mkdirSync(FRAMES, { recursive: true });
  for (const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES, f));

  console.log('启动 headless Edge…');
  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, '.edge-profile-tut')}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,720', 'about:blank'
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  let alive = false;
  for (let i = 0; i < 25; i++) { try { await httpJson('/json/version'); alive = true; break; } catch { await sleep(700); } }
  if (!alive) { console.error('Edge 没起来'); process.exit(1); }

  const targets = await httpJson('/json');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let msgId = 0;
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('WS 连接失败')));
    setTimeout(() => rej(new Error('WS 超时')), 8000);
  });
  const cdp = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, timeoutMs);
  });

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: 'file:///' + path.join(ROOT, 'tutorial.html').replace(/\\/g, '/') + '?cap=1' });
  await sleep(3000);
  const ok = await cdp('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true }, 30000);
  if (!ok.result.value) { console.error('页面未就绪'); process.exit(1); }
  console.log('页面就绪，开始逐帧渲染…');

  const total = Math.round(DUR * FPS);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await cdp('Runtime.evaluate', { expression: `window.renderAt(${t.toFixed(4)})`, returnByValue: true }, 15000);
    const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 86 }, 30000);
    fs.writeFileSync(path.join(FRAMES, `f${String(i + 1).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    if (i % 96 === 0) console.log(`  ${i + 1}/${total} 帧  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log(`抓帧完成：${total} 帧 / ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('抓帧失败:', e.message); process.exit(1); });