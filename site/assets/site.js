'use strict';
/* 摸鱼瞳 MOYUTONG 官网 —— 动效 / 消息流画布 / 复制 / 聊天演示 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- HERO 消息流：QQ 气泡自深处飘来，表情包不时飞过 ---------- */
(function flow() {
  const cv = document.getElementById('flowCanvas');
  if (!cv || REDUCED) return;
  const ctx = cv.getContext('2d');
  const hero = document.querySelector('.hero');

  // 虚构群聊语料（不出现任何真实信息）
  const CHAT = [
    ['in', '这关打不过啊'], ['in', '谁有多的显卡支架'],
    ['bot', '看下你的配置，少一行参数'], ['in', '前排蹲一个教程'],
    ['bot', '教程在置顶，第三条'], ['in', '笑死，你这机器人比人勤快'],
    ['bot', '规矩是你定的，我只管执行'], ['in', '今晚肝到三点'],
    ['bot', '悠着点，明早还要上班'], ['in', '[表情]'], ['in', '收到，马上改']
  ];
  const STICKERS = ['stk1.jpg', 'stk2.jpg', 'stk4.jpg', 'stk3.png', 'stk6.jpg'];
  const imgs = STICKERS.map((s) => { const i = new Image(); i.src = 'assets/' + s; return i; });

  let W = 0, H = 0, DPR = 1;
  const items = [];
  let scrollBoost = 0, lastScroll = 0, visible = true;

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function spawn(initial) {
    const depth = 0.25 + Math.random() * 0.75;      // 景深：越大越近
    const chat = CHAT[(Math.random() * CHAT.length) | 0];
    const isSticker = Math.random() < 0.16 && depth > 0.45;
    const fs = 10 + depth * 6;
    items.push({
      kind: isSticker ? 'stk' : 'msg',
      side: chat[0] === 'in' ? (Math.random() < 0.62 ? 1 : 0) : 0,
      lane: chat[0] === 'in' && Math.random() < 0.62 ? 1 : 0,   // 0=左道 1=右道，中间留给文案
      text: chat[1],
      img: imgs[(Math.random() * imgs.length) | 0],
      x: 0, y: initial ? Math.random() * H : H + 60,
      z: depth,
      size: isSticker ? 34 + depth * 44 : 0,
      fs,
      sp: 0.16 + depth * 0.5,
      ph: Math.random() * Math.PI * 2,
      a: 0,
      pad: 8 + fs * 0.7
    });
  }
  function measure(it) {
    if (it.kind === 'stk') { it.w = it.h = it.size; return; }
    ctx.font = '500 ' + it.fs + 'px "Microsoft YaHei", system-ui, sans-serif';
    it.w = Math.min(ctx.measureText(it.text).width + it.pad * 2, 220);
    it.h = it.fs * 1.5 + it.pad;
  }

  let t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min((now - t0) / 16.67, 3);
    t0 = now;

    ctx.clearRect(0, 0, W, H);
    const focus = W * 0.5;
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      measure(it);
      it.ph += 0.02;
      it.y -= it.sp * dt * (1 + scrollBoost);
      const sway = Math.sin(it.ph) * 7;
      // 目标不透明度：飞近时浮现，飞远时淡出；整体压得很低，只当氛围
      const life = 1 - it.y / H;
      it.a = Math.max(Math.min(life * 6, 1), 0) * (0.06 + it.z * 0.22);

      if (it.y < -120) { items.splice(k, 1); continue; }

      const y = it.y + Math.sin(it.ph) * 3;
      const cx = (it.lane ? W - 28 - it.w : 28) + sway;
      const blur = (1 - it.z) * 2.2;

      ctx.save();
      ctx.globalAlpha = it.a;
      if (blur > 0.15) ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 5;

      if (it.kind === 'stk') {
        if (it.img.complete && it.img.naturalWidth) ctx.drawImage(it.img, cx, y, it.size, it.size);
      } else {
        const r = 9;
        const x = cx;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + it.w, y, x + it.w, y + it.h, r);
        ctx.arcTo(x + it.w, y + it.h, x, y + it.h, r);
        ctx.arcTo(x, y + it.h, x, y, r);
        ctx.arcTo(x, y, x + it.w, y, r);
        ctx.closePath();
        const bot = it.side === 0;
        ctx.fillStyle = bot ? 'rgba(47,123,255,.20)' : 'rgba(255,255,255,.075)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = bot ? 'rgba(106,164,255,.42)' : 'rgba(255,255,255,.10)';
        ctx.stroke();
        ctx.fillStyle = bot ? 'rgba(214,232,255,.92)' : 'rgba(214,224,238,.80)';
        ctx.font = '500 ' + it.fs + 'px "Microsoft YaHei", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.text, x + it.pad, y + it.h / 2 + 1, it.w - it.pad * 2);
      }
      ctx.restore();
    }

    // 维持数量（移动端减半）
    const want = W < 760 ? 6 : 10;
    while (items.length < want) spawn(false);
    scrollBoost *= 0.9;
  }

  size();
  for (let i = 0; i < 8; i++) spawn(true);
  requestAnimationFrame(frame);

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(size, 180); });
  // 滚离首屏就停画，省电
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  // 滚动时消息流加速（像被推着走）
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const d = Math.abs(y - lastScroll); lastScroll = y;
    if (y < window.innerHeight * 1.4) scrollBoost = Math.min(scrollBoost + d * 0.012, 5);
  }, { passive: true });
})();

/* ---------- 光标辉光 + 首屏视差 ---------- */
(function cursor() {
  const g = document.getElementById('cursorGlow');
  if (!g || REDUCED || !window.matchMedia('(hover:hover)').matches) return;
  const copy = document.querySelector('.hero-copy');
  const art = document.querySelector('.hero-art');
  let tx = 0, ty = 0, cx = 0, cy = 0;
  window.addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
    g.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
    g.classList.add('on');
  });
  (function loop() {
    requestAnimationFrame(loop);
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
    if (copy) copy.style.transform = 'translate3d(' + ((tx - window.innerWidth / 2) * -0.012).toFixed(2) + 'px,' + ((ty - window.innerHeight / 2) * -0.008).toFixed(2) + 'px,0)';
    if (art) art.style.transform = 'translate3d(' + ((tx - window.innerWidth / 2) * 0.026).toFixed(2) + 'px,' + ((ty - window.innerHeight / 2) * 0.018).toFixed(2) + 'px,0)';
  })();
})();

/* ---------- 滚动进度条 ---------- */
(function progress() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  const upd = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? Math.min(window.scrollY / h, 1) * 100 : 0) + '%';
  };
  window.addEventListener('scroll', upd, { passive: true });
  window.addEventListener('resize', upd);
  upd();
})();

/* ---------- 数字滚动 ---------- */
(function counters() {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const b = e.target.querySelector('b[data-count]');
      if (!b) continue;
      const to = parseFloat(b.dataset.count);
      const dec = parseInt(b.dataset.dec || '0', 10);
      if (REDUCED) { b.textContent = to.toFixed(dec); continue; }
      const t0 = performance.now(), dur = 1300;
      (function run(now) {
        const p = Math.min((now - t0) / dur, 1);
        const e2 = 1 - Math.pow(1 - p, 3);
        b.textContent = (to * e2).toFixed(dec);
        if (p < 1) requestAnimationFrame(run);
      })(t0);
    }
  }, { threshold: 0.4 });
  document.querySelectorAll('.numbers .reveal').forEach((el) => io.observe(el));
})();

/* ---------- 卡片 3D 倾斜 ---------- */
(function tilt() {
  if (REDUCED || !window.matchMedia('(hover:hover)').matches) return;
  document.querySelectorAll('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = 'perspective(900px) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateY(-5px)';
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
})();

/* ---------- 视频滚到就播（宣传片 / MV / 教程通用） ---------- */
(function mvAuto() {
  if (REDUCED) return;
  const vs = Array.from(document.querySelectorAll('.mv-frame video'));
  if (!vs.length) return;
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const v = e.target;
      v.play().catch(() => {});
      // 只让当前这一段播，避免多路解码
      for (const s of vs) if (s !== v && !s.paused) s.pause();
    }
  }, { threshold: 0.35 });
  vs.forEach((v) => io.observe(v));
})();

/* ---------- 复制（file:// 下 clipboard 不可用，走 execCommand 兜底） ---------- */
function copyText(text, btnId) {
  const btn = document.getElementById(btnId);
  const old = btn ? btn.textContent : '';
  const done = () => {
    if (!btn) return;
    btn.textContent = '已复制 ✓';
    setTimeout(() => { btn.textContent = old; }, 1600);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert(text); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
}

/* ---------- 聊天演示：滚到眼前才演 ---------- */
(function demo() {
  const m2 = document.getElementById('m2');
  const m2t = document.getElementById('m2text');
  const m3 = document.getElementById('m3');
  const trio = [...document.querySelectorAll('#trio img')];
  if (!m2 || !m3) return;
  const reply = '收到，我看下——多半是配置文件少了一行，两分钟。';
  let played = false;

  const io = new IntersectionObserver((es) => {
    if (played || !es.some((e) => e.isIntersecting)) return;
    played = true;
    io.disconnect();
    m2.hidden = false;
    let i = 0;
    const t = setInterval(() => {
      m2t.textContent = reply.slice(0, ++i);
      if (i >= reply.length) {
        clearInterval(t);
        const dots = document.getElementById('dots');
        if (dots) setTimeout(() => dots.remove(), 900);
        setTimeout(() => {
          m3.hidden = false;
          trio.forEach((im, k) => setTimeout(() => im.classList.add('in'), k * 240));
        }, 950);
      }
    }, 40);
  }, { threshold: 0.4 });
  io.observe(document.getElementById('demo'));
})();

/* ---------- 滚动出现 ---------- */
const io2 = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io2.unobserve(e.target); }
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach((el) => io2.observe(el));