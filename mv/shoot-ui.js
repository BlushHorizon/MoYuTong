'use strict';
/**
 * 教程 MV 素材截图器（脱敏版）
 * · 界面 = 真实运行中的监控台（127.0.0.1:8787），一像素不假
 * · 内容 = 截图前用脚本替换成虚构数据（会话名 / QQ 号 / 实时动态），杜绝真实信息出镜
 * · 手法：加载前禁用 EventSource（SSE 会重绘覆盖），加载后注入 __fake() 再截图
 * 用法：node shoot-ui.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9334;
const EDGE = [
  `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`
].find((p) => p && fs.existsSync(p));

const ROOT = __dirname;
const OUT = path.join(ROOT, 'shots');
const PANEL = 'http://127.0.0.1:8787/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpJson = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { signal: AbortSignal.timeout(3000) })).json();

/* 脱敏注入：禁用 SSE + 提供 __fake() */
const INJECT = `
(() => {
  window.EventSource = class { constructor(){} close(){} addEventListener(){} removeEventListener(){} };
  const CH = window.__CH = [
    ['g','星河生存服', '这关打不过啊', 2],
    ['g','产品交流群', '新版本什么时候发', 1],
    ['p','Aurora', '帮我看下这个报错', 0],
    ['p','小柚', '[表情]', 0],
    ['g','摸鱼研究所', '自动回复能设置关键词吗', 0],
    ['p','老K', '在吗', 0],
    ['g','服务器运维群', '今晚两点重启维护', 0],
    ['p','林间小路', '好的收到', 0]
  ];
  window.__fake = () => {
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const ini = (s) => esc(s.trim().slice(0,1));
    // 1) 会话概览
    const ul = document.getElementById('overviewList');
    if (ul) ul.innerHTML = window.__CH.map(([t, n, last, un]) => \`
      <li class="ov-item">
        <div class="avatar \${t === 'g' ? 'group' : ''}">\${ini(n)}</div>
        <div class="info">
          <div class="row">
            <span class="name">\${esc(n)}</span>
            <span class="type \${t}">\${t === 'g' ? '群' : '私'}</span>
            <span class="time">\${un ? '刚刚' : ''}</span>
          </div>
          <div class="row">
            <span class="last">\${esc(last)}</span>
            \${un ? '<span class="badge">' + un + '</span>' : ''}
          </div>
        </div>
      </li>\`).join('');
    const hint = document.getElementById('ovHint');
    if (hint) hint.textContent = window.__CH.length + ' 个';
    // 2) 账号信息脱敏
    const qs = document.getElementById('cardQqSub');
    if (qs) qs.textContent = '账号 deepseek(****8888)';
    const pill = document.getElementById('qqStatusText');
    if (pill) pill.textContent = '已连接：deepseek(****8888)';
    const cmd = document.getElementById('setCmdSenders');
    if (cmd) cmd.value = '8888';
    const sel = document.getElementById('setTargetChat');
    if (sel) {
      const opts = [
        ['group:90001', '群 · 星河生存服', true],
        ['group:90002', '群 · 产品交流群', true],
        ['private:20001', '私 · Aurora', false],
        ['private:20002', '私 · 小柚', false],
        ['private:20003', '私 · 老K', false]
      ];
      sel.innerHTML = opts.map(([v, t, s]) =>
        '<option value="' + v + '"' + (s ? ' selected' : '') + '>' + t + '</option>').join('');
    }
    // 3) 实时动态
    const now = Date.now();
    const feed = [
      ['in','群 [星河生存服] 夜见','这关打不过啊', 0],
      ['skip','群 [星河生存服] 夜见','跳过：群聊中未 @ 我', 52],
      ['out','群 [星河生存服] 摸鱼瞳','收到，我看下——多半是配置文件少了一行，两分钟。', 71],
      ['in','私聊 Aurora','帮我看下这个报错', 128],
      ['out','私聊 Aurora','看过了，是端口被占。结束掉再启动就行。', 152],
      ['ai','群 [星河生存服] 摸鱼瞳','自主发表情包 ×3（打包为一条消息）', 196],
      ['in','群 [产品交流群] 小柚','新版本什么时候发', 240]
    ];
    const LABEL = { in:'收到', out:'已回复', ai:'AI 回复', skip:'跳过', err:'错误' };
    const fl = document.getElementById('feedList');
    if (fl) fl.innerHTML = feed.map(([k, chat, text, ago]) => {
      const d = new Date(now - ago * 1000);
      const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
      return '<li class="feed-item kind-' + k + '">' +
        '<span class="feed-time">' + hh + ':' + mm + '</span>' +
        '<span class="feed-tag">' + LABEL[k] + '</span>' +
        '<span class="feed-chat">' + esc(chat) + '</span>' +
        '<span class="feed-text">' + esc(text) + '</span></li>';
    }).join('');
    // 4) 今日动态数字
    const sm = document.getElementById('cardStatMain');
    if (sm) sm.textContent = '24 收 / 19 回';
    const ss = document.getElementById('cardStatSub');
    if (ss) ss.textContent = '会话 8 · 跳过 5';
    // 5) 表情包库脱敏：真实群友发的图不外传，改用官网上已公开的那几张
    const sl = document.getElementById('stickerList');
    if (sl) {
      const A = 'http://127.0.0.1:8788/assets/';
      const imgs = ['stk1.jpg', 'stk2.jpg', 'stk3.png', 'stk4.jpg', 'stk6.jpg', 'stk1.jpg'];
      const ids = ['kQbFwY', '38ECF7', 'qkbFwY', '8N539I', 'Hr2gJV', 'CmXoC1'];
      sl.innerHTML = imgs.map((src, i) =>
        '<div class="sticker-row">' +
        '<img class="sticker-thumb" src="' + A + src + '" alt="">' +
        '<span>图片 …fileid …' + ids[i] + '</span>' +
        '<small>×' + (i + 1) + '</small>' +
        '<button class="mini-btn danger-btn sticker-del">删除</button>' +
        '</div>').join('');
    }
    const stt = document.getElementById('stickerStats');
    if (stt) stt.textContent = '已载入素材 116 个（商城表情 34 / 图片 82）';
    return 'faked';
  };
})();
`;

const SHOTS = [
  { name: '01-overview', alias: 'overview', full: true, fake: true,
    rects: ['cardQqMain', 'cardQqSub', 'cardAiMain', 'cardDsMain', 'btnDsOpen', 'btnDsNew', 'cardStatMain', 'overviewList', 'feedList', 'qqStatusText'] },
  { name: '02-feed', alias: 'feed', fake: true, scrollTop: 620,
    rects: ['feedList', 'overviewList'] },
  { name: '03-settings-open', alias: 'open', fake: true, actions: ["document.getElementById('btnSettings').click()"], wait: 1000 },
  { name: '04-settings-reply', alias: 'reply', fake: true, actions: ["document.getElementById('btnSettings').click()"], wait: 1000, modalScroll: 0,
    rects: ['setReplyMode', 'targetWrap', 'setTargetChat', 'setMention', 'setQuietEnabled', 'setKeywords', 'setCmdSenders'] },
  { name: '05-settings-quiet', alias: 'quiet', fake: true, actions: ["document.getElementById('btnSettings').click()"], wait: 1000, modalScroll: 1,
    rects: ['setQuietEnabled', 'setQuietFrom', 'setQuietTo', 'setKeywords', 'setMention'] },
  { name: '06-settings-engine', alias: 'engine', fake: true, actions: ["document.getElementById('btnSettings').click()"], wait: 1000, modalScroll: 2,
    rects: ['setProvider', 'setWebSite', 'webSiteHint', 'setCdpPort', 'setWebPrompt'] },
  { name: '07-stickers', alias: 'stickers', fake: true, actions: ["document.getElementById('btnSettings').click()"], wait: 1200, modalScroll: 3,
    rects: ['stickerStats', 'stickerList', 'btnStickerClear', 'setMode', 'setWsUrl', 'settingsModal'] },
  { name: '08-site-download', alias: 'site', url: 'http://127.0.0.1:8788/', anchor: 'download', fake: false, clipSection: 'download' }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  const ALL_RECTS = {};

  console.log('启动无头 Edge…');
  const child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, '.edge-shots')}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  let alive = false;
  for (let i = 0; i < 30; i++) { try { await httpJson('/json/version'); alive = true; break; } catch { await sleep(700); } }
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
    ws.addEventListener('error', () => rej(new Error('WS 失败')));
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });

  for (const shot of SHOTS) {
    const target = shot.url || PANEL;
    await cdp('Page.navigate', { url: target + (target.includes('8788') ? '?t=' + Date.now() : '?t=' + Date.now()) });
    await sleep(shot.url ? 3000 : 2400);
    if (shot.anchor) {
      await cdp('Runtime.evaluate', { expression: `document.getElementById('${shot.anchor}').scrollIntoView({block:'center'})` });
      await sleep(900);
    }
    if (shot.fake) { await cdp('Runtime.evaluate', { expression: 'window.__fake && window.__fake()', returnByValue: true }); await sleep(450); }
    for (const act of shot.actions || []) {
      await cdp('Runtime.evaluate', { expression: act, returnByValue: true });
      await sleep(shot.wait || 700);
    }
    // 打开设置弹层会重新拉一次数据覆盖脱敏内容，这里再脱敏一次
    if (shot.fake) { await cdp('Runtime.evaluate', { expression: 'window.__fake && window.__fake()', returnByValue: true }); await sleep(350); }
    if (shot.scrollTop) { await cdp('Runtime.evaluate', { expression: `window.scrollTo(0, ${shot.scrollTop})` }); await sleep(450); }
    if (shot.modalScroll !== undefined) {
      const r = await cdp('Runtime.evaluate', {
        expression: `(() => {
          const m = document.querySelector('#settingsModal .modal-body');
          if (!m) return 'no-modal';
          m.scrollTop = m.scrollHeight * ${shot.modalScroll} / 3.2;
          return 'scrolled ' + m.scrollTop;
        })()`, returnByValue: true
      });
      await sleep(700);
      console.log('    ' + (r.result && r.result.value));
    }
    const params = { format: 'png' };
    if (shot.full) params.captureBeyondViewport = true;
    if (shot.clipSection) {
      const c = await cdp('Runtime.evaluate', {
        expression: `(() => {
          const el = document.getElementById('${shot.clipSection}');
          const r = el.getBoundingClientRect();
          return JSON.stringify({ x: Math.max(0, r.x + scrollX - 24), y: Math.max(0, r.y + scrollY - 24), w: r.width + 48, h: r.height + 48 });
        })()`, returnByValue: true
      });
      const clip = JSON.parse(c.result.value);
      params.captureBeyondViewport = true;
      params.clip = { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 2 };
    }
    const img = await cdp('Page.captureScreenshot', params, 40000);
    const file = path.join(OUT, shot.name + '.png');
    fs.writeFileSync(file, Buffer.from(img.data, 'base64'));

    // 量出关键控件的真实位置（CSS 像素），供教程 MV 精确对齐高亮框
    let rects = {};
    const want = shot.siteRects ? shot.siteRects.map((s) => s) : shot.rects;
    if (shot.siteRects) {
      // 官网页：下载按钮是 .btn-big，单独量
      const r0 = await cdp('Runtime.evaluate', {
        expression: `(() => {
          const b = document.querySelector('.btn-big');
          if (!b) return '{}';
          const r = b.getBoundingClientRect();
          return JSON.stringify({ rects: { downloadBtn: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio });
        })()`, returnByValue: true
      });
      try { rects = JSON.parse(r0.result.value); } catch {}
    } else if (want && want.length) {
      const r = await cdp('Runtime.evaluate', {
        expression: `(() => {
          const out = {};
          for (const id of ${JSON.stringify(want)}) {
            const el = document.getElementById(id);
            if (!el) continue;
            const b = el.getBoundingClientRect();
            if (b.width < 2 || b.height < 2) continue;
            out[id] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
          }
          return JSON.stringify({ rects: out, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio });
        })()`, returnByValue: true
      });
      try { rects = JSON.parse(r.result.value); } catch {}
    }
    fs.writeFileSync(path.join(OUT, shot.name + '.rects.json'), JSON.stringify(rects, null, 1), 'utf8');
    ALL_RECTS[shot.name] = rects;
    if (shot.alias) ALL_RECTS[shot.alias] = rects;
    console.log(`  ${shot.name}  ${Math.round(fs.statSync(file).size / 1024)} KB  (rects: ${Object.keys(rects.rects || {}).length})`);
  }

  // 汇总成 JS（file:// 下 fetch 会被 CORS 拦，用 <script> 引入最稳）
  fs.writeFileSync(path.join(OUT, 'rects.js'),
    'window.__RECTS = ' + JSON.stringify(ALL_RECTS) + ';\n', 'utf8');

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('截图失败:', e.message); process.exit(1); });