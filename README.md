# 深瞳 DeepPupil

> 你 QQ 背后的 AI 搭子 —— 本地运行 · 免 API Key · AI 会自己发表情包

深瞳通过 **OneBot 11**（SnowLuma / NapCat 等任意实现）接入你真实的 QQ 账号，用**网页版大模型**当大脑替你自动应答；同时内置网页监控台，连接状态、回复记录、表情包素材全部可视化。Windows 安装包 2.4 MB，双击即用。

![监控台](site/assets/shot-dashboard.png)

## 亮点

- **网页版大模型直连，免 API Key**：内置 **DeepSeek / 通义千问 / Kimi / 小米 MiMo** 四套站点档案，同一套浏览器驱动（CDP）按档案跑，设置里一键切换；也支持任意 OpenAI 兼容接口（填 baseUrl + Key + model 即可，本地 Ollama、中转站都行）
- **表情包引擎（核心特性）**：自动收藏所有来信中的商城表情/图片并**下载本地副本**（QQ 图链会过期，本地副本不会）；AI 回复里写 `[表情]` / `[表情:关键词]` 标记就自动发表情包，一条回复可三连，多个表情包**打包成同一条消息**发出，不会触发刷屏风控；面板里可视化增删
- **只回该回的人**：「指定会话」支持**多选**（Ctrl 点选），选中的会话全部回复，其他一律不回；一个都不选 = 全部回复
- **群聊规矩全套**：需 @ 才回、关键词过滤、非 @ 主动回复概率、自动 @ 触发者、引用原消息、群聊/私聊范围
- **看图回复**：收到图片自动下载后交给 DeepSeek 看图再回（可关）
- **免打扰 + 远程指令**：设定时段自动闭嘴；主人在 QQ 里发 `/状态` `/暂停` `/帮助` 即可管理
- **实时监控台**：网页看板通过 SSE 实时推送消息与回复
- **干净**：零 npm 依赖（Node ≥ 22 内置能力）、无插件、无商城，一个安装包搞定

![表情包管理面板](site/assets/shot-stickers.png)

## 安装与使用

1. 下载安装包（Releases 里的 `深瞳DeepPupil安装包.exe`），默认装到 `D:\深瞳`，覆盖安装不丢数据
2. 启动任意 OneBot 11 机器人端（如 SnowLuma / NapCat），面板里填 WS 地址（默认 `ws://127.0.0.1:3001`）
3. 双击「开启.bat」，浏览器打开监控台 → 点「① 打开该网站」登录一次大模型网页版，之后它自己开工

系统要求：Windows 10/11 + Edge/Chrome + 一台 QQ（建议小号）+ OneBot 11 机器人端。

## 目录结构

```
DeepPupil/
├─ app/                  软件本体（零依赖 Node 服务 + 监控台前端 + NSIS 打包）
│  ├─ server/            server.js / ai.js / deepseek-web.js / web-sites.js / stickers.js / qq-adapter.js …
│  ├─ public/            监控台页面（index.html / app.js / style.css）
│  ├─ dist/              安装包打包源（与 server/public 同步）
│  ├─ setup.nsi          NSIS 安装脚本
│  ├─ launcher.ps1       启动器（开启/关闭/重启服务）
│  └─ config.json        配置（首次运行自动生成）
├─ site/                 官网（纯静态，双击 index.html 即可）
├─ mv/                   MV 全部由代码生成：mv.html 画面 + make-wav.js 配乐合成
│  └─ out/               deeppupil-mv.mp4 成片 / music.wav 配乐
└─ docs/技术文档.md      详细技术文档（架构、接口、协议、故障排查）
```

## 本地开发

```bash
cd app
node server/server.js       # 或 Windows 下双击 start.bat
# 打开 http://127.0.0.1:8787
```

- 无第三方依赖：浏览器控制走 Chrome DevTools Protocol（CDP），WebSocket 用 Node ≥ 22 的全局 `WebSocket`
- 切换网页版模型：`ai.webProvider` 配置项（deepseek / qianwen / kimi / mimo），站点档案在 `server/web-sites.js`，新增站点 = 加一条档案
- 构建安装包：装 [NSIS](https://nsis.sourceforge.io/)，在 `app/` 下执行 `makensis setup.nsi`，产物默认输出到安装包目录

## 官网与 MV

- `site/`：纯静态官网，零外部依赖，双击 `index.html` 即可打开（内嵌 MV 视频与安装包下载）
- `mv/`：这支 MV 没有用任何剪辑软件——配乐是 `make-wav.js` 现场合成的 120 BPM 合成波，画面是 `mv.html` canvas 逐帧离格渲染（`node capture.js 24` 抓帧），`redact.js` 给截图打码。想改歌词/配色直接改 `mv.html` 重跑即可

![MV](site/assets/mv-poster.jpg)

## 隐私

- 所有数据都在你自己的机器上：`D:\深瞳\data`（聊天记录、表情包库、浏览器登录态、日志），**没有任何遥测与联网上传**
- 本仓库已剔除全部个人数据（QQ 号、群号、真实会话名、聊天记录、浏览器登录态、日志），`config.json` 为出厂默认

> ⚠️ 自动化回复有触发 QQ 风控的可能（高频发消息/发图）。深瞳内置了最小回复间隔、表情包批量单条、40 秒冷却、免打扰时段等护栏，但请自行控制频率、遵守平台规则，**请勿用于骚扰**。建议使用小号。

## 免责声明

本项目与 QQ / DeepSeek / 通义 / 月之暗面 / 小米等官方无关；各网站的结构变更可能导致网页驱动需要调整（站点档案集中在一个文件里，便于跟进）。使用者需自行确保行为符合所在平台的服务条款与当地法律法规。

## License

MIT © DeepPupil contributors