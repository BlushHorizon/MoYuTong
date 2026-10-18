'use strict';
/**
 * 深瞳 MV 配乐合成器（纯 JS，无依赖）
 * 120 BPM 合成波（synthwave）：kick/clap/hat + 贝斯 + 琶音（带回声）+ 铺底 + 主旋律
 * 输出：mv/out/music.wav（44.1kHz 16bit 单声道，36 秒），与 MV 画面时间轴严格对齐
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM;          // 0.5s
const BAR = BEAT * 4;           // 2s
const BARS = 18;                // 36 秒
const DUR = BAR * BARS;
const N = Math.floor(SR * DUR);

/* A 小调音阶（A2 起） */
const A2 = 110.0, B2 = 123.47, C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.0;
const A3 = 220.0, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0;
const A4 = 440.0, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;

const buf = new Float32Array(N);
const delayBuf = new Float32Array(SR);   // 回声（1/8 拍）
let delayIdx = 0;
const DELAY_SAMPLES = Math.floor(SR * BEAT / 2);

/* ---------- 基础声源 ---------- */
function addKick(t0, gain = 0.9) {
  const len = Math.floor(SR * 0.26);
  const s = Math.floor(t0 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 46 + 90 * Math.exp(-t * 34);           // 频率下坠
    const env = Math.exp(-t * 15);
    const v = Math.sin(2 * Math.PI * f * t) * env * gain;
    if (s + i < N) buf[s + i] += v;
  }
}
function addClap(t0, gain = 0.5) {
  const len = Math.floor(SR * 0.16);
  const s = Math.floor(t0 * SR);
  let hp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 26);
    const n = (Math.random() * 2 - 1);
    hp = 0.72 * (hp + n - (0.0));                     // 简易高通
    if (s + i < N) buf[s + i] += hp * env * gain * 0.8;
  }
}
function addHat(t0, gain = 0.22, open = false) {
  const len = Math.floor(SR * (open ? 0.14 : 0.045));
  const s = Math.floor(t0 * SR);
  let hp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * (open ? 16 : 60));
    const n = (Math.random() * 2 - 1);
    hp = 0.93 * (hp + n - prev); prev = n;
    if (s + i < N) buf[s + i] += hp * env * gain;
  }
}
function addBass(t0, freq, dur, gain = 0.34) {
  const s = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 40) * Math.exp(-t * 3.2);
    const ph = t * freq;
    const saw = 2 * (ph - Math.floor(ph + 0.5));      // 锯齿
    const sub = Math.sin(2 * Math.PI * freq * t);     // 圆润的次低音
    lp = 0.82 * lp + 0.18 * (saw * 0.7 + sub * 0.9);  // 低通
    if (s + i < N) buf[s + i] += lp * env * gain;
  }
}
function addArp(t0, freq, dur, gain = 0.14) {
  const s = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 60) * Math.exp(-t * 7);
    const ph = t * freq;
    const square = (ph - Math.floor(ph)) < 0.5 ? 1 : -1;
    const v = square * 0.5 + Math.sin(2 * Math.PI * ph) * 0.5;
    const o = s + i;
    if (o < N) {
      buf[o] += v * env * gain;
      // 回声写入延迟线
      const d = delayBuf[delayIdx];
      delayBuf[delayIdx] = v * env * gain;
      delayIdx = (delayIdx + 1) % delayBuf.length;
      const eo = (o + DELAY_SAMPLES) % N;
      if (eo < N) buf[eo] += d * 0.34;
      else { const d2 = delayBuf[delayIdx]; delayBuf[delayIdx] = v * env * gain; }
    }
  }
}
function addPad(t0, freqs, dur, gain = 0.1) {
  const s = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 3) * Math.min(1, (dur - t) * 2.2);
    let v = 0;
    for (const f of freqs) {
      const d1 = Math.sin(2 * Math.PI * (f * 0.997) * t);
      const d2 = Math.sin(2 * Math.PI * (f * 1.003) * t);
      v += d1 + d2;
    }
    if (s + i < N) buf[s + i] += (v / freqs.length) * env * gain;
  }
}
function addLead(t0, freq, dur, gain = 0.2) {
  const s = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const vib = 1 + Math.sin(2 * Math.PI * 5.2 * t) * 0.004 * Math.min(1, t * 3);
    const ph = t * freq * vib;
    const saw = 2 * (ph - Math.floor(ph + 0.5));
    const env = Math.min(1, t * 30) * Math.exp(-t * 2.6) * (t > dur - 0.08 ? (dur - t) * 12 : 1);
    if (s + i < N) buf[s + i] += saw * env * gain * 0.8;
  }
}
function riser(t0, dur, gain = 0.12) {
  const s = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const p = t / dur;
    const env = p * p;
    const n = (Math.random() * 2 - 1);
    if (s + i < N) buf[s + i] += n * env * gain * 0.5;
  }
}
function impact(t0, gain = 0.5) {
  const len = Math.floor(SR * 1.1);
  const s = Math.floor(t0 * SR);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 4.2);
    const n = (Math.random() * 2 - 1);
    lp = 0.985 * lp + 0.015 * n;
    const f = 55 * Math.exp(-t * 1.5);
    if (s + i < N) buf[s + i] += (lp * 2.2 + Math.sin(2 * Math.PI * f * t)) * env * gain * 0.5;
  }
}

/* ---------- 编曲 ---------- */
// 和声进行（每小节一个）：Am F C G | Am F Dm E | Am F C G | Am Am(结尾)
const PROG = [
  [A3, 'Am'], [F3, 'F'], [C4, 'C'], [G3, 'G'],
  [A3, 'Am'], [F3, 'F'], [D4, 'Dm'], [E4, 'E'],
  [A3, 'Am'], [F3, 'F'], [C4, 'C'], [G3, 'G'],
  [A3, 'Am'], [F3, 'F'], [C4, 'C'], [E4, 'E'],
  [A3, 'Am'], [A3, 'Am']
];
const CHORD = {
  Am: [A3, C4, E4], F: [F3, A3, C4], C: [C4, E4, G4],
  G: [G3, B3, D4], Dm: [D4, F4, A4], E: [E4, G4, A4]
};

// 前奏只铺 pads + 弱鼓；16s 副歌全开
for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const [, name] = PROG[bar];
  const chord = CHORD[name] || CHORD.Am;
  const full = t0 >= BAR * 8;                       // 16 秒后进入全奏
  const intro = t0 < BAR;                            // 第 1 小节只有前奏

  if (!intro) addPad(t0, chord, BAR, 0.085);

  if (full) {
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * BEAT;
      if (b === 0 || b === 2) addKick(tb, 0.95);
      if (b === 1 || b === 3) addClap(tb, 0.5);
      for (let h = 0; h < 2; h++) addHat(tb + h * BEAT / 2, h === 0 ? 0.2 : 0.12, b === 3 && h === 1);
    }
    // 贝斯：根音八分 + 跳八度
    const root = chord[0] / 2;
    for (let e = 0; e < 8; e++) {
      const tb = t0 + e * BEAT / 2;
      const f = (e === 3 || e === 6) ? root * 2 : (e === 7 ? root * 1.5 : root);
      addBass(tb, f, BEAT * 0.42, 0.36);
    }
    // 琶音（十六分，五声音阶循环）
    const pent = [A4, C5, E5, G5, E5, C5];
    for (let e = 0; e < 16; e++) {
      if (e % 4 === 2) continue;                     // 留呼吸
      addArp(t0 + e * BEAT / 4, pent[(bar * 3 + e) % pent.length], BEAT / 4 * 0.9, 0.13);
    }
  } else if (t0 >= BAR * 2) {                        // 弱起：心跳 + 贝斯预告
    addKick(t0, 0.6); addKick(t0 + BEAT * 2, 0.6);
    for (let e = 0; e < 4; e++) addHat(t0 + e * BEAT, 0.1);
    addBass(t0 + BEAT * 3, PROG[bar][0] / 2, BEAT * 0.8, 0.22);
  }

  if (bar === 7) riser(BAR * 7 + BEAT * 2, BAR - BEAT * 2, 0.14);   // 副歌前的过门
  if (bar === 8) impact(t0, 0.55);                                   // 副歌砸下去
  if (bar === 16) impact(t0, 0.45);                                  // 尾声砸一下
}

// 主旋律（跟着歌词高潮走）
const MEL = [
  // [起始(秒), 音, 时值]
  [16.0, A4, 0.5], [16.5, C5, 0.5], [17.0, E5, 1.0], [18.5, D5, 0.5], [19.0, C5, 1.0],
  [20.5, A4, 0.5], [21.0, C5, 0.5], [21.5, E5, 0.5], [22.0, A5, 1.5],
  [24.0, G5, 0.5], [24.5, E5, 0.5], [25.0, D5, 1.5],
  [26.5, E5, 0.5], [27.0, G5, 0.5], [27.5, A5, 1.0], [29.0, G5, 1.0],
  [32.0, A4, 0.5], [32.5, C5, 0.5], [33.0, E5, 2.0]
];
for (const [t, f, d] of MEL) addLead(t, f, d + 0.12, 0.2);

/* ---------- 总线 ---------- */
const fadeIn = Math.floor(SR * 0.06);
const fadeOut = Math.floor(SR * 1.6);
let peak = 0;
for (let i = 0; i < N; i++) {
  let v = buf[i];
  v = Math.tanh(v * 1.15);                           // 软限幅
  if (i < fadeIn) v *= i / fadeIn;
  if (i > N - fadeOut) v *= (N - i) / fadeOut;
  buf[i] = v;
  const a = Math.abs(v);
  if (a > peak) peak = a;
}
const norm = peak > 0 ? 0.92 / peak : 1;
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, buf[i] * norm));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}
const out = path.join(__dirname, 'out', 'music.wav');
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(out, Buffer.concat([header, pcm]));
console.log(`配乐已生成: ${out}（${DUR}s, ${(pcm.length / 1024 / 1024).toFixed(2)}MB, 120BPM A小调）`);