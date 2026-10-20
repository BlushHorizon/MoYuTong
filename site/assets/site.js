'use strict';
/* =========================================================
   群崽 QunZai — 官网交互
   ========================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- 滚动进度 + 导航状态 ---------- */
(function scrollUi() {
  const bar = $('#progressBar');
  const nav = $('#nav');
  let raf = 0;
  const tick = () => {
    raf = 0;
    const h = document.documentElement.scrollHeight - innerHeight;
    const p = h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0;
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    if (nav) nav.classList.toggle('is-scrolled', scrollY > 12);
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  tick();
})();

/* ---------- 移动端菜单 ---------- */
(function mobileMenu() {
  const btn = $('#navToggle');
  const mnav = $('#mnav');
  if (!btn || !mnav) return;

  const setOpen = (open) => {
    document.body.classList.toggle('menu-open', open);
    mnav.classList.toggle('is-open', open);
    mnav.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    document.body.style.overflow = open ? 'hidden' : '';
  };

  btn.addEventListener('click', () => setOpen(!mnav.classList.contains('is-open')));
  $$('a', mnav).forEach((a) => a.addEventListener('click', () => setOpen(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  addEventListener('resize', () => { if (innerWidth > 900) setOpen(false); });
})();

/* ---------- 导航高亮 ---------- */
(function navSpy() {
  const links = $$('.nav-links a');
  const map = new Map();
  links.forEach((a) => {
    const id = a.getAttribute('href');
    if (!id || !id.startsWith('#')) return;
    const el = document.querySelector(id);
    if (el) map.set(el, a);
  });
  if (!map.size || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.remove('is-active'));
      const a = map.get(en.target);
      if (a) a.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  map.forEach((_, el) => io.observe(el));
})();

/* ---------- 入场动画 ---------- */
(function reveal() {
  const els = $$('.reveal');
  if (!els.length) return;
  if (REDUCED || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  els.forEach((el, i) => {
    el.style.transitionDelay = (Math.min(i, 4) * 45) + 'ms';
    io.observe(el);
  });
})();

/* ---------- 数字滚动 ---------- */
(function counters() {
  const nums = $$('b[data-count]');
  if (!nums.length) return;
  const run = (el) => {
    const target = Number(el.dataset.count) || 0;
    if (REDUCED || target === 0) { el.textContent = String(target); return; }
    const dur = 1100;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!('IntersectionObserver' in window)) { nums.forEach(run); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      run(en.target);
      io.unobserve(en.target);
    });
  }, { threshold: 0.5 });
  nums.forEach((el) => io.observe(el));
})();

/* ---------- 条幅无缝循环 ---------- */
(function marquee() {
  const track = $('#marqueeTrack');
  if (!track) return;
  track.innerHTML = track.innerHTML + track.innerHTML;
})();

/* ---------- 视频切换 ---------- */
(function films() {
  const tabs = $$('.film-tab');
  const video = $('#filmVideo');
  const title = $('#filmTitle');
  const desc = $('#filmDesc');
  if (!tabs.length || !video) return;

  const pick = (btn) => {
    tabs.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    try { video.pause(); } catch { }
    video.setAttribute('poster', btn.dataset.poster || '');
    video.setAttribute('src', btn.dataset.src || '');
    video.load();
    if (title) title.textContent = btn.dataset.title || '';
    if (desc) desc.textContent = btn.dataset.desc || '';
  };
  tabs.forEach((b) => b.addEventListener('click', () => pick(b)));
})();

/* ---------- QQ 演示 ---------- */
(function qqDemo() {
  const qq = $('#qqDemo');
  if (!qq) return;
  const steps = $$('[data-step]', qq).sort((a, b) => Number(a.dataset.step) - Number(b.dataset.step));
  const m2 = $('#m2text');
  const m2Text = '冷场检测到。新收了 12 张表情，谁来点个题？';
  const replay = $('#btnReplay');
  let timers = [];

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  const reset = () => {
    timers.forEach(clearTimeout);
    timers = [];
    steps.forEach((s) => s.classList.remove('is-on'));
    qq.classList.remove('is-typing');
    if (m2) m2.textContent = '';
  };

  const showAll = () => {
    reset();
    steps.forEach((s) => s.classList.add('is-on'));
    if (m2) m2.textContent = m2Text;
  };

  const play = () => {
    reset();
    if (REDUCED) { showAll(); return; }

    at(220, () => steps[0] && steps[0].classList.add('is-on'));
    at(980, () => {
      if (steps[1]) steps[1].classList.add('is-on');
      qq.classList.add('is-typing');
    });

    const t0 = 1750;
    const per = 26;
    m2Text.split('').forEach((_, i) => {
      at(t0 + i * per, () => {
        if (m2) m2.textContent = m2Text.slice(0, i + 1);
        if (i === m2Text.length - 1) qq.classList.remove('is-typing');
      });
    });
    const typed = t0 + m2Text.length * per;

    at(typed + 420, () => steps[2] && steps[2].classList.add('is-on'));
    at(typed + 980, () => steps[3] && steps[3].classList.add('is-on'));
  };

  if (replay) replay.addEventListener('click', play);

  if (REDUCED) { qq.classList.add('is-armed'); showAll(); return; }
  qq.classList.add('is-armed');

  if (!('IntersectionObserver' in window)) { showAll(); return; }
  let fired = false;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting || fired) return;
      fired = true;
      play();
      io.disconnect();
    });
  }, { threshold: 0.3 });
  io.observe(qq);
})();

/* ---------- 复制 ---------- */
(function copyBtns() {
  const fallback = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { }
    document.body.removeChild(ta);
    return ok;
  };

  $$('[data-copy]').forEach((btn) => {
    const text = btn.getAttribute('data-copy') || '';
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch { }
      if (!ok) ok = fallback(text);
      btn.textContent = ok ? '已复制 ✓' : '复制失败';
      btn.classList.toggle('is-done', ok);
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = label; btn.classList.remove('is-done'); }, 1600);
    });
  });
})();

/* ---------- HERO 漂浮消息流 ---------- */
(function flow() {
  const cv = $('#flowCanvas');
  if (!cv || REDUCED) return;
  const hero = cv.parentElement;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const CHAT = [
    '这关打不过啊', '谁有多的显卡支架', '前排蹲一个教程', '笑死，这机器人比人勤快',
    '今晚肝到三点', '在吗', '这梗我接了', '作业写完了吗', '再来一张',
    '这 AI 接梗比我快', '等等，它还会发表情包', '群主呢', '别卷了',
  ];
  const STK = ['stk1.jpg', 'stk2.jpg', 'stk4.jpg', 'stk6.jpg'].map((s) => {
    const i = new Image(); i.src = 'assets/' + s; return i;
  });

  let W = 0, H = 0, DPR = 1, items = [], visible = true, raf = 0, last = 0;

  const mk = (initial) => {
    const isStk = Math.random() < 0.22;
    return {
      x: Math.random() * Math.max(1, W - 150) + 20,
      y: initial ? Math.random() * H : H + 40 + Math.random() * 120,
      vy: 8 + Math.random() * 16,
      drift: (Math.random() - .5) * 6,
      life: 0,
      kind: isStk ? 'stk' : 'txt',
      img: isStk ? STK[Math.floor(Math.random() * STK.length)] : null,
      text: isStk ? '' : CHAT[Math.floor(Math.random() * CHAT.length)],
      alpha: 0.14 + Math.random() * 0.22,
    };
  };

  const size = () => {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth || 1200;
    H = hero.clientHeight || 700;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = W < 760 ? 8 : 18;
    items = Array.from({ length: n }, () => mk(true));
  };

  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    for (const it of items) {
      if (it.kind === 'stk') {
        if (!it.img.naturalWidth) continue;
        const s = 34;
        ctx.save();
        ctx.globalAlpha = it.alpha * Math.min(1, it.life / 0.8);
        ctx.translate(it.x + it.drift * it.life * 0.1, it.y);
        ctx.rotate(Math.sin(it.life * .4 + it.x) * .04);
        ctx.beginPath();
        rr(-s / 2, -s / 2, s, s, 6);
        ctx.clip();
        ctx.drawImage(it.img, -s / 2, -s / 2, s, s);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = it.alpha * Math.min(1, it.life / 0.8);
        ctx.font = '600 12px "Cascadia Mono", Consolas, monospace';
        const tw = ctx.measureText(it.text).width;
        const pad = 9, h = 26;
        const x = it.x + it.drift * it.life * 0.1;
        rr(x, it.y - h / 2, tw + pad * 2, h, 7);
        ctx.fillStyle = 'rgba(125,176,255,.055)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(125,176,255,.16)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#9fb6d4';
        ctx.fillText(it.text, x + pad, it.y + 4.5);
        ctx.restore();
      }
    }
  };

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    for (const it of items) {
      it.y -= it.vy * dt;
      it.life += dt;
      if (it.y < -60) Object.assign(it, mk(false));
    }
    draw();
  };

  size();
  addEventListener('resize', () => { cancelAnimationFrame(raf); size(); last = performance.now(); raf = requestAnimationFrame(loop); }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  }
  last = performance.now();
  raf = requestAnimationFrame(loop);
})();
