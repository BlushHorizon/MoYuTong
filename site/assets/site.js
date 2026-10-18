'use strict';
/* 复制 QQ 群号（file:// 下 clipboard API 不可用，走 execCommand 兜底） */
function copyGroup() {
  const text = '1128593359';
  const btn = document.getElementById('btnCopyGroup');
  const done = () => {
    if (!btn) return;
    btn.textContent = '已复制 ✓';
    setTimeout(() => { btn.textContent = '复制群号'; }, 1600);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('群号：1128593359'); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
}
/* 深瞳官网交互：星空网格背景、打字机、滚动出现、悬浮表情包装饰 */
(function () {
  /* ---------- 背景：合成波网格 + 粒子 ---------- */
  const cv = document.getElementById('bg');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * DPR;
    H = cv.height = innerHeight * DPR;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
  }
  size();
  addEventListener('resize', size);

  const stars = Array.from({ length: 90 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4,
    s: Math.random() * 0.0006 + 0.0002, a: Math.random() * 0.6 + 0.2
  }));
  let t0 = performance.now();
  function bg(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070b14'); g.addColorStop(1, '#04060b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 星点
    for (const s of stars) {
      s.y += s.s * 16;
      if (s.y > 1.05) { s.y = -0.05; s.x = Math.random(); }
      const tw = 0.6 + 0.4 * Math.sin(t * 0.002 + s.x * 30);
      ctx.globalAlpha = s.a * tw * 0.7;
      ctx.fillStyle = s.r > 1.4 ? '#9fe8ff' : '#cfe4ff';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * DPR, 0, 7); ctx.fill();
    }
    // 底部透视网格
    ctx.globalAlpha = 0.12; ctx.strokeStyle = '#35c8ff'; ctx.lineWidth = DPR;
    const horizon = H * 0.82;
    const off = (t * 0.03) % 60;
    for (let i = 0; i < 12; i++) {
      const y = horizon + Math.pow((i + (t * 0.00004 % 1)) / 12, 2.4) * (H - horizon);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = -W / 2; x <= W / 2; x += 90 * DPR) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + x, horizon);
      ctx.lineTo(W / 2 + x * 3.4, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function loop(now) { bg(now - t0); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  /* ---------- 打字机 ---------- */
  const lines = [
    '[deepseek] 提示词已发送（新建对话，含【表情包能力】✓）',
    '[表情包] 发出表情包 x3「一整条消息 · 防刷屏」',
    '[AI] 已回复 → 群聊：码住了，明天上线前再对一遍 (´･ω･`)'
  ];
  const el = document.querySelector('.typed-line');
  if (el) {
    let li = 0, ci = 0, del = false;
    (function type() {
      const line = lines[li];
      if (!del) {
        el.textContent = line.slice(0, ++ci);
        if (ci === line.length) { del = true; return setTimeout(type, 2600); }
        setTimeout(type, 52);
      } else {
        el.textContent = line.slice(0, --ci);
        if (ci === 0) { del = false; li = (li + 1) % lines.length; return setTimeout(type, 400); }
        setTimeout(type, 18);
      }
    })();
  }

  /* ---------- 滚动出现 ---------- */
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el2) => io.observe(el2));

  /* ---------- 模型卡片轻微呼吸 ---------- */
  document.querySelectorAll('.card.model').forEach((c, i) => {
    c.style.transition = `transform .18s ease, box-shadow .3s ease`;
    c.addEventListener('mouseenter', () => { c.style.boxShadow = `0 0 44px color-mix(in srgb, ${getComputedStyle(c).getPropertyValue('--c')} 30%, transparent)`; });
    c.addEventListener('mouseleave', () => { c.style.boxShadow = ''; });
    setTimeout(() => { c.style.opacity = '0'; requestAnimationFrame(() => { c.style.transition = 'opacity .5s ease, transform .18s ease'; c.style.opacity = ''; }); }, i * 90);
  });

  /* ---------- 悬浮表情包装饰（用 MV 同款真实素材） ---------- */
  const SRC = ['assets/stk1.jpg', 'assets/stk2.jpg', 'assets/stk3.png', 'assets/stk4.jpg', 'assets/stk5.jpg', 'assets/stk6.jpg'];
  SRC.forEach((src, i) => {
    const im = new Image();
    im.src = src;
    im.onload = () => {
      const d = document.createElement('img');
      d.className = 'deco';
      d.src = src;
      const size = 70 + Math.random() * 90;
      d.style.width = size + 'px';
      d.style.left = (4 + Math.random() * 92) + 'vw';
      d.style.top = (8 + Math.random() * 88) + 'vh';
      d.style.animation = `float${(i % 2) + 1} ${7 + Math.random() * 8}s ease-in-out ${i * 1.1}s infinite alternate`;
      document.body.appendChild(d);
    };
  });
  const st = document.createElement('style');
  st.textContent = `
    @keyframes float1 { from { transform: translateY(-14px) rotate(-6deg); } to { transform: translateY(22px) rotate(7deg); } }
    @keyframes float2 { from { transform: translateY(16px) rotate(5deg); } to { transform: translateY(-20px) rotate(-8deg); } }`;
  document.head.appendChild(st);
})();