'use strict';
/**
 * 摸鱼瞳 MoYuTong · 监控台前端
 * ---------------------------------------------------------------------------
 * 深色监控面板：状态卡 + 会话概览 + 实时动态（SSE）。
 * 不再提供聊天窗口/输入框——收发全部由 AI 自动完成，这里负责"看得见"。
 */

const $ = (id) => document.getElementById(id);

const state = {
  status: { qq: {}, ai: {} },
  chats: [],
  feed: [],
  self: null,
  stats: { inMsgs: 0, aiReplies: 0, skips: 0 }
};

/* ---------------- 工具 ---------------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function initial(name) {
  return String(name || '?').trim().charAt(0) || '?';
}

async function api(path, options) {
  const resp = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return resp.json();
}

function chatLabel(chatId) {
  const c = state.chats.find((x) => x.id === chatId);
  return c ? c.name : chatId;
}

/* ---------------- 状态卡 ---------------- */
function renderStatus() {
  const qq = state.status.qq || {};
  const pill = $('qqStatusPill');
  pill.classList.toggle('on', !!qq.connected);
  pill.classList.toggle('off', !qq.connected);
  $('qqStatusText').textContent = qq.message || (qq.connected ? '已连接' : '未连接');

  const self = state.self || {};
  $('cardQqMain').textContent = qq.connected ? '已连接' : '未连接';
  $('cardQqMain').className = 'card-main ' + (qq.connected ? 'ok' : 'bad');
  $('cardQqSub').textContent = self.nickname
    ? `账号 ${self.nickname} (${self.userId})`
    : (qq.connected ? '已连接 OneBot' : '等待接入…');

  const ai = state.status.ai || {};
  $('aiToggle').checked = !!ai.enabled;
  const label = document.querySelector('.ai-label');
  if (label) label.textContent = ai.enabled ? 'AI 自动回复' : 'AI 自动回复（关）';

  $('cardAiMain').textContent = ai.enabled ? '运行中' : '已停用';
  $('cardAiMain').className = 'card-main ' + (ai.enabled ? 'ok' : 'dim');
  const scopeText = ai.replyMode === 'target'
    ? (Array.isArray(ai.targetChatKeys) && ai.targetChatKeys.length
        ? (ai.targetChatKeys.length > 1 ? `只回 ${ai.targetChatKeys.length} 个会话` : `只回 ${ai.targetChatKeys[0]}`)
        : '只回 （未选会话）')
    : (ai.scope === 'private' ? '仅私聊' : '私聊+群聊');
  const chanceNote = Number.isFinite(Number(ai.groupReplyChance)) && Number(ai.groupReplyChance) < 100
    ? ` · 群回${ai.groupReplyChance}%` : '';
  const quietNote = ai.quietNow ? ' · 免打扰中' : '';
  $('cardAiSub').textContent = `${ai.providerLabel || ai.provider || '—'} · ${scopeText}${chanceNote}${quietNote}`;

  const ds = ai.deepseek || {};
  if (ai.provider === 'deepseek-web') {
    const map = {
      'need-login': ['bad', '待登录'],
      'ready': ['ok', '就绪'],
      'thinking': ['warn', '思考中'],
      'launching': ['warn', '启动中'],
      'error': ['bad', '异常']
    };
    const [cls, text] = map[ds.state] || ['dim', ds.state || '未连接'];
    $('cardDsMain').textContent = text;
    $('cardDsMain').className = 'card-main ' + cls;
    const rounds = typeof ds.roundCount === 'number' ? `轮次 ${ds.roundCount}/${ds.maxRounds}` : '';
    const prompt = `提示词${ds.promptSet ? (ds.promptSent ? '已发送' : '待发送') : '未设置'}`;
    $('cardDsSub').textContent = [rounds, prompt].filter(Boolean).join(' · ') || '—';
  } else {
    $('cardDsMain').textContent = '未使用';
    $('cardDsMain').className = 'card-main dim';
    $('cardDsSub').textContent = '当前大脑：' + (ai.providerLabel || '—');
  }

  renderStats();
}

function renderStats() {
  $('cardStatMain').textContent = `${state.stats.inMsgs} 收 / ${state.stats.aiReplies} 回`;
  $('cardStatSub').textContent = `会话 ${state.chats.length} · 跳过 ${state.stats.skips}`;
}

/* ---------------- 会话概览 ---------------- */
function renderOverview() {
  const ul = $('overviewList');
  const list = [...state.chats].sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  $('ovHint').textContent = list.length ? `${list.length} 个` : '';
  ul.innerHTML = list.length ? list.map((c) => `
    <li class="ov-item">
      <div class="avatar ${c.type === 'group' ? 'group' : ''}">${escapeHtml(initial(c.name))}</div>
      <div class="info">
        <div class="row">
          <span class="name">${escapeHtml(c.name)}</span>
          <span class="type ${c.type}">${c.type === 'group' ? '群' : '私'}</span>
          <span class="time">${c.lastTime ? fmtTime(c.lastTime) : ''}</span>
        </div>
        <div class="row">
          <span class="last">${escapeHtml(c.lastText || '暂无消息')}</span>
          ${c.unread ? `<span class="badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
        </div>
      </div>
    </li>
  `).join('') : '<li class="ov-empty">暂无会话</li>';
}

/* ---------------- 实时动态 ---------------- */
const KIND_LABEL = {
  in: '收到', out: '发出', ai: 'AI 回复', skip: '跳过', err: '错误'
};

function pushFeed(item) {
  state.feed.unshift(item);
  if (state.feed.length > 120) state.feed.length = 120;
  renderFeed();
}

function renderFeed() {
  const ul = $('feedList');
  if (!state.feed.length) {
    ul.innerHTML = '<li class="feed-empty">等待消息中…</li>';
    return;
  }
  ul.innerHTML = state.feed.map((f) => `
    <li class="feed-item kind-${f.kind}">
      <span class="feed-time">${fmtTime(f.at)}</span>
      <span class="feed-tag">${KIND_LABEL[f.kind] || f.kind}</span>
      <span class="feed-chat">${escapeHtml(f.chatName || '')}</span>
      <span class="feed-text">${escapeHtml(f.text || f.reason || '')}</span>
    </li>
  `).join('');
}

/* ---------------- 数据刷新 ---------------- */
async function refreshChats() {
  const data = await api('/api/chats');
  state.chats = data.chats || [];
  renderOverview();
  renderStats();
}

async function refreshStatus() {
  const data = await api('/api/status');
  state.status = { qq: data.qq, ai: data.ai };
  state.self = data.self;
  renderStatus();
}

/* ---------------- 设置 ---------------- */
async function openSettings() {
  const data = await api('/api/settings');
  const ai = data.ai || {};
  $('setProvider').value = ai.provider || 'deepseek-web';
  $('setEnabled').checked = !!ai.enabled;
  $('setBaseUrl').value = ai.baseUrl || '';
  $('setApiKey').value = ai.apiKey || '';
  $('setApiKey').placeholder = ai.hasKey ? '已配置（留空保持不变）' : '留空则不可用';
  $('setModel').value = ai.model || '';
  $('setScope').value = ai.scope || 'private';
  $('setMention').checked = !!ai.requireMentionInGroup;
  $('setGroupChance').value = ai.groupReplyChance ?? 100;
  $('setKeywords').value = ai.groupKeywords || '';
  $('setImageReply').checked = ai.imageReply !== false;
  $('setGroupAt').checked = ai.groupAtSender !== false;
  $('setGroupQuote').checked = ai.groupQuote !== false;
  $('setQuietEnabled').checked = !!ai.quietEnabled;
  $('setQuietFrom').value = ai.quietFrom || '23:00';
  $('setQuietTo').value = ai.quietTo || '08:00';
  $('setCmdSenders').value = ai.commandSenders || '';
  $('setInterval').value = ai.minIntervalMs ?? 2500;
  $('setPrompt').value = ai.systemPrompt || '';
  $('setCdpPort').value = ai.cdpPort ?? 9222;
  $('setBrowserPath').value = ai.browserPath || '';
  $('setWebPrompt').value = ai.webPrompt || '';
  $('setWebMaxRounds').value = ai.webMaxRounds ?? 50;
  $('setMode').value = data.qq?.mode || 'mock';
  $('setWsUrl').value = data.qq?.onebot?.wsUrl || 'ws://127.0.0.1:3001';
  $('setToken').value = data.qq?.onebot?.accessToken || '';

  // 回复对象：会话多选下拉（来自概览列表）
  $('setReplyMode').value = ai.replyMode === 'target' ? 'target' : 'all';
  const sel = $('setTargetChat');
  sel.innerHTML = '';
  const selected = new Set(Array.isArray(ai.targetChatKeys)
    ? ai.targetChatKeys
    : (ai.targetChatKey ? [ai.targetChatKey] : []));
  const opts = state.chats.map((c) => ({ value: c.id, label: `${c.type === 'group' ? '群' : '私'} · ${c.name}` }));
  for (const k of selected) {
    if (!opts.some((o) => o.value === k)) opts.push({ value: k, label: k });
  }
  sel.innerHTML = opts.map((o) =>
    `<option value="${escapeHtml(o.value)}"${selected.has(o.value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
  toggleTargetView();

  toggleProviderView();
  refreshDsStatus();

  // 网页版模型下拉（切换模型）：列表来自后端站点档案
  try {
    const sr = await api('/api/web/sites');
    const wsel = $('setWebSite');
    wsel.innerHTML = sr.sites.map((s) =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    wsel.value = ai.webProvider || sr.current || 'deepseek';
    const hint = sr.sites.find((s) => s.id === wsel.value);
    $('webSiteHint').textContent = hint ? (hint.hint || '') : '';
    wsel.onchange = () => {
      const h = sr.sites.find((s) => s.id === wsel.value);
      $('webSiteHint').textContent = h ? (h.hint || '') : '';
    };
  } catch { /* 忽略 */ }
  refreshStickers();
  $('settingsModal').classList.remove('hidden');
}

function toggleTargetView() {
  $('targetWrap').classList.toggle('hidden', $('setReplyMode').value !== 'target');
}

function toggleProviderView() {
  const p = $('setProvider').value;
  $('webOnly').classList.toggle('hidden', p !== 'deepseek-web');
  $('apiOnly').classList.toggle('hidden', p === 'deepseek-web');
}

/* ---------------- 表情包 ---------------- */
async function refreshStickers() {
  const statsEl = $('stickerStats');
  const listEl = $('stickerList');
  try {
    const r = await api('/api/stickers');
    statsEl.textContent = `素材：${r.count} 个（商城表情 ${r.mface} / 图片 ${r.image}）`;
    listEl.innerHTML = r.items.length
      ? r.items.map((x) => `
        <div class="sticker-row">
          ${x.kind === 'image' && x.local
            ? `<img class="sticker-thumb" src="/api/stickers/img?key=${encodeURIComponent(x.key)}" onerror="this.style.display='none'" alt="">`
            : `<span class="sticker-emoji">${x.kind === 'mface' ? '🎭' : '🖼'}</span>`}
          <span>${x.kind === 'mface' ? '商城表情 ' + escapeHtml(x.text) : '图片 …' + escapeHtml(x.text)}</span>
          <small>×${x.count}</small>
          <button class="mini-btn danger-btn sticker-del">删除</button>
        </div>`).join('')
      : '<div class="tip">素材库是空的：私聊给机器人发几个表情包、或在群里发，它会自动收藏。之后 AI 就能自己发表情包了，这个按钮也能立刻发。</div>';
    listEl.querySelectorAll('.sticker-del').forEach((btn, i) => {
      btn.addEventListener('click', () => delSticker(r.items[i].key));
    });
  } catch (e) {
    statsEl.textContent = '表情包状态加载失败：' + e.message;
  }
}

function delSticker(key) {
  if (!confirm('删除这个表情包素材？')) return;
  api('/api/stickers', { method: 'DELETE', body: JSON.stringify({ key }) })
    .then(() => refreshStickers())
    .catch((e) => alert('删除失败：' + e.message));
}

function clearStickers() {
  if (!confirm('清空全部表情包素材？机器人之后收到表情包会自动重新收藏。')) return;
  api('/api/stickers/clear', { method: 'POST', body: '{}' })
    .then((r) => {
      alert(`已清空 ${r.removed} 个素材`);
      refreshStickers();
    })
    .catch((e) => alert('清空失败：' + e.message));
}

function testSticker() {
  const btn = $('btnStickerTest');
  btn.disabled = true;
  btn.textContent = '发送中…';
  api('/api/stickers/test', { method: 'POST', body: '{}' })
    .then((r) => {
      btn.disabled = false;
      btn.textContent = '发一个到我 QQ 看看';
      alert(`✅ 已发到 ${r.to}（${r.sent.kind === 'mface' ? '商城表情' : '图片'}「${r.sent.text}」）——去 QQ 看看`);
    })
    .catch((e) => {
      btn.disabled = false;
      btn.textContent = '发一个到我 QQ 看看';
      alert('❌ ' + e.message);
    });
}

function openWebSite() {
  const btn = $('btnWebOpen');
  const site = $('setWebSite') ? $('setWebSite').value : 'deepseek';
  btn.disabled = true;
  btn.textContent = '正在打开…';
  api('/api/web/open', { method: 'POST', body: JSON.stringify({ site }) })
    .then((r) => {
      btn.disabled = false;
      btn.textContent = '① 打开该网站（首次需登录）';
      alert(`已打开「${r.siteName}」：${r.url}\n\n首次使用请在弹出的浏览器窗口里登录一次，登录态会长期记住。\n之后切到「保存」，机器人就用这个模型回复了。`);
    })
    .catch((e) => {
      btn.disabled = false;
      btn.textContent = '① 打开该网站（首次需登录）';
      alert('❌ ' + e.message);
    });
}

async function refreshDsStatus() {
  if ($('setProvider').value !== 'deepseek-web') return;
  try {
    const st = await api('/api/ai/deepseek/status');
    const el = $('dsStatus');
    const rounds = typeof st.roundCount === 'number'
      ? ` ｜ 轮次 ${st.roundCount}/${st.maxRounds}` + (st.roundCount >= st.maxRounds ? '（下次自动新对话）' : '')
      : '';
    const prompt = ` ｜ 提示词：${st.promptSet ? (st.promptSent ? '已发送' : '待发送') : '未设置'}`;
    const site = st.siteName ? ` ｜ 模型：${st.siteName}` : '';
    el.textContent = `状态：${st.state} — ${st.message || ''}${site}${rounds}${prompt}`;
    el.className = 'ds-status ' + (
      st.state === 'ready' ? 'ok'
        : st.state === 'need-login' ? 'warn'
          : st.state === 'error' ? 'err' : '');
  } catch { /* 忽略 */ }
}

// 设置面板打开期间，每 3 秒刷新一次 DeepSeek 状态（轮次/提示词进度）
setInterval(() => {
  const modal = document.getElementById('settingsModal');
  if (modal && !modal.classList.contains('hidden')) refreshDsStatus();
}, 3000);

async function saveSettings() {
  const payload = {
    ai: {
      enabled: $('setEnabled').checked,
      provider: $('setProvider').value,
      webProvider: $('setWebSite') ? $('setWebSite').value : 'deepseek',
      cdpPort: Number($('setCdpPort').value) || 9222,
      browserPath: $('setBrowserPath').value.trim(),
      webPrompt: $('setWebPrompt').value,
      webMaxRounds: Number($('setWebMaxRounds').value) || 50,
      baseUrl: $('setBaseUrl').value.trim(),
      apiKey: $('setApiKey').value,
      model: $('setModel').value.trim(),
      scope: $('setScope').value,
      replyMode: $('setReplyMode').value,
      targetChatKeys: $('setReplyMode').value === 'target'
        ? Array.from($('setTargetChat').selectedOptions).map((o) => o.value).filter(Boolean)
        : [],
      requireMentionInGroup: $('setMention').checked,
      groupReplyChance: (() => { const v = Number($('setGroupChance').value); return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 100; })(),
      groupKeywords: $('setKeywords').value,
      imageReply: $('setImageReply').checked,
      groupAtSender: $('setGroupAt').checked,
      groupQuote: $('setGroupQuote').checked,
      quietEnabled: $('setQuietEnabled').checked,
      quietFrom: $('setQuietFrom').value || '23:00',
      quietTo: $('setQuietTo').value || '08:00',
      commandSenders: $('setCmdSenders').value,
      minIntervalMs: Number($('setInterval').value) || 2500,
      systemPrompt: $('setPrompt').value
    },
    qq: {
      mode: $('setMode').value,
      onebot: {
        wsUrl: $('setWsUrl').value.trim() || 'ws://127.0.0.1:3001',
        accessToken: $('setToken').value
      }
    }
  };
  await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
  $('settingsModal').classList.add('hidden');
  await refreshStatus();
}

/* ---------------- SSE ---------------- */
function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    let evt;
    try { evt = JSON.parse(ev.data); } catch { return; }

    switch (evt.type) {
      case 'hello':
        state.status.qq = evt.qq;
        state.status.ai = evt.ai;
        renderStatus();
        break;
      case 'qq_status':
        state.status.qq = evt.status;
        if (evt.status?.self) state.self = evt.status.self;
        state.status.ai = evt.ai || state.status.ai;
        renderStatus();
        break;
      case 'deepseek_status':
        if (state.status.ai) state.status.ai.deepseek = evt.status;
        renderStatus();
        break;
      case 'settings_changed':
        state.status.ai = evt.ai;
        renderStatus();
        break;
      case 'contacts_seeded':
        if (Array.isArray(evt.chats)) { state.chats = evt.chats; renderOverview(); }
        break;
      case 'message': {
        const m = evt.message;
        const name = m.chatName || chatLabel(`${m.chatType}:${m.chatId}`);
        state.stats.inMsgs++;
        pushFeed({
          kind: m.self ? 'out' : 'in',
          chatName: name,
          text: m.text,
          at: m.time || Date.now()
        });
        if (evt.chat) {
          const idx = state.chats.findIndex((c) => c.id === evt.chat.id);
          if (idx >= 0) state.chats[idx] = evt.chat;
          else state.chats.unshift(evt.chat);
          const c = state.chats.find((x) => x.id === evt.chat.id);
          if (c && !m.self) c.unread = (c.unread || 0) + 1;
          renderOverview();
          renderStats();
        }
        break;
      }
      case 'ai_replied':
        state.stats.aiReplies++;
        pushFeed({
          kind: 'ai',
          chatName: chatLabel(evt.chatId),
          text: evt.text,
          at: evt.at || Date.now()
        });
        renderStats();
        break;
      case 'ai_skip':
        state.stats.skips++;
        pushFeed({
          kind: 'skip',
          chatName: chatLabel(evt.chatId),
          reason: evt.reason,
          at: evt.at || Date.now()
        });
        renderStats();
        break;
      case 'ai_error':
        pushFeed({
          kind: 'err',
          chatName: chatLabel(evt.chatId),
          text: evt.message,
          at: evt.at || Date.now()
        });
        break;
    }
  };
  es.onerror = () => { /* EventSource 自动重连 */ };
}

/* ---------------- 初始化 ---------------- */
function init() {
  $('btnSettings').addEventListener('click', openSettings);
  $('btnSaveSettings').addEventListener('click', saveSettings);
  $('setProvider').addEventListener('change', () => { toggleProviderView(); refreshDsStatus(); });
  $('setReplyMode').addEventListener('change', toggleTargetView);
  $('btnDsOpen').addEventListener('click', async (e) => {
    e.target.textContent = '启动中…';
    await api('/api/ai/deepseek/open', { method: 'POST' });
    setTimeout(refreshDsStatus, 2500);
    e.target.textContent = '① 打开浏览器并登录';
  });
  $('btnDsNew').addEventListener('click', async (e) => {
    e.target.textContent = '处理中…';
    await api('/api/ai/deepseek/new', { method: 'POST' }).catch(() => {});
    e.target.textContent = '② 新建对话';
    refreshDsStatus();
  });
  $('btnDsTest').addEventListener('click', async (e) => {
    e.target.textContent = '等待 DeepSeek…';
    $('dsStatus').textContent = '状态：thinking — 已发送测试消息，正在等待回复…';
    const r = await api('/api/ai/deepseek/test', { method: 'POST', body: JSON.stringify({ text: '用一句话跟朋友说你晚上有空吃饭。' }) }).catch((err) => ({ ok: false, error: err.message }));
    e.target.textContent = '③ 测试回复';
    if (r.ok) {
      $('dsStatus').textContent = `✅ 测试成功（${r.ms}ms）：${r.reply}`;
      $('dsStatus').className = 'ds-status ok';
    } else {
      $('dsStatus').textContent = `❌ 失败：${r.error}`;
      $('dsStatus').className = 'ds-status err';
    }
  });
  $('aiToggle').addEventListener('change', async (e) => {
    await api('/api/ai/toggle', { method: 'POST', body: JSON.stringify({ enabled: e.target.checked }) });
    await refreshStatus();
  });
  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden'));
  });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  });

  // 表情包
  $('btnStickerTest').addEventListener('click', testSticker);
  $('btnStickerClear').addEventListener('click', clearStickers);
  $('btnWebOpen').addEventListener('click', openWebSite);

  refreshStatus();
  refreshChats();
  connectEvents();
  setInterval(refreshStatus, 15000);
  setInterval(refreshChats, 30000);
}

init();
