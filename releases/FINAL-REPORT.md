# 群崽 QunZai v1.4.5 发布记录

发布日期：2026-10-24
状态：移除顶部「DeepSeek · 全屏」标签，改为面板内「全屏」按钮；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.5.exe` |
| 大小 | 349,745 B / 341.5 KB |
| SHA256 | `ea84aa9614d978eb0d980ba56cc486c9106f95fdcb4189cef8dc273cef3c08f6` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 删除桌面宿主顶部的「DeepSeek · 全屏」标签
- DeepSeek 面板右上角新增「⛶ 全屏」按钮，点一下临时全屏（适合扫码登录）
- 全屏时顶部只显示「← 返回监控台」，点一下回到内嵌分栏
- 平时原生标签栏完全收起，监控台页面获得更多纵向空间
- 浏览器里打开监控台不显示「全屏」按钮，只在桌面版可用
- 延续 v1.4.4：「停止服务」在监控台顶栏，停止后可一键重新启动
- 延续 v1.4.3：DeepSeek 内嵌在「实时动态」右半边、系统托盘、页面内提示框
- 延续 v1.4.2：安装器先停旧服务再覆盖文件，安装完成自动启动新版本

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 安装包内没有 `开启.bat` / `关闭.bat`，也没有旧的开启/关闭快捷方式
- 覆盖安装会先备份并还原 `config.json` 与 `data`，不覆盖聊天记录、配置和 DeepSeek 登录态

## 历史版本

`v1.0.0` 至 `v1.4.5` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.5 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
