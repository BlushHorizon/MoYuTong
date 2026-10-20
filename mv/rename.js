'use strict';
/** 深瞳 DeepPupil → 群崽 QunZai 全量改名（文本文件 + 文件名） */
const fs = require('fs');
const path = require('path');

const SRC = (process.env.QUNZAI_SRC || process.cwd());
const MAP = [
  ['深瞳 DeepPupil', '群崽 QunZai'],
  ['深瞳DeepPupil安装包', '群崽QunZai安装包'],
  ['深瞳DeepPupil', '群崽QunZai'],
  ['DEEPUPIL', 'QUNZAI'],
  ['DeepPupil', 'QunZai'],
  ['deeppupil', 'qunzai'],
  ['深瞳', '群崽'],
  ['shentou520', 'qunzai520']
];
const TEXT_EXT = /\.(js|html|css|md|json|nsi|ps1|bat)$/i;

const targets = [
  ...walk(path.join(SRC, 'qq-web/server')),
  ...walk(path.join(SRC, 'qq-web/public')),
  path.join(SRC, 'qq-web/README.md'),
  path.join(SRC, 'qq-web/setup.nsi'),
  path.join(SRC, 'qq-web/launcher.ps1'),
  path.join(SRC, 'qq-web/package.json'),
  ...walk(path.join(SRC, 'site')),
  path.join(SRC, 'mv/mv.html'),
  path.join(SRC, 'mv/make-wav.js')
];

let changed = 0;
for (const f of targets) {
  if (!fs.existsSync(f) || !TEXT_EXT.test(f)) continue;
  let t = fs.readFileSync(f, 'utf8');
  const before = t;
  for (const [a, b] of MAP) t = t.split(a).join(b);
  if (t !== before) {
    fs.writeFileSync(f, t, 'utf8');
    changed++;
    console.log('改: ' + f.replace(SRC + '/', ''));
  }
}

// 文件改名
const renames = [
  [path.join(SRC, 'site/assets/deeppupil-mv.mp4'), path.join(SRC, 'site/assets/qunzai-mv.mp4')],
  [path.join(SRC, 'mv/out/deeppupil-mv.mp4'), path.join(SRC, 'mv/out/qunzai-mv.mp4')],
  [path.join(SRC, 'site/assets/深瞳DeepPupil安装包.exe'), path.join(SRC, 'site/assets/群崽QunZai安装包.exe')]
];
for (const [a, b] of renames) {
  if (fs.existsSync(a)) {
    try { fs.renameSync(a, b); console.log('改名: ' + path.basename(a) + ' → ' + path.basename(b)); } catch (e) { console.log('改名失败: ' + e.message); }
  }
}
console.log(`完成，共改写 ${changed} 个文本文件`);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (TEXT_EXT.test(name)) out.push(p);
  }
  return out;
}