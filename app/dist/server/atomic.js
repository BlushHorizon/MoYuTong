'use strict';
/**
 * 原子写文件：先写同目录下的 .tmp，再 rename 覆盖。
 *
 * 为什么必须这样：
 * 「关闭.bat」是用 Stop-Process -Force 杀进程的，杀早杀晚不由程序决定。
 * 若此刻正好卡在 writeFileSync 中途，目标文件会被截断成半截 JSON——
 * 下次启动 load() 解析失败 → 整个聊天记录 / 全部设置直接归零。
 * 先写临时文件再 rename，则「要么是旧的完整内容，要么是新的完整内容」，
 * 不存在写到一半的中间态。
 */
const fs = require('fs');
const path = require('path');

/**
 * 原子写入文本。
 * @param {string} file 目标文件绝对路径
 * @param {string} text 内容
 */
function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    // Windows 上 Node 的 rename 走 MoveFileEx + REPLACE_EXISTING，可直接覆盖
    fs.renameSync(tmp, file);
  } catch (err) {
    // 极端情况（被占用 / 跨卷）退回直接写，至少别把这次改动丢了
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    fs.writeFileSync(file, text, 'utf8');
  }
}

/** 读文件，自动去掉 UTF-8 BOM（PowerShell 写出来的会带） */
function readFileText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

/** 读 JSON（容错 BOM），解析失败抛错 */
function readJson(file) {
  return JSON.parse(readFileText(file));
}

module.exports = { writeFileAtomic, readFileText, readJson };
