# JinVoice

[English](README_EN.md) | 简体中文

JinVoice 是一个开源的实时语音房间应用，提供网页端和 Windows 桌面端。它支持多人 SFU 语音、公共与私密房间、实时聊天、点对点文件传输、按键说话以及可自定义的界面主题。

> 项目仍在持续开发中。部署到公网前，请先阅读本文的安全与网络配置说明。

## 功能

- 基于 mediasoup SFU 的多人实时语音
- 游客直接使用，也可注册账号保存昵称和身份
- 公共房间、密码房间、房间创建/重命名/删除
- 公共聊天、私密聊天和消息删除
- P2P 文件传输，单文件最大 256 MB
- 手动静音、语音感应和可自定义按键说话
- 麦克风增强、轻度降噪、耳返和输入电平显示
- 独立成员音量调节，范围为 0% 至 500%
- 输入设备、输出设备和音频输出开关
- 浅色/深色主题、自定义背景、模糊和面板透明度
- 管理员账号、成员管理和全站外观管理
- Windows Electron 客户端，全局按键说话可在其他应用或游戏中使用

多人语音只使用 SFU。P2P 连接仅用于文件传输，不承载语音。

## 技术栈

- 前端：React 19、Vite、Zustand、Socket.IO Client
- 后端：Express 5、Socket.IO、Prisma 5、SQLite
- 实时媒体：mediasoup / mediasoup-client
- 文件传输：simple-peer
- 桌面端：Electron

## 安全

- 提交前建议执行 `npm run verify`
- 发布前建议执行 `npm run release`
- 生产环境必须替换示例管理员和 TURN 凭据
- 发布版 Docker 部署必须配置 `TURN_USER`，否则 TURN 容器会拒绝启动
- 设置严格的 `CORS_ORIGIN`
- 使用 HTTPS 和可信反向代理
- 自动部署拉取 GHCR 镜像前，服务器需要预先 `docker login ghcr.io`，或将镜像包设为 Public
- 部署健康检查接口为 `/api/health`
- TURN 凭据会进入前端构建产物，不应被视为长期秘密

安全问题请阅读 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中披露凭据或可利用漏洞。

## 许可证

[MIT](LICENSE)
