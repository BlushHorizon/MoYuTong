# 群崽 QunZai v1.4.3 发布记录

发布日期：2026-10-24
状态：DeepSeek 内嵌到实时动态、系统托盘、页面内提示框；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.3.exe` |
| 大小 | 349,190 B / 341.0 KB |
| SHA256 | `f8359d2cf302aa908922237f12ebda86ae323bf33c9baf9bf9129795b83d3675` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 「实时动态」右栏一分为二：左边实时动态，右边 DeepSeek 内嵌，各占一半
- DeepSeek 内嵌窗口跟随页面滚动和窗口缩放，始终贴合右侧占位区
- 打开设置或页面提示框时，内嵌 DeepSeek 自动让位，关闭后恢复
- 保留「DeepSeek · 全屏」标签页，扫码登录、完整对话时仍可全屏使用
- 新增系统托盘：最小化或点右上角关闭后，群崽留驻托盘，QQ 机器人继续在后台运行
- 托盘图标双击恢复窗口；右键可「显示主窗口」或「退出群崽」
- 所有浏览器原生 `alert/confirm` 换成页面内提示框，不再出现带 `127.0.0.1:8787` 标题栏的系统弹窗
- 安装器改用专用停止脚本，自动更新停旧服务从几十秒降到几秒
- 安装器先停旧服务再覆盖文件，安装完成自动启动新版本
- 延续 v1.4.1：内嵌 DeepSeek 不启动外部 Edge、不新开 target

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 安装包内没有 `开启.bat` / `关闭.bat`，也没有旧的开启/关闭快捷方式
- 覆盖安装会先备份并还原 `config.json` 与 `data`，不覆盖聊天记录、配置和 DeepSeek 登录态

## 历史版本

`v1.0.0` 至 `v1.4.3` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.3 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
