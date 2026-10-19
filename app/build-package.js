'use strict';
/**
 * 打包前的唯一准备入口。
 *
 * 以前 dist/ 是手工拷的，一天里因此踩了两次坑（改了源码忘了同步 → 用户装到旧代码；
 * 手滑把带真实凭证的 config.json 拷进 dist → 隐私跟着安装包发出去）。
 * 现在所有「进 dist 的东西」只经过这里：
 *
 *   node build-package.js             只同步 + 过闸门
 *   node build-package.js --installer 同步 + 过闸门 + makensis 出安装包
 *
 * 关键约束：
 *   · dist/config.json 永远由 server/config.js 里的 DEFAULT_CONFIG 现生成，
 *     绝不从任何「正在使用的」config.json 拷——那种文件里一定有 accessToken。
 *   · 同步是「先清空再拷」，避免上一次的残留文件继续躺在包里（setup.nsi 就这么漏进去过）。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

/* 目录级同步 */
const DIRS = ['server', 'public', 'assets'];
/* 单文件同步（从源根目录） */
const FILES = ['launcher.ps1', 'README.md'];
/* 只同步固定几个 bat：start.bat / 停止服务.bat 是开发用的，不进包 */
const BATS = ['开启.bat', '关闭.bat'];

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('=== 1. 同步源码 → dist/ ===');
fs.mkdirSync(DIST, { recursive: true });
let n = 0;
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  if (!fs.existsSync(src)) { console.log('  跳过(不存在) ' + dir); continue; }
  rmrf(path.join(DIST, dir));            // 先清空：残留文件会一直躺在包里
  copyDir(src, path.join(DIST, dir));
  const cnt = (function c(d) { let k = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) k += e.isDirectory() ? c(path.join(d, e.name)) : 1; return k; })(src);
  n += cnt;
  console.log(`  ${dir}/  (${cnt} 个文件)`);
}
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.log('  跳过(不存在) ' + f); continue; }
  fs.copyFileSync(src, path.join(DIST, f));
  n++;
  console.log('  ' + f);
}
for (const f of BATS) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.log('  跳过(不存在) ' + f); continue; }
  fs.copyFileSync(src, path.join(DIST, f));
  n++;
  console.log('  ' + f);
}

console.log('\n=== 2. 现生成 dist/config.json（唯一来源：DEFAULT_CONFIG + 出厂覆盖）===');
const configLib = require(path.join(ROOT, 'server', 'config.js'));
/* 出厂默认与「代码默认」故意不同，别把它们混为一谈：
 *   DEFAULT_CONFIG 是「什么都没有时的兜底」，最保守（演示模式、AI 关）；
 *   安装包装给用户的必须是「按教程走一遍就能用」的状态——
 *   教程视频里的步骤是「面板里填 WS 地址 → 保存 → 重启」，全程没让人切过接入方式，
 *   所以这里必须是 onebot（地址已预填）且 AI 已启用，否则照着教程做完全程静默不响应。
 * 两者都绝不含任何真实凭证——这个对象是硬编码的，不来自任何运行中的配置。 */
const PACKAGE_OVERRIDES = {
  qq: { mode: 'onebot', onebot: { wsUrl: 'ws://127.0.0.1:3001', accessToken: '' } },
  ai: { enabled: true }
};
const packaged = JSON.parse(JSON.stringify(configLib.DEFAULT_CONFIG));
packaged.qq.mode = PACKAGE_OVERRIDES.qq.mode;
packaged.qq.onebot = { ...PACKAGE_OVERRIDES.qq.onebot };
packaged.ai.enabled = PACKAGE_OVERRIDES.ai.enabled;
fs.writeFileSync(path.join(DIST, 'config.json'), JSON.stringify(packaged, null, 2), 'utf8');
n++;
{
  const c = packaged;
  console.log('  qq.mode               = ' + JSON.stringify(c.qq.mode) + '   ← 教程依赖此默认值');
  console.log('  ai.enabled            = ' + JSON.stringify(c.ai.enabled));
  console.log('  qq.onebot.accessToken = ' + JSON.stringify(c.qq.onebot.accessToken) + (c.qq.onebot.accessToken ? '  ⚠ 非空！' : '  ✓'));
  console.log('  ai.apiKey             = ' + JSON.stringify(c.ai.apiKey) + (c.ai.apiKey ? '  ⚠ 非空！' : '  ✓'));
  console.log('  ai.commandSenders     = ' + JSON.stringify(c.ai.commandSenders) + '  ✓');
  console.log('  ai.targetChatKey(s)   = ' + JSON.stringify(c.ai.targetChatKey) + ' / ' + JSON.stringify(c.ai.targetChatKeys) + '  ✓');
}

console.log('\n=== 3. 清掉不该进包的文件 ===');
for (const junk of ['setup.nsi', 'data', 'precheck-package.js', 'server/atomic.js.tmp']) {
  const p = path.join(DIST, junk);
  if (fs.existsSync(p)) {
    if (junk === 'data') {
      // 允许存在但必须是空目录
      const inside = fs.readdirSync(p);
      if (inside.length) { rmrf(p); console.log('  已删除 dist/data（非空，说明混进了运行数据）: ' + inside.join(', ')); }
      else console.log('  dist/data 是空目录，保留');
    } else {
      rmrf(p);
      console.log('  已删除 dist/' + junk);
    }
  }
}

console.log('\n=== 4. 隐私闸门 ===');
const pre = spawnSync(process.execPath, [path.join(ROOT, 'precheck-package.js')], { encoding: 'utf8' });
process.stdout.write((pre.stdout || '') + (pre.stderr || ''));
if (pre.status !== 0) {
  console.error('\n✗ 闸门没过，拒绝打包。先处理上面列出的问题。');
  process.exit(1);
}
console.log('\n✓ 同步完成，dist/ 共 ' + n + ' 个文件，可安全打包。');

if (process.argv.includes('--installer')) {
  console.log('\n=== 5. 编译安装包 ===');
  const makensis = ['C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe']
    .find((p) => fs.existsSync(p));
  if (!makensis) { console.error('✗ 找不到 makensis.exe'); process.exit(1); }
  const r = spawnSync(makensis, ['setup.nsi'], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write((r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) { console.error('✗ makensis 失败'); process.exit(1); }
  const out = 'H:\\安装包\\摸鱼瞳MoYuTong安装包.exe';
  if (fs.existsSync(out)) {
    const buf = fs.readFileSync(out);
    const crypto = require('crypto');
    console.log('  ✓ ' + out + '  ' + (buf.length / 1024).toFixed(1) + ' KB  MD5=' + crypto.createHash('md5').update(buf).digest('hex').toUpperCase().slice(0, 12));
  }
}
