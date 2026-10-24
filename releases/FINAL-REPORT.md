# 群崽 QunZai v1.4.8 发布记录

发布日期：2026-10-24
状态：官网、README、软件关于页接入爱发电；监控台外链改用系统默认浏览器打开。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.8.exe` |
| 大小 | 350,443 B / 342.2 KB |
| SHA256 | `9ad4cdc0e550cdf90dbb4afd180865b2997fda4dc51c09e2e49ecb7753589b42` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 官网「关于作者」区新增「☕ 支持群崽 · 爱发电」按钮和 BlushHorizon 头像
- README 顶部新增爱发电链接，并增加「☕ 支持群崽」小节
- 软件「关于与声明」新增「☕ 支持群崽 · 爱发电」静默入口
- 监控台里的官网 / GitHub / Issues / 爱发电外链，改用系统默认浏览器打开，不会把监控台导航走
- 爱发电主页：https://ifdian.net/u/76c7d1dcfc3e11ef90af52540025c377
- 延续 v1.4.7：服务停止后点 X 直接退出，不再驻留托盘
- 延续 v1.4.6：回复冷却可在设置里自定义，取消勾选或设为 0 即不冷却
- 延续 v1.4.5：DeepSeek 面板右上角「⛶ 全屏」按钮
- 延续 v1.4.4：「停止服务」在监控台顶栏，停止后可一键重新启动

## 爱发电素材

| 项目 | 文件 |
|---|---|
| 头像（512×512） | `docs/afdian-avatar-blushhorizon.jpg` |
| 封面（1200×400） | `docs/afdian-cover.png` |
| 主页文案 / 档位 / 上线清单 | `docs/爱发电主页文案.md` |

> 爱发电主页名称、头像、封面和档位需要作者本人登录后修改；安装包只负责把入口接好。

## 验证

- 软件「关于与声明」中的爱发电链接点击后，监控台 URL 保持 `http://127.0.0.1:8787/`，未发生页面跳转
- 外链交给系统默认浏览器打开；失败会写入 `desktop-host.log` 的 `open external failed`
- 覆盖安装后 `D:\群崽\config.json` 的 `ai.minIntervalMs` 保持用户设置值（0），未被安装包覆盖

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 爱发电主页链接里的 32 位用户 ID 是公开地址，已在打包闸门中按 `ifdian.net/u/` / `afdian.com/u/` 规则放行，不影响其他凭据检测
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 覆盖安装会先备份并还原 `config.json` 与 `data`，不覆盖聊天记录、配置和 DeepSeek 登录态

## 历史版本

`v1.0.0` 至 `v1.4.8` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.8 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
