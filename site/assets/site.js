'use strict';
/* 深瞳 DEEPPUPIL 官网 —— 复制 / 聊天演示 / 滚动出现 */

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