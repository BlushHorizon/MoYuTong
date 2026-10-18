'use strict';
/**
 * 网页版模型站点档案
 * ---------------------------------------------------------------------------
 * 同一个浏览器驱动（CDP）按站点档案跑：输入框、发送按钮、回答块、生成中标记、
 * 新建对话文案各不相同，都写在这里。选择器宁可多写几层兜底——页面改版时不至于全线崩。
 * 新增站点 = 在这张表里加一条（URL + 选择器），代码不用动。
 *
 * 目前只保留 DeepSeek 网页版（千问 / Kimi / MiMo 的档案已按需求下线，需要时按此表加回即可）。
 */
const SITES = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek 网页版',
    short: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    editable: false,          // 输入框是 textarea
    input: 'textarea',
    send: ['.ds-button--primary.ds-button--filled', '.ds-button--primary', '.ds-button--ci'],
    answer: ['.ds-markdown', '.ds-markdown--block', '.fbb737a4'],
    generating: ['.ds-icon-stop', '[class*="stopButton"]', 'button[aria-label*="停止"]', '[data-testid="stop-button"]'],
    newChat: ['开启新对话'],
    chatUrlMark: '/a/chat/s/',
    navigateFallback: false,  // “开启新对话”按钮点击已验证可靠
    loginWords: '登录|扫码',
    loginSelectors: [],
    images: true,             // 支持看图上传（CDP 直接塞本地文件）
    hint: '登录态存在程序自带的浏览器配置目录里；首次点“① 打开该网站”扫码一次即可长期复用'
  }
};

const DEFAULT_SITE = 'deepseek';

/** 取站点档案（未知 id 回落默认站点，页面永远不会因配错而全瘫） */
function getSite(id) {
  return SITES[String(id || '')] || SITES[DEFAULT_SITE];
}

/** 网页端下拉用的列表 */
function siteList() {
  return Object.values(SITES).map((s) => ({
    id: s.id, name: s.name, short: s.short, url: s.url, hint: s.hint || '', images: !!s.images
  }));
}

module.exports = { SITES, DEFAULT_SITE, getSite, siteList };