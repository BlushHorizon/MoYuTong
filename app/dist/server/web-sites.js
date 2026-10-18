'use strict';
/**
 * 网页版模型站点档案（切换模型用）
 * ---------------------------------------------------------------------------
 * 同一个浏览器驱动（CDP）按站点档案跑：输入框、发送按钮、回答块、生成中标记、
 * 新建对话文案各不相同，都写在这里。选择器宁可多写几层兜底——页面改版时不至于全线崩。
 * 新增站点 = 在这张表里加一条（URL + 选择器），代码不用动。
 *
 * 选择器来源：各站点真实页面结构（登录后布局可能微调，故每项都有多层兜底 + Enter 键发送兜底）。
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
    hint: '已在用的引擎，登录态存在程序配置的浏览器目录里'
  },
  qianwen: {
    id: 'qianwen',
    name: '通义千问 网页版',
    short: '千问',
    url: 'https://www.qianwen.com/',
    editable: true,           // 输入框是 contenteditable
    input: '[contenteditable="true"]',
    send: ['[class*="sendBtn"]', 'button[class*="send"]', '.ant-btn-primary', 'button[class*="primary"]'],
    answer: ['.qk-markdown', '.markdown-body', '[class*="markdown"]', '[data-message-author-role="assistant"]'],
    generating: ['button[aria-label*="停止"]', '[class*="stop"]', '[data-testid="stop-button"]'],
    newChat: ['新对话'],
    chatUrlMark: '/chat/',
    navigateFallback: true,
    loginWords: '登录|扫码',
    loginSelectors: [],
    images: false,
    hint: '首次使用点“打开网站”登录一次（阿里账号扫码），登录态会记住'
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi 网页版',
    short: 'Kimi',
    url: 'https://www.kimi.com/',
    editable: true,
    input: '[contenteditable="true"]',
    send: ['[class*="sendBtn"]', 'button[class*="send"]', '[class*="send"] button', 'button[class*="primary"]'],
    answer: ['.markdown', '.markdown-body', '[class*="markdown"]', '[data-message-author-role="assistant"]'],
    generating: ['button[aria-label*="停止"]', '[class*="stop"]', '[data-testid="stop-button"]'],
    newChat: ['新建会话', '新会话'],
    chatUrlMark: '/chat/',
    navigateFallback: true,
    loginWords: '登录|手机号',
    loginSelectors: [],
    images: false,
    hint: '首次使用点“打开网站”登录一次（月之暗面账号），登录态会记住'
  },
  mimo: {
    id: 'mimo',
    name: '小米 MiMo 网页版',
    short: 'MiMo',
    url: 'https://aistudio.xiaomimimo.com/#/c',
    editable: false,
    input: 'textarea',
    send: ['[class*="sendBtn"]', 'button[class*="send"]', 'button[class*="primary"]'],
    answer: ['.markdown-body', '[class*="markdown"]', '[class*="assistant"]', '[data-message-author-role="assistant"]'],
    generating: ['button[aria-label*="停止"]', '[class*="stop"]', '[data-testid="stop-button"]'],
    newChat: ['新对话', '新建会话', '新建'],
    chatUrlMark: '#/c',
    navigateFallback: true,
    loginWords: '登录|扫码',
    loginSelectors: ['[class*="login"]'],
    images: false,
    hint: '面向开发者的模型演示平台（MiMo-V2.6-Pro），首次使用需登录'
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