# 群崽 QunZai v1.4.6 发布记录

发布日期：2026-10-24
状态：回复冷却改为设置内自定义，可设为 0 不冷却；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.6.exe` |
| 大小 | 349,612 B / 341.4 KB |
| SHA256 | `f1ad40eccb00730a6bc95b7cb63b432fc23f2032d983a33eeb07f407d6d592b0` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 「设置 → 回复冷却」可自定义冷却秒数，支持 0.5 秒步进
- 取消勾选「回复冷却」即不冷却；填 0 秒同样不冷却
- 冷却设置从「API 接口」模式移到通用回复设置，网页版 DeepSeek 模式也能看到
- 冷却只作用于同一会话的连续自动回复，私聊和群聊互不影响
- 延续 v1.4.5：DeepSeek 面板右上角「⛶ 全屏」按钮，顶部不再有全屏标签
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

`v1.0.0` 至 `v1.4.6` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.6 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
