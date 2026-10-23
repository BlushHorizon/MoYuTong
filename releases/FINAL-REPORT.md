# 群崽 QunZai v1.4.4 发布记录

发布日期：2026-10-24
状态：「停止服务」移入监控台顶栏；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.4.exe` |
| 大小 | 349,900 B / 341.7 KB |
| SHA256 | `0f8efe12decb49b5e045c24659884313499f57d051e600238d5766917989581b` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 「停止服务」从桌面宿主顶栏移到监控台页面顶栏，和 QQ 状态、AI 开关、主题、设置同一行
- 停止前用页面内提示框确认；停止后显示「服务已停止」和「启动服务」按钮，可直接重新上线
- 桌面宿主顶栏只保留「监控台 / DeepSeek · 全屏」两个标签，不再有独立的停止按钮
- 安装器停止脚本改为 UTF-8 BOM，修复中文注释导致 PowerShell 解析失败、旧服务没停掉的问题
- 安装器停旧服务保持几秒完成，不再卡几十秒
- 延续 v1.4.3：DeepSeek 内嵌在「实时动态」右半边，一半动态一半 DeepSeek
- 延续 v1.4.3：系统托盘、页面内提示框、DeepSeek 全屏标签页
- 延续 v1.4.2：安装器先停旧服务再覆盖文件，安装完成自动启动新版本

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 安装包内没有 `开启.bat` / `关闭.bat`，也没有旧的开启/关闭快捷方式
- 覆盖安装会先备份并还原 `config.json` 与 `data`，不覆盖聊天记录、配置和 DeepSeek 登录态

## 历史版本

`v1.0.0` 至 `v1.4.4` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.4 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
