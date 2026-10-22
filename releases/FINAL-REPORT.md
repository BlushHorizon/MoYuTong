# 群崽 QunZai v1.4.0 发布记录

发布日期：2026-10-23
状态：已发布到官网与 GitHub Releases；历史版本保留。

## 安装包

| 项目 | 值 |
|---|---|
| 文件 | `群崽QunZai安装包-v1.4.0.exe` |
| 大小 | 343,880 B / 335.8 KB |
| SHA256 | `4604041211aa008ad52adff7a50f0b5f1cb3c9076aca2978f01363d7980ca2a7` |
| 官网下载 | https://blushhorizon.github.io/QunZai/ |
| GitHub Releases | https://github.com/BlushHorizon/QunZai/releases |

## 本版内容

- 桌面宿主内置「停止服务 / 启动服务」，关闭窗口会停止由宿主启动的服务
- 删除独立的「群崽-开启 / 群崽-关闭」快捷方式，仅保留主入口
- 安装器升级时清理旧快捷方式与旧 bat 入口
- 保留 `D:\群崽\config.json` 与 `D:\群崽\data`，覆盖安装不丢配置和聊天数据
- 自动更新清单发布到官网 `update.json`
- 修复旧版配置升级后自动更新地址为空：默认清单地址内置，旧配置缺字段或空字符串时自动回填

## 隐私与安装包复核

- `config.json` 中 `accessToken`、`apiKey`、`commandSenders`、`targetChatKey(s)` 均为空
- `engine.account`、`engine.dir` 为空，不包含本机机器人账号或路径
- 安装包解开后逐文件扫描：无真实 `accessToken`、API Key、本机 QQ 账号、`data/`、日志、浏览器 Cookies / 登录态
- 安装包文件清单为显式白名单，不使用 `File /r "dist\*"` 的整目录通配打包
- 桌面宿主与 `app/dist` 的最新构建哈希一致

## 历史版本

`v1.0.0` 至 `v1.4.0` 的安装包均保留在 GitHub 仓库 `releases/` 与本地 `releases/history/` 归档中；v1.4.0 Release 正文提供全部历史版本直链，v1.0.0 保留独立 Release。
