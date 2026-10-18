'use strict';
/**
 * 宣传片配乐（纯 JS 合成，零素材）
 * 风格：欢快明亮 · C 大调五声 + 跳跳的合成器 bass + 拍手 clap + 轻快 hat
 * 60 秒，120 BPM
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM;          // 0.5s
const BAR = BEAT * 4;           // 2s
const BARS = 30;                // 60s
const DUR = 60;
const N = Math.floor(SR * DUR);

const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, A4 = 440.0, B3 = 493.88;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0, C6 = 1046.5;
const G3 = 196.0, G2 = 98.0, C3 = 130.81, A2 = 110.0, F2 = 87.31;

const buf = new Float32Array(N);
const add = (i, v) => { if (i >= 0 && i < N) buf[i] += v; };

/* 跳跳的方波 bass */
function bass(t0, f, len, gain = 0.3) {
  const n = Math.floor(SR * len), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const sq = Math.sign(Math.sin(2 * Math.PI * f * p));
    const env = Math.min(1, i / (SR * 0.004)) * Math.exp(-p * 7);
    add(s + i, sq * env * gain);
  }
}
/* 明亮的方波和弦（跳跳的电钢感） */
function chip(t0, f, len, gain = 0.14, decay = 9) {
  const n = Math.floor(SR * len), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const sq = Math.sign(Math.sin(2 * Math.PI * f * p));
    const sq2 = Math.sign(Math.sin(2 * Math.PI * f * 2 * p)) * 0.25;
    const env = Math.min(1, i / (SR * 0.003)) * Math.exp(-p * decay);
    add(s + i, (sq * 0.7 + sq2) * env * gain);
  }
}
/* 拍手 */
function clap(t0, gain = 0.2) {
  const n = Math.floor(SR * 0.2), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.exp(-p * 34) * (1 - Math.exp(-p * 900));
    add(s + i, (Math.random() * 2 - 1) * env * gain);
  }
}
function hat(t0, gain = 0.08) {
  const n = Math.floor(SR * 0.05), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) add(s + i, (Math.random() * 2 - 1) * Math.exp(-(i / SR) * 110) * gain);
}
function kick(t0, gain = 0.34) {
  const n = Math.floor(SR * 0.22), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const f = 150 * Math.exp(-p * 20) + 48;
    add(s + i, Math.sin(2 * Math.PI * f * p) * Math.exp(-p * 12) * gain);
  }
}
/* 上扬的「叮」——用在标题出现的地方 */
function ding(t0, f, gain = 0.16) {
  const n = Math.floor(SR * 0.7), s = Math.floor(SR * t0);
  for (let i = 0; i < n; i++) {
    const p = i / SR;
    const env = Math.exp(-p * 6);
    add(s + i, (Math.sin(2 * Math.PI * f * p) + 0.4 * Math.sin(4 * Math.PI * f * p)) * env * gain);
  }
}

/* 和弦进行（C 大调欢快循环） */
const PROG = [
  [C4, E4, G4],   // C
  [G3, C4, E4],   // Am/G
  [C4, E4, A4],   // Am
  [G3, B3, D4], // G
  [F4, A4, C5],   // F
  [G3, B3, D4],   // G
  [C4, E4, G4],
  [G3, D4, G4]    // G
];
const BASS = [G2, G2, A2, G2, F2, G2, C3, G2];

for (let b = 0; b < BARS; b++) {
  const t0 = b * BAR;
  const ch = PROG[b % PROG.length];
  const bf = BASS[b % BASS.length];
  // 四踩 bass（跳跳的）
  for (let i = 0; i < 4; i++) bass(t0 + i * BEAT, bf, BEAT * 0.85, i % 2 ? 0.24 : 0.3);
  // kick 1、3 拍
  kick(t0, 0.32); kick(t0 + BEAT * 2, 0.28);
  // clap 2、4 拍
  clap(t0 + BEAT, 0.18); clap(t0 + BEAT * 3, 0.18);
  // 八分 hat
  for (let i = 0; i < 8; i++) hat(t0 + i * BEAT / 2, i % 2 ? 0.05 : 0.075);
  // 分解和弦（琶音）
  const arp = [ch[0], ch[1], ch[2], ch[1], ch[0] * 2, ch[2], ch[1], ch[0]];
  for (let i = 0; i < 8; i++) chip(t0 + i * BEAT / 2, arp[i], BEAT * 0.45, 0.1, 12);
  // 高音铺底（副歌感）
  if (b % 2 === 1) {
    chip(t0 + BEAT * 1.5, ch[2] * 2, BEAT * 1.2, 0.06, 6);
    chip(t0 + BEAT * 3.5, ch[2] * 2, BEAT * 1.2, 0.06, 6);
  }
}
/* 几个「叮」的点：对应片头、登场、表情包、号召 */
[[0.15, C6], [13.2, E5], [22.3, G5], [31.3, A5], [40.3, C6], [49.4, E5]]
  .forEach(([t, f]) => ding(t, f, 0.2));
/* 结尾上行三音 */
[52.0, 52.35, 52.7].forEach((t, i) => ding(t, [C6, E5, G5][i] || C6, 0.22));

/* 整体处理：淡入淡出 + 软限幅 + 轻微立体感（左右微延时） */
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = 1;
  if (t < 0.6) g *= t / 0.6;
  if (t > 57) g *= Math.max(0, 1 - (t - 57) / 3);
  let v = buf[i] * 0.72 * g;
  v = Math.tanh(v * 1.35) * 0.85;
  buf[i] = v;
}

/* 立体声：右声道延后 3ms，制造轻微空间感 */
const R = Buffer.alloc(44 + N * 4);
R.write('RIFF', 0); R.writeUInt32LE(36 + N * 4, 4); R.write('WAVE', 8);
R.write('fmt ', 12); R.writeUInt32LE(16, 16); R.writeUInt16LE(1, 20); R.writeUInt16LE(2, 22);
R.writeUInt32LE(SR, 24); R.writeUInt32LE(SR * 4, 28); R.writeUInt16LE(4, 32); R.writeUInt16LE(16, 34);
R.write('data', 36); R.writeUInt32LE(N * 4, 40);
const DLY = Math.floor(SR * 0.003);
const clamp16 = (x) => Math.max(-32767, Math.min(32767, Math.round(x * 32767)));
for (let i = 0; i < N; i++) {
  R.writeInt16LE(clamp16(buf[i]), 44 + i * 4);
  R.writeInt16LE(clamp16(buf[Math.max(0, i - DLY)]), 44 + i * 4 + 2);
}
const file = path.join(__dirname, 'out', 'promo-music.wav');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, R);
console.log(`宣传片配乐已生成：${file}  ${DUR}s  立体声  ${(R.length / 1024 / 1024).toFixed(2)} MB`);