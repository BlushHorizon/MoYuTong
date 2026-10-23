# 群崽 QunZai v1.4.1 发布记录

发布日期：2026-10-23
状态：修复内嵌 DeepSeek 弹窗与登录态检测；官网与 GitHub Releases 已同步。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.1.exe` |
| 大小 | 344,426 B / 336.4 KB |
| SHA256 | `df979ec2f561533b06289cbc51063633464db778a4c12ec3dfa60f188767c886` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 内嵌模式启动时等待宿主 WebView2 的 CDP，不再回退启动外部 Edge
- 内嵌模式禁用 `/json/new` 新开 target，避免新建对话时弹出额外 DeepSeek 窗口
- 「① 打开 DeepSeek 登录」改为直接切到内嵌 DeepSeek 标签页
- 登录成功后重新探测页面状态，无需重启服务即可从 `need-login` 恢复为 `ready`
- 保留 WebView2 登录态；会话过期时只需在内嵌页扫码登录一次，之后会记住
- 继续修复旧版配置升级后自动更新地址为空

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 安装包内没有 `开启.bat` / `关闭.bat`，也没有旧的开启/关闭快捷方式

## 历史版本

`v1.0.0` 至 `v1.4.1` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.1 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
