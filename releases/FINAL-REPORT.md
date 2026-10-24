# 群崽 QunZai v1.4.9 发布记录

发布日期：2026-10-25
状态：安装包内置 QQ 监视器（NapCat）与 Node 运行时；表情包接入在线图库「梗鲸 · DeepSeek娘」。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.9.exe` |
| 大小 | 84,457,054 B / 80.5 MB |
| SHA256 | `ec38348cd48ce066fc9a135734c2ad748dd851b3c7511e8436e43c9028f927f0` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

> v1.4.9 体积从 342 KB 涨到 80.5 MB，涨的全部是随包内置的 NapCat 运行时（含 node.exe 与 wrapper.node）。群崽自身仍然零 npm 依赖、代码量没有数量级变化。

## 本版内容

### 一、内置 QQ 监视器（NapCat）

- 安装包自带 NapCat Shell（Windows + Node 版），解压到 `安装目录\engine\napcat`，不用用户自己下载
- 设置页新增「群崽 QQ 内核」区块：运行时目录、机器人 QQ、启动时自动检测、自动检测 / 启动并同步 / 停止本次启动
- 首次启动直接在面板里显示扫码二维码（`/api/engine/qr` 直接下发 `cache/qrcode.png`），扫完即登录
- 新增「打开它的管理面板」按钮，读 `config/webui.json` 里的实时 token 拼 URL，不写死、不预置
- 支持「我自己找的」监视器：填目录即可识别 SnowLuma / NapCat / LLOneBot 等 OneBot 11 实现
- 启动超时从 45 秒放宽，并在超时时给出可读原因（最常见：本机没装桌面版 QQ）

### 二、表情包接入梗鲸图库

- 新增 `app/server/sticker-gallery.js`：抓 `https://aigengtu.com/DeepSeek%E5%A8%98`，本机实测 **2309 张**
- 每张图带描述文本，AI 写 `[表情:关键词]` 时先翻群友素材，翻不到再按描述去图库匹配
- 用到哪张下哪张，只缓存在 `data/stickers`，站点不可达自动跳过，不影响聊天
- 设置页新增图库面板：张数 / 今天更新 / 刷新图库 / 缩略图墙
- 修正关键词匹配：有关键词就必须真命中，宁可只发文字，不再硬塞随机图

### 三、延续

- 延续 v1.4.8：官网 / README / 关于页的爱发电入口，外链走系统默认浏览器
- 延续 v1.4.7：服务停止后点 X 直接退出，不驻留托盘
- 延续 v1.4.6：回复冷却可自定义、可关闭

## 验证

- **干净安装**：静默装到 `C:\temp_final`，目录结构正常，`engine\napcat\napcat\config\` 只有官方 `napcat.json`（310 B）
- **引擎状态**：`/api/engine/status` → `bundled:true, kind:"napcat", dir:"<安装目录>\engine\napcat", wsPort:3001, apiPort:3000`
- **扫码链路**：`/api/engine/start` → `needLogin:true, qr:true, loginUrl:"http://127.0.0.1:6099/webui?token=<实时>"`；`/api/engine/qr` → `HTTP 200 image/png`，147×147 PNG
- **服务端**：`/api/state` 正常返回 `qq.connected=false`、`ai.provider=deepseek-web`
- **语法自检**：`ai.js` / `server.js` / `stickers.js` / `sticker-gallery.js` / `engine.js` / `public/app.js` 逐个 `node --check` 通过
- 测试用临时实例（`C:\temp_test`、`C:\temp_final`）与其 Node / NapCat 进程均已清理

## 隐私与安装包复核

- **修掉一个真实泄漏**：第一版 v1.4.9（SHA256 `8f61cd08e4bb7ed6b39b3827803a270a…`）的 `copyEngineDir` 只在顶层过滤，把 `napcat/config/webui.json`（WebUI 令牌 + 密码哈希）、`cache/qrcode.png`（可扫码登号）、`onebot11_<QQ>.json`（机器人号 + accessToken）打进了安装包。已废弃并重建，该包在任何位置都无副本
- 修复：`copyEngineDir` 递归排除 `config/data/logs/cache/plugins/session/temp` 与 `webui.json / onebot*.json / consent.json / qrcode* / *.log`
- 修复：`precheck-package.js` 的 `checkEngine()` 改递归，命中即报错
- 还原官方默认 `napcat.json`（310 B）进 `app/engine-src/napcat/napcat/config/`
- 最终包逐文件核对：无真实 `accessToken`、API Key、WebUI 令牌、二维码、本机 QQ 账号；`data/` 为空；无浏览器 Cookies / 登录态
- git 历史从未提交 `webui.json` / `onebot*.json` / 二维码 / `consent.json`；`1413214574` 在历史与当前树中只作为作者公开邮箱 `1413214574@qq.com` 出现
- `app/engine-src/`、`app/dist/engine/` 已在 `.gitignore`，第三方运行时二进制不进 Git

## 说明

- NapCat 为第三方组件，随包分发遵循其 Limited Redistribution License（附 LICENSE、注明来源、非商用）。群崽自身仍是 MIT
- 内置内核**不含 QQ 本体**（腾讯专有软件），仍需本机已装桌面版 NTQQ
- 安装包体积大，`git push` 与 Pages 部署都明显变慢；后续如继续加体积，建议改走 Release 资产分发
- 官网分发副本为 `site/assets/群崽QunZai安装包.exe`（Pages 直链）；`releases/群崽QunZai安装包-v1.4.9.exe` 不入 Git，只作为 Release 资产上传源（见 `.gitignore`）

## 历史版本

`v1.0.0` 至 `v1.4.8` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.9 Release 正文提供历史版本直链。
