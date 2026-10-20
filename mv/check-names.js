'use strict';
/** 候选名占用检查：GitHub 上有没有同名仓库 */
const { execFileSync } = require('child_process');
const gh = 'C:\\Program Files\\GitHub CLI\\gh.exe';

const cands = process.argv.slice(2);
for (const c of cands) {
  let items = [];
  try {
    const out = execFileSync(gh, ['api', `search/repositories?q=${c}+in:name&per_page=30`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    items = JSON.parse(out).items || [];
  } catch (e) { console.log(`${c}\t查询失败`); continue; }
  const exact = items.filter((r) => r.name.toLowerCase() === c.toLowerCase());
  const near = items.slice(0, 3).map((r) => r.full_name);
  if (exact.length) {
    console.log(`${c}\t✗ 已被占用\t${exact.map((r) => r.full_name).join(', ')}`);
  } else {
    console.log(`${c}\t✓ GitHub 空闲\t近似: ${near.join(', ') || '无'}`);
  }
}