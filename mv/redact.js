'use strict';
/**
 * 截图打码：把真实群号/联系人昵称用高斯模糊盖掉（headless Edge + canvas，就地覆写 PNG）
 * 用法：node redact.js <png路径> [x,y,w,h ...]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const rects = process.argv.slice(3).map((s) => s.split(',').map(Number));
if (!target || !rects.length) { console.error('用法: node redact.js <png> [x,y,w,h ...]'); process.exit(1); }

const PORT = 9334;
const EDGE = [
  `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`
].find((p) => p && fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = 'file:///' + path.resolve(target).replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(__dirname, '.edge-redact')}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1400,900', 'about:blank'
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  let page = null;
  for (let i = 0; i < 25; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(3000) });
      const targets = await resp.json();
      page = (targets || []).find((t) => t.type === 'page');
      if (page) break;
    } catch { /* retry */ }
    await sleep(700);
  }
  if (!page) { console.error('Edge 没起来'); process.exit(1); }

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
    setTimeout(() => rej(new Error('WS 超时')), 8000);
  });
  const cdp = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, timeoutMs);
  });

  await cdp('Page.enable');
  await cdp('Page.navigate', { url: fileUrl });
  await sleep(1500);

  // 先问原图尺寸，再按原尺寸做视口
  const dim = await cdp('Runtime.evaluate', {
    expression: `new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => res('0x0'); i.src = ${JSON.stringify(fileUrl)}; })`,
    awaitPromise: true, returnByValue: true
  }, 20000);
  const [DW, DH] = String(dim.result?.value || '0x0').split('x').map(Number);
  if (!DW || !DH) { console.error('读不到图片尺寸'); process.exit(1); }
  await cdp('Emulation.setDeviceMetricsOverride', { width: DW, height: DH, deviceScaleFactor: 1, mobile: false });

  // 在页面上画出打码后的整图（满视口），再用截图通道取回来
  const script = `(async () => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ${JSON.stringify(fileUrl)}; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    for (const [x, y, w, h] of ${JSON.stringify(rects)}) {
      const c2 = document.createElement('canvas');
      c2.width = Math.max(1, w + 24); c2.height = Math.max(1, h + 24);
      const x2 = c2.getContext('2d');
      // 马赛克：先缩到极小再放大回来（不依赖 filter，headless 里也稳），再压暗
      const tw = 10, th = Math.max(2, Math.round((10 * h) / w));
      const c3 = document.createElement('canvas');
      c3.width = tw; c3.height = th;
      const x3 = c3.getContext('2d');
      x3.imageSmoothingEnabled = true;
      x3.drawImage(cv, x, y, w, h, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c3, 0, 0, tw, th, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = 'rgba(9,14,24,0.6)';
      ctx.fillRect(x, y, w, h);
    }
    document.body.innerHTML = '';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.appendChild(cv);
    await new Promise((r) => setTimeout(r, 300));
    return cv.width + 'x' + cv.height;
  })()`;
  const r = await cdp('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true }, 40000);
  const okMsg = String(r.result?.value || '');
  if (!/^\d+x\d+$/.test(okMsg)) { console.error('打码渲染失败:', okMsg.slice(0, 120)); process.exit(1); }

  const shot = await cdp('Page.captureScreenshot', { format: 'png' }, 30000);
  fs.writeFileSync(target, Buffer.from(shot.data, 'base64'));
  console.log(`已打码 ${rects.length} 处 → ${target}`);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('打码出错:', e.message); process.exit(1); });