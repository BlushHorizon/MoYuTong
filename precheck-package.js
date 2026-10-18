'use strict';
/**
 * 打包前隐私闸门：dist/ 是安装包的唯一来源，一旦混入真实隐私就会随安装包散播。
 * 任何一项命中即 exit 1，中止打包。
 * 用法：node precheck-package.js
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const problems = [];

/* 占位符不算隐私（README 里的示例值） */
const PLACEHOLDER = /^(你的|这里|填写|xxx+|XXX+|<.*>|\.\.\.|CHANGEME|changeme|todo|TODO|null|undefined|示例|example|token|\w*令牌\w*|此处.*|请填.*)$/i;

/** 检查单个 JSON 配置文件（真正会泄漏的地方） */
function checkJsonConfig(rel) {
  const p = path.join(DIST, rel);
  if (!fs.existsSync(p)) return;
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    problems.push(`${rel} :: 不是合法 JSON（${e.message}）`); return;
  }
  const fail = (field, why) => problems.push(`${rel} -> ${field}  ::  ${why}`);

  const tok = cfg?.qq?.onebot?.accessToken;
  if (typeof tok === 'string' && tok.trim() && !PLACEHOLDER.test(tok.trim())) fail('qq.onebot.accessToken', `明文令牌 ${JSON.stringify(tok).slice(0, 24)}…`);

  const key = cfg?.ai?.apiKey;
  if (typeof key === 'string' && key.trim() && !PLACEHOLDER.test(key.trim())) fail('ai.apiKey', `明文 Key ${JSON.stringify(key).slice(0, 24)}…`);

  const cs = cfg?.ai?.commandSenders;
  if (typeof cs === 'string' && cs.trim() && !PLACEHOLDER.test(cs.trim())) fail('ai.commandSenders', `含真实 QQ 号 ${JSON.stringify(cs).slice(0, 24)}…`);

  const tk = cfg?.ai?.targetChatKey;
  if (typeof tk === 'string' && tk.trim()) fail('ai.targetChatKey', `含真实会话目标 ${JSON.stringify(tk).slice(0, 24)}…`);

  /* 任意字段里出现 11 位 QQ/手机号，或 group:数字，或私人域名 */
  const raw = fs.readFileSync(p, 'utf8');
  const m11 = raw.match(/\b1[3-9]\d{9}\b/);
  if (m11) fail('(全文)', `疑似真实 QQ/手机号 ${m11[0]}`);
  const mg = raw.match(/\bgroup:\d{6,}\b/);
  if (mg) fail('(全文)', `疑似真实群号 ${mg[0]}`);
  const md = raw.match(/\b[a-z0-9][a-z0-9-]{2,}\.(top|xyz|cc|vip|cn)\b/);
  if (md && !/^(example|test)\./.test(md[1])) fail('(全文)', `疑似私人服务器域名 ${md[0]}`);
}

/** 浏览器登录态类文件绝不能出现在 dist/ */
const PROFILE_ARTS = ['Login Data', 'Cookies', 'Local State', 'Web Data', 'History', 'Preferences'];
function checkProfileFiles(dir = DIST, depth = 0) {
  if (depth > 8) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'deepseek_profile') problems.push(`${path.relative(DIST, p)}  ::  浏览器登录态目录`);
      checkProfileFiles(p, depth + 1);
      continue;
    }
    if (PROFILE_ARTS.includes(e.name)) problems.push(`${path.relative(DIST, p)}  ::  浏览器登录态文件`);
  }
}

/** dist/ 下的文档与代码：只扫「像真实凭据」的串 */
function checkText(dir = DIST, depth = 0) {
  if (depth > 8) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { checkText(p, depth + 1); continue; }
    if (/\.(exe|mp4|wav|png|jpg|jpeg|gif|zip|ico|woff2?|md)$/i.test(e.name)) continue;
    let t;
    try { t = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const rel = path.relative(DIST, p);
    // 长随机串（典型令牌形态：>=32 位字母数字混排）
    const mTok = t.match(/\b[A-Za-z0-9_-]{32,}\b/g);
    for (const c of (mTok || [])) {
      if (/\d/.test(c) && /[a-z]/i.test(c) && !/^[0-9]+$/.test(c)) problems.push(`${rel}  ::  疑似凭据串 ${c.slice(0, 20)}…`);
    }
    const m11 = t.match(/\b1[3-9]\d{9}\b/g);
    for (const c of new Set(m11 || [])) {
      // 允许出现在「联系邮箱」里（1413214574@qq.com）
      const idx = t.indexOf(c);
      const near = t.slice(Math.max(0, idx - 12), idx + 20);
      if (!/@qq\.com/.test(near)) problems.push(`${rel}  ::  疑似真实 QQ 号 ${c}`);
    }
  }
}

if (!fs.existsSync(DIST)) { console.error('✗ 没有 dist/ 目录'); process.exit(1); }

checkJsonConfig('config.json');
checkProfileFiles();
checkText();

/* data/ 必须为空（登录态由用户自己扫出来，不随包分发） */
const dataDir = path.join(DIST, 'data');
if (fs.existsSync(dataDir)) {
  const n = [];
  (function cnt(d, k = 0) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) cnt(path.join(d, e.name), k + 1); else n.push(path.join(d, e.name));
    }
  })(dataDir);
  if (n.length) problems.push(`dist/data/ 含 ${n.length} 个文件（应为空）：${n.slice(0, 3).map(f => path.relative(DIST, f)).join(', ')}…`);
}

if (problems.length) {
  console.error('\n✗ 打包闸门未通过 —— dist/ 混入真实隐私，已中止：');
  problems.forEach((p) => console.error('  · ' + p));
  console.error('\n修复：dist/config.json 换成干净默认值 + 清空 dist/data/');
  process.exit(1);
}
console.log('✓ 打包闸门通过：dist/ 无真实隐私，可安全打包');