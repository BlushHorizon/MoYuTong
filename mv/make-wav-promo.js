'use strict';
/**
 * 宣传片配乐 v2 —— 150 BPM · 40 秒 · 激进而欢快
 * 纯 JS 合成，零素材。
 * 结构（与画面节拍对齐，1 小节 = 1.6s）：
 *   小节 1-2   0.0-3.2   开场：四踩 kick + 滤波 pad + 上扬 riser
 *   小节 3-5   3.2-8.0   主歌：锯齿 bass + 拍手 + 16 分 hat + 方波琶音 → 小节 5 军鼓滚奏
 *   小节 6-10  8.0-16.0  Drop 1：全力（撞击音在 8.0 落地）
 *   小节 11-12 16.0-19.2 Break：抽掉 kick，大和弦 + 主音
 *   小节 13-14 19.2-22.4 Build：军鼓滚奏 + 上升 riser
 *   小节 15-17 22.4-27.2 Drop 2：最猛（撞击音在 22.4）
 *   小节 18-19 27.2-30.4 断奏 stabs
 *   小节 20-22 30.4-35.2 推进
 *   小节 23-25 35.2-40.0 收尾：大和弦 + 终止撞击（35.2）+ 尾音
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const BPM = 150;
const BEAT = 60 / BPM;        // 0.4s
const BAR = BEAT * 4;         // 1.6s
const BARS = 25;
const DUR = BARS * BAR;       // 40s
const N = Math.floor(SR * DUR);

/* 音名 */
const A2 = 110.0, C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.0;
const A3 = 220.0, C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, B3 = 246.94;
const A4 = 440.0, C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880.0;
const C6 = 1046.5, E6 = 1318.5, G6 = 1568.0, A6 = 1760.0;

const buf = new Float32Array(N);
const add = (i, v) => { if (i >= 0 && i < N) buf[i] += v; };
const noise = () => Math.random() * 2 - 1;

/* ---------- 基础音色 ---------- */
function kick(t0, gain = 0.5) {
  const n = Math.floor(SR * 0.26), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const f = 190 * Math.exp(-p * 26) + 44;
    const env = Math.exp(-p * 11) * (1 - Math.exp(-p * 900));
    add(s + i, Math.sin(2 * Math.PI * f * p) * env * gain);
    add(s + i, noise() * Math.exp(-p * 260) * gain * 0.25);
  }
}
function snare(t0, gain = 0.3) {
  const n = Math.floor(SR * 0.2), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const tone = Math.sin(2 * Math.PI * 196 * p) * 0.5 + Math.sin(2 * Math.PI * 320 * p) * 0.3;
    const env = Math.exp(-p * 24) * (1 - Math.exp(-p * 1400));
    add(s + i, (noise() * 0.85 + tone) * env * gain);
  }
}
function clap(t0, gain = 0.24) {
  for (let k = 0; k < 3; k++) {
    const s = Math.floor(SR * (t0 + k * 0.009));
    const n = Math.floor(SR * 0.13);
    for (let i = 0; i < n; i++) {
      const p = i / SR;
      const env = Math.exp(-p * (k === 2 ? 26 : 70)) * (1 - Math.exp(-p * 1400));
      add(s + i, noise() * env * gain * (k === 2 ? 1 : 0.6));
    }
  }
}
function hat(t0, gain = 0.1, open = false) {
  const len = open ? 0.16 : 0.045;
  const n = Math.floor(SR * len), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    // 高通感：噪声差分
    const env = Math.exp(-p * (open ? 16 : 130));
    add(s + i, noise() * env * gain);
  }
}
function crash(t0, gain = 0.2) {
  const n = Math.floor(SR * 1.4), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.exp(-p * 2.6) * (1 - Math.exp(-p * 900));
    add(s + i, noise() * env * gain);
  }
}
/* 撞击音：低频 thump + 噪声爆 + 快速下坠 */
function impact(t0, gain = 0.85) {
  const n = Math.floor(SR * 0.9), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const f = 120 * Math.exp(-p * 9) + 32;
    const env = Math.exp(-p * 4.2);
    add(s + i, Math.sin(2 * Math.PI * f * p) * env * gain * 0.8);
    add(s + i, noise() * Math.exp(-p * 22) * gain * 0.35);
    add(s + i, noise() * Math.exp(-p * 3.2) * gain * 0.1);
  }
}
/* 上升 riser：噪声 + 扫频 */
function riser(t0, dur, gain = 0.2) {
  const n = Math.floor(SR * dur), s = Math.floor(SR * t0);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / SR, x = i / n;
    const env = Math.pow(x, 1.6) * (1 - x * 0.15);
    lp += (noise() - lp) * (0.02 + 0.5 * x * x);
    add(s + i, lp * env * gain);
    // 扫频方波
    const f = 120 * Math.pow(2, x * 3.2);
    add(s + i, Math.sign(Math.sin(2 * Math.PI * f * p)) * env * gain * 0.18);
  }
}
/* 锯齿 bass（带侧链避让） */
function bass(t0, f, len, gain = 0.34) {
  const n = Math.floor(SR * len), s = Math.floor(SR * t0);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    ph += f / SR;
    const saw = 2 * (ph - Math.floor(ph)) - 1;
    const sub = Math.sin(2 * Math.PI * f * p);
    const env = Math.min(1, i / (SR * 0.005)) * Math.exp(-p * 3.4);
    add(s + i, (saw * 0.7 + sub * 0.6) * env * gain);
  }
}
/* 和弦 stab */
function stab(t0, freqs, len, gain = 0.13) {
  const n = Math.floor(SR * len), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.min(1, i / (SR * 0.004)) * Math.exp(-p * 7);
    let v = 0;
    for (const f of freqs) {
      const ph = f * p;
      v += 2 * (ph - Math.floor(ph)) - 1;             // saw
      v += Math.sign(Math.sin(2 * Math.PI * f * 2 * p)) * 0.2;
    }
    add(s + i, v / freqs.length * env * gain);
  }
}
/* 方波主音 */
function lead(t0, f, len, gain = 0.12) {
  const n = Math.floor(SR * len), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const sq = Math.sign(Math.sin(2 * Math.PI * f * p));
    const sq2 = Math.sign(Math.sin(2 * Math.PI * f * 2 * p)) * 0.22;
    const env = Math.min(1, i / (SR * 0.004)) * Math.exp(-p * 5.5);
    add(s + i, (sq + sq2) * env * gain);
  }
}
/* 明亮的「叮」 */
function ding(t0, f, gain = 0.18, dec = 5) {
  const n = Math.floor(SR * 0.9), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.exp(-p * dec);
    add(s + i, (Math.sin(2 * Math.PI * f * p) + 0.35 * Math.sin(2 * Math.PI * f * 2.01 * p)) * env * gain);
  }
}

/* ---------- 和声进行：Am - F - C - G（明亮上扬），4 小节循环 ---------- */
const PROG = [
  { ch: [A3, C4, E4, A4], bass: A2 },
  { ch: [F3, A3, C4, F4], bass: F3 / 2 },
  { ch: [C4, E4, G4, C5], bass: C3 },
  { ch: [G3, B3, D4, G4], bass: G3 / 2 },
];
const progAt = (bar) => PROG[bar % 4];

/* ---------- 侧链：kick 之后压掉一部分 ---------- */
function sidechain(i) {
  const p = (i / SR) % BEAT;
  return p < 0.16 ? 0.32 + 0.68 * Math.min(1, p / 0.16) : 1;
}

/* ================= 编曲 ================= */
const drop = (bar) => (bar >= 5 && bar <= 9) || (bar >= 14 && bar <= 16) || (bar >= 19 && bar <= 21);
const full = (bar) => (bar >= 5 && bar <= 9) || (bar >= 14 && bar <= 16);

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const P = progAt(bar);
  const isBreak = bar === 10 || bar === 11;
  const isBuild = bar === 4 || bar === 12 || bar === 13;
  const isIntro = bar <= 1;
  const isOutro = bar >= 22;
  const isStab = bar === 17 || bar === 18;

  /* --- 鼓 --- */
  if (!isBreak) {
    for (let b = 0; b < 4; b++) {
      const isLast = isBuild || bar === 25 - 1;
      kick(t0 + b * BEAT, isLast && b === 3 ? 0 : 0.5);
      if (isLast && b === 3) { /* 留白，交给撞击音 */ }
    }
  } else {
    // break：只留第 1 拍
    kick(t0, 0.42);
  }
  if (!isIntro && !isBreak) {
    clap(t0 + BEAT, 0.22); clap(t0 + BEAT * 3, 0.22);
    snare(t0 + BEAT, 0.14); snare(t0 + BEAT * 3, 0.14);
  }
  // hat：8 分基础，drop 时 16 分
  const hatDiv = (drop(bar) || isStab) ? 16 : 8;
  for (let i = 0; i < hatDiv; i++) {
    const tt = t0 + (i * 4 * BEAT) / hatDiv;
    const off = i % 2 === 1;
    hat(tt, off ? 0.055 : 0.085, off && i % 4 === 3);
  }
  // 军鼓滚奏（build 前半 8 分，后半 16 分）
  if (isBuild) {
    const div = 16;
    for (let i = 0; i < div; i++) {
      const x = i / div;
      snare(t0 + (i * BAR) / div, 0.06 + 0.26 * x * x);
    }
    riser(t0, BAR, 0.16);
  }
  // crash
  if ([0, 5, 10, 14, 22].includes(bar)) crash(t0, 0.22);
  if ([2, 13, 16, 21].includes(bar)) crash(t0, 0.1);

  /* --- bass --- */
  if (!isBreak) {
    const pat = isIntro ? [0, 1, 2, 3] : [0, 1.5, 2, 3, 3.5];
    for (const b of pat) {
      const len = isIntro ? BEAT * 0.9 : BEAT * 0.55;
      bass(t0 + b * BEAT, P.bass * (isIntro ? 1 : 2), len, isIntro ? 0.22 : 0.34);
    }
  } else {
    bass(t0, P.bass, BAR * 0.9, 0.3);
  }

  /* --- 和弦 --- */
  if (isBreak) {
    // 长和弦
    stab(t0, P.ch, BAR, 0.1);
    stab(t0 + BAR * 0.5, P.ch.map((f) => f * 1.5), BAR * 0.5, 0.06);
  } else if (isIntro) {
    stab(t0 + BEAT * 2, P.ch, BEAT * 1.8, 0.055);
  } else if (isStab) {
    // 断奏：每拍一下
    for (let b = 0; b < 4; b++) stab(t0 + b * BEAT, P.ch, BEAT * 0.3, 0.11);
    stab(t0 + BEAT * 3.5, P.ch.map((f) => f * 2), BEAT * 0.4, 0.075);
  } else {
    stab(t0 + BEAT * 1, P.ch, BEAT * 0.42, 0.075);
    stab(t0 + BEAT * 3, P.ch, BEAT * 0.42, 0.075);
    if (drop(bar)) stab(t0 + BEAT * 3.5, P.ch.map((f) => f * 2), BEAT * 0.36, 0.06);
  }

  /* --- 琶音 / 主音 --- */
  if (drop(bar) && !isOutro) {
    const arp = [P.ch[0], P.ch[1], P.ch[2], P.ch[3], P.ch[2], P.ch[3], P.ch[1] * 2, P.ch[3]];
    for (let i = 0; i < 8; i++) lead(t0 + (i * BAR) / 8, arp[i], BEAT * 0.4, 0.085);
  } else if (!isIntro && !isBreak) {
    const arp = [P.ch[0] * 2, P.ch[1] * 2, P.ch[2] * 2, P.ch[1] * 2];
    for (let i = 0; i < 4; i++) lead(t0 + i * BEAT, arp[i], BEAT * 0.45, 0.055);
  }
}

/* ---------- 旋律点缀：与画面关键帧对齐 ---------- */
// 开场：单音提示
ding(0.02, A5, 0.2, 3.5);
// 登场撞击（8.0）：撞击音 + 上行三音
impact(8.0, 0.9);
[C5, E5, A5].forEach((f, i) => ding(8.05 + i * 0.09, f, 0.2, 4));
// 表情包段（16.0）：轻快上行
[0, 1, 2, 3].forEach((i) => ding(16.0 + i * 0.4, [A5, C6, E6, A6][i], 0.16, 6));
// 规矩段（22.4）：撞击 + 双音
impact(22.4, 0.85);
[C6, G5].forEach((f, i) => ding(22.45 + i * 0.1, f, 0.18, 5));
// 优势段（28.8）：6 个点子，每拍一个
[...Array(6)].forEach((_, i) => ding(28.8 + i * 0.4, [A5, C6, D5, E5, G5, A6][i], 0.14, 9));
// 收尾（35.2）：撞击 + 大和弦 + 上行三音
impact(35.2, 0.95);
crash(35.2, 0.24);
[0, 1, 2].forEach((i) => ding(36.2 + i * 0.34, [C6, E6, A6][i], 0.2, 3.5));
// 终止重击
impact(39.1, 0.5);

/* ---------- 总处理 ---------- */
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = 1;
  if (t < 0.15) g *= t / 0.15;
  if (t > DUR - 1.1) g *= Math.max(0, 1 - (t - (DUR - 1.1)) / 1.1);
  let v = buf[i] * sidechain(i) * 0.62 * g;
  v = Math.tanh(v * 1.7) * 0.82;      // 软限幅，更「响」
  buf[i] = v;
}

/* ---------- 输出立体声 WAV（右声道 4ms 延时） ---------- */
const R = Buffer.alloc(44 + N * 4);
R.write('RIFF', 0); R.writeUInt32LE(36 + N * 4, 4); R.write('WAVE', 8);
R.write('fmt ', 12); R.writeUInt32LE(16, 16); R.writeUInt16LE(1, 20); R.writeUInt16LE(2, 22);
R.writeUInt32LE(SR, 24); R.writeUInt32LE(SR * 4, 28); R.writeUInt16LE(4, 32); R.writeUInt16LE(16, 34);
R.write('data', 36); R.writeUInt32LE(N * 4, 40);
const DLY = Math.floor(SR * 0.004);
const cl = (x) => Math.max(-32767, Math.min(32767, Math.round(x * 32767)));
for (let i = 0; i < N; i++) {
  R.writeInt16LE(cl(buf[i]), 44 + i * 4);
  R.writeInt16LE(cl(buf[Math.max(0, i - DLY)]), 44 + i * 4 + 2);
}
const file = path.join(__dirname, 'out', 'promo-music.wav');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, R);
console.log(`宣传片配乐 v2 已生成：${file}  ${DUR}s  ${BPM}BPM  立体声  ${(R.length / 1024 / 1024).toFixed(2)} MB`);
