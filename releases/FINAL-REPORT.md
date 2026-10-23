# 群崽 QunZai v1.4.2 发布记录

发布日期：2026-10-23
状态：修复自动更新安装后旧服务不退出；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.2.exe` |
| 大小 | 345,187 B / 337.1 KB |
| SHA256 | `014cff78bee484717d812b27349707d7e8efe4ee1863307e4f7976b9a3121ed2` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 安装器覆盖安装前会结束旧的 Node 服务，不再留下继续跑旧代码的进程
- 自动更新改为打开可见的安装程序，不再静默启动后没有任何界面
- 安装器留出 1 秒让更新接口返回页面，再停止旧宿主和旧服务
- 静默安装完成后自动启动新版桌面宿主；交互安装由完成页启动
- 延续 v1.4.1：内嵌模式不启动外部 Edge、不新开 DeepSeek target
- 延续 v1.4.1：登录按钮直接切内嵌 DeepSeek，登录成功后无需重启恢复状态
- 保留 DeepSeek 登录态；会话过期时需在内嵌页扫码一次

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 安装包内没有 `开启.bat` / `关闭.bat`，也没有旧的开启/关闭快捷方式

## 历史版本

`v1.0.0` 至 `v1.4.2` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.2 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
