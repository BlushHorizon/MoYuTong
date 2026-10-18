'use strict';
/**
 * 教程 MV 配乐合成器（纯 JS，零素材）
 * 风格：轻快 lo-fi 脉冲 bass + 简单琶音 + 轻打击垫，音量克制，不抢字幕
 * 82 秒，96 BPM，A 小调 → 输出 mv/out/tutorial-music.wav（44.1kHz 16bit 单声道）
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const BPM = 96;
const BEAT = 60 / BPM;            // 0.625s
const BAR = BEAT * 4;             // 2.5s
const BARS = Math.ceil(82 / BAR) + 1;
const DUR = 82;
const N = Math.floor(SR * DUR);

const A2 = 110.0, C3 = 130.81, D3 = 146.83, E3 = 164.81, F = 174.61, G3 = 196.0;
const A3 = 220.0, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392.0;
const A4 = 440.0, C5 = 523.25, E5 = 659.25, G5 = 783.99;

const buf = new Float32Array(N);

function add(idx, v) { if (idx >= 0 && idx < N) buf[idx] += v; }

/* 脉冲 bass（带低通感的方波 + 短包络） */
function bass(t0, freq, len, gain = 0.26) {
  const n = Math.floor(SR * len);
  const start = Math.floor(SR * t0);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * p)) * 0.6;
    const sub = Math.sin(2 * Math.PI * (freq / 2) * p) * 0.5;
    lp += (sq - lp) * 0.22;                    // 一阶低通，去毛刺
    const env = Math.min(1, i / (SR * 0.012)) * Math.exp(-p * 3.4);
    add(start + i, (lp + sub) * env * gain);
  }
}

/* 柔和琶音（三角波 + 明显衰减，像键盘） */
function pluck(t0, freq, gain = 0.14, decay = 3.6) {
  const n = Math.floor(SR * 0.9);
  const start = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.min(1, i / (SR * 0.005)) * Math.exp(-p * decay);
    const v = (Math.sin(2 * Math.PI * freq * p) + 0.35 * Math.sin(4 * Math.PI * freq * p)) * env * gain;
    add(start + i, v);
  }
}

/* 轻打击（短噪声 hi-hat / 底鼓） */
function hat(t0, gain = 0.05) {
  const n = Math.floor(SR * 0.045);
  const start = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const env = Math.exp(-(i / SR) * 90);
    add(start + i, (Math.random() * 2 - 1) * env * gain);
  }
}
function kick(t0, gain = 0.3) {
  const n = Math.floor(SR * 0.2);
  const start = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const f = 110 * Math.exp(-p * 22) + 42;
    const env = Math.exp(-p * 13);
    add(start + i, Math.sin(2 * Math.PI * f * p) * env * gain);
  }
}

/* 编曲：A 小调，段落感靠和弦切换 */
const PROG = [
  [A2, A3, C4, E4],   // Am
  [A2, A3, C4, E4],
  [F, A3, C4, F],  // F
  [G3, B3, D4, G4] // G
];

for (let b = 0; b < BARS; b++) {
  const t0 = b * BAR;
  if (t0 > DUR) break;
  const chord = PROG[b % PROG.length];
  // bass：每小节 1、3 拍
  bass(t0, chord[0] / 2, BEAT * 1.7);
  bass(t0 + BEAT * 2, chord[0] / 2, BEAT * 1.4, 0.22);
  // 底鼓：1、3 拍
  kick(t0, 0.26);
  kick(t0 + BEAT * 2, 0.2);
  // hi-hat：八分
  for (let i = 0; i < 8; i++) hat(t0 + i * BEAT / 2, i % 2 ? 0.035 : 0.05);
  // 琶音：后半小节稍密
  const arp = [chord[3], chord[2], chord[1], chord[2], chord[3], chord[4 % chord.length] || chord[3]];
  for (let i = 0; i < 6; i++) {
    const t = t0 + BEAT * 1.5 + i * BEAT * 0.5;
    if (t > DUR) break;
    pluck(t, arp[i] * 2, 0.075, 4.2);
  }
}

/* 片尾（76s 起）淡出，留白给字幕 */
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = 1;
  if (t > 74) g = Math.max(0, 1 - (t - 74) / (DUR - 74));
  if (t < 1.2) g *= t / 1.2;
  let v = buf[i] * 0.82 * g;
  // 软限幅
  v = Math.tanh(v * 1.25) * 0.82;
  buf[i] = v;
}

/* 输出 WAV（16bit 单声道） */
const dataLen = N * 2;
const out = Buffer.alloc(44 + dataLen);
out.write('RIFF', 0); out.writeUInt32LE(36 + dataLen, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(dataLen, 40);
for (let i = 0; i < N; i++) out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);

const file = path.join(__dirname, 'out', 'tutorial-music.wav');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out);
console.log(`配乐已生成：${file}  ${DUR}s / ${(out.length / 1024 / 1024).toFixed(2)} MB`);