# 群崽 QunZai v1.4.7 发布记录

发布日期：2026-10-24
状态：服务停止后点关闭按钮直接退出，不再驻留托盘；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.7.exe` |
| 大小 | 350,293 B / 342.1 KB |
| SHA256 | `1c4a4ff989fb3e5d045077aeccf0e2192c66ce08ae6c3f3328338b10614545b4` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 服务已停止时，点右上角 X 直接退出软件，不再缩到系统托盘
- 服务运行中，点右上角 X 仍然缩到托盘，QQ 机器人继续在线
- 托盘菜单「退出群崽」行为不变，随时可以强制退出
- 服务停止后退出会正常清理托盘图标和 WebView2，不留后台进程
- 延续 v1.4.6：回复冷却可在设置里自定义，取消勾选或设为 0 即不冷却
- 延续 v1.4.5：DeepSeek 面板右上角「⛶ 全屏」按钮，顶部不再有全屏标签
- 延续 v1.4.4：「停止服务」在监控台顶栏，停止后可一键重新启动
- 延续 v1.4.3：DeepSeek 内嵌在「实时动态」右半边、页面内提示框

## 验证

- 停止服务后发送真实 `WM_SYSCOMMAND SC_CLOSE`：宿主进程退出，日志记录 `serviceRunning=False stoppedByUser=True`，随后 `host exit`
- 服务运行中发送同样的关闭消息：窗口隐藏到托盘，宿主进程继续运行，日志记录 `hide to tray`
- 覆盖安装后 `D:\群崽\config.json` 的 `ai.minIntervalMs` 保持用户设置值（0），未被安装包覆盖

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 覆盖安装会先备份并还原 `config.json` 与 `data`，不覆盖聊天记录、配置和 DeepSeek 登录态

## 历史版本

`v1.0.0` 至 `v1.4.7` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.7 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
