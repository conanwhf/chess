# 小小棋手 · Little Chess

给初学国际象棋的孩子使用的离线 Android 应用。中文和英文同时显示，无广告、无账户、无内购、无次数限制。

## 运行与安装

当前版本 `0.3.0`，主要面向小米 Pad、Android 13。双人对战是同机轮流下棋，不是联网对战。六档棋力从随机合法走子开始，不对应经过标定的 Elo。

**[下载 APK 安装包](https://github.com/conanwhf/chess/releases/download/v0.3.0/little-chess-0.3.0-debug.apk)** · [Release 页面与说明](https://github.com/conanwhf/chess/releases/tag/v0.3.0)

安装包约 7.9 MiB，为调试签名的试用版。用 Android 设备打开 APK 安装；系统提示时，只需允许所用浏览器或文件管理器安装此来源的应用，不要关闭设备整体安全保护。

```sh
npm ci
npm run dev
```

构建 APK：先准备 JDK 21 与 Android SDK，执行 `npm run android:debug`。输出 `android/app/build/outputs/apk/debug/app-debug.apk`；本地交付另复制到 `artifacts/little-chess-0.3.0-debug.apk`。APK 作为 Release 附件分发，不提交到 Git 源码历史。

已通过 53 项单元测试、14 项 Chrome 集成测试和 Android 13 模拟器离线验收。仍需在实际小米 Pad 验证触控、显示比例及系统后台管理。调试 APK 用于个人试用，不是正式签名发布包。

## 交付目标

- 简洁、清晰的棋盘与立体感棋子，附中英文棋子名称。
- 人机对战与同机双人对战；默认白方、最低难度。
- 从入门随机合法走子逐步提升到引擎对手。档位不是经过标定的 Elo。
- 无倒计时、5 / 10 / 15 分钟、10+5 秒计时。
- 点击提示，在真实棋盘上叠加最多三个推荐走法，不实际走子。
- 合法走子、将军、将死、和棋、升变、王车易位与吃过路兵。
- 本地保存进行中的棋局；支持暂停、悔棋、翻转棋盘与重新开局。

## 开发文档

- [需求与验收](docs/requirements.md)
- [架构与规则](docs/architecture.md)
- [开发、构建和安装](docs/development.md)
- [测试记录](docs/testing.md)
- [迭代记录](CHANGELOG.md)

## 许可证

本项目采用 GPL-3.0-only，使用 Stockfish.js（GPL-3.0）和 chess.js（BSD-2-Clause）。依赖与资源的具体来源见 `THIRD_PARTY_NOTICES.md`。棋子图形由本项目原创，不依赖在线图片服务。APK 中的所有棋局与分析均在设备本地完成。
