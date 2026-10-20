'use strict';
/**
 * 群崽 QUNZAI 群头像 v4 —— 「气泡 + 蹦出来的表情包」
 * 产品本体：QQ 消息自动回复 + 自主发表情包。
 * 画面：一个圆角聊天气泡，里面/周围蹦出三张表情包小卡片（打包成一条消息发出去）。
 * 无脸无眼，纯几何，不会有恐怖谷。
 */
const fs = require('fs');

const S = 1280;
const buf = Buffer.alloc(S * S * 3);

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ── 气泡：圆角矩形 + 左下小尾巴（尾巴顶部埋进气泡内，避免缺口）
const BUB = { cx: 640, cy: 470, w: 540, h: 350, r: 108, tailH: 84 };

function inBubble(x, y, d = 0) {
  const hw = BUB.w / 2 + d, hh = BUB.h / 2 + d, r = BUB.r + d;
  const dx = Math.abs(x - BUB.cx), dy = Math.abs(y - BUB.cy);
  const inside = dx <= hw && dy <= hh;
  const y0 = BUB.cy + hh - 52 - d * 0.3;
  const y1 = BUB.cy + hh + (BUB.tailH + d);
  if (!inside && y >= y0 && y <= y1) {
    const t = (y - y0) / (y1 - y0);
    const left = (BUB.cx - 218) + t * 68;
    const right = (BUB.cx - 46) + t * (-104);
    if (x >= left && x <= right) return true;
  }
  if (!inside) return false;
  // 圆角裁剪
  const kx = Math.max(dx - (hw - r), 0), ky = Math.max(dy - (hh - r), 0);
  return kx * kx + ky * ky <= r * r;
}

// ── 表情包卡片：圆角方块（可旋转），这就是产品最显眼的特性
const STK = [
  { cx: 552, cy: 470, s: 170, rot: -13, c: [255, 208, 102] },   // 暖黄
  { cx: 706, cy: 425, s: 152, rot: 9, c: [126, 214, 255] },     // 天蓝
  { cx: 818, cy: 542, s: 160, rot: 19, c: [255, 160, 190] }     // 粉
];

function inCard(st, x, y, grow = 0) {
  const a = -st.rot * Math.PI / 180;
  const dx = x - st.cx, dy = y - st.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const hs = st.s / 2 + grow;
  const kx = Math.max(Math.abs(lx) - (hs - 34 - grow), 0);
  const ky = Math.max(Math.abs(ly) - (hs - 34 - grow), 0);
  return kx * kx + ky * ky <= (34 + grow) * (34 + grow);
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 3;
    const u = (x - 640) / 640, v = (y - 640) / 640;
    const d2 = u * u + v * v;

    // ── 底色：柔和深蓝渐变
    const g1 = Math.exp(-d2 * 1.35);
    let r = mix(8, 28, g1);
    let g = mix(13, 56, g1);
    let b = mix(22, 108, g1);
    const vig = smooth(0.5, 1.28, Math.sqrt(d2));
    r *= 1 - vig * 0.5; g *= 1 - vig * 0.45; b *= 1 - vig * 0.38;

    // 气泡投影
    const shadow = inBubble(x, y + 26) && !inBubble(x, y + 6);
    if (shadow) { r *= 0.55; g *= 0.6; b *= 0.72; }

    // 表情包投影（从后面往前画，先黄、再蓝、粉）
    for (const st of STK) {
      if (inCard(st, x, y + 20) && !inCard(st, x, y + 8)) { r *= 0.72; g *= 0.76; b *= 0.85; }
    }

    // 气泡主体
    if (inBubble(x, y)) {
      const t = clamp((y - (BUB.cy - BUB.h / 2)) / BUB.h);
      r = mix(r, 244, 1); g = mix(g, 249, 1); b = mix(b, 255, 1);
      void t;
    }
    // 气泡描边
    if (inBubble(x, y, 6) && !inBubble(x, y, 0)) {
      r = mix(r, 120, 0.8); g = mix(g, 170, 0.8); b = mix(b, 245, 0.85);
    }

    // 表情包卡片（逆序绘制，靠前的盖住靠后的）
    for (let k = STK.length - 1; k >= 0; k--) {
      const st = STK[k];
      if (inCard(st, x, y, 0)) {
        const a = -st.rot * Math.PI / 180;
        const lx = (x - st.cx) * Math.cos(a) - (y - st.cy) * Math.sin(a);
        const ly = (x - st.cx) * Math.sin(a) + (y - st.cy) * Math.cos(a);
        const t = clamp((ly + st.s / 2) / st.s);
        let cr = mix(st.c[0] * 0.78, st.c[0], t);
        let cg = mix(st.c[1] * 0.82, st.c[1], t);
        let cb = mix(st.c[2] * 0.86, st.c[2], t);
        // 卡片内的白色小方块：抽象「图内容」，不画五官
        const bs = st.s * 0.25;
        if (Math.abs(lx + st.s * 0.15) < bs && Math.abs(ly + st.s * 0.02) < bs * 1.15) { cr = 255; cg = 255; cb = 255; }
        if (Math.abs(lx - st.s * 0.19) < bs * 0.7 && Math.abs(ly + st.s * 0.04) < bs * 0.7) { cr = 255; cg = 255; cb = 255; }
        r = mix(r, cr, 1); g = mix(g, cg, 1); b = mix(b, cb, 1);
      }
      if (inCard(st, x, y, 5) && !inCard(st, x, y, 0)) {
        r = mix(r, 30, 0.75); g = mix(g, 36, 0.75); b = mix(b, 52, 0.7);
      }
    }

    buf[i] = clamp(r, 0, 255);
    buf[i + 1] = clamp(g, 0, 255);
    buf[i + 2] = clamp(b, 0, 255);
  }
}
fs.writeFileSync(process.argv[2], buf);