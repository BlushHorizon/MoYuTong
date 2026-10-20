'use strict';
/** 严格重扫 + 修正：深瞳 / DeepPupil / deeppupil / DEEPUPIL / DEEPUPUL / shentou520 */
const fs = require('fs');
const path = require('path');
const SRC = (process.env.QUNZAI_SRC || process.cwd());
const MAP = [
  ['深瞳 DeepPupil', '群崽 QunZai'],
  ['深瞳DeepPupil', '群崽QunZai'],
  ['DEEPPUPIL', 'QUNZAI'],
  ['DEEPUPIL', 'QUNZAI'],
  ['DeepPupil', 'QunZai'],
  ['deeppupil', 'qunzai'],
  ['深瞳', '群崽'],
  ['shentou520', 'qunzai520']
];
const OLD = /深瞳|DeepPupil|deeppupil|DEEPPUPIL|DEEPUPUL|shentou520/;
const EXT = /\.(js|html|css|md|json|nsi|ps1|bat|txt)$/i;

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git') continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(n)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(path.join(SRC, 'qq-web/server')),
  ...walk(path.join(SRC, 'qq-web/public')),
  path.join(SRC, 'qq-web/README.md'),
  path.join(SRC, 'qq-web/setup.nsi'),
  path.join(SRC, 'qq-web/launcher.ps1'),
  ...walk(path.join(SRC, 'site')),
  path.join(SRC, 'mv/mv.html'),
  path.join(SRC, 'mv/make-wav.js'),
  path.join(SRC, 'mv/capture.js'),
  ...walk(path.join(SRC, 'open-source/DeepPupil/docs'))
].filter((f) => fs.existsSync(f));

let fixed = 0;
for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  if (!OLD.test(t)) continue;
  for (const [a, b] of MAP) t = t.split(a).join(b);
  fs.writeFileSync(f, t, 'utf8');
  fixed++;
  console.log('修正: ' + f.replace(SRC + '/', ''));
}
console.log(`共修正 ${fixed} 个文件`);

// 复核
let bad = 0;
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const m = t.match(OLD);
  if (m) { bad++; console.log('⚠ 仍残留 ' + f.replace(SRC + '/', '') + ' → ' + m[0]); }
}
console.log(bad ? `⚠ ${bad} 个文件仍有残留` : '✓ 复核零残留');