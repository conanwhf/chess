# 小小棋手 · Little Chess

给初学国际象棋的孩子使用的离线 Android 应用。支持中文和英文切换，首次跟随系统语言。无广告、无账户、无内购、无次数限制。

## 运行与安装

当前试用版本 `0.4.7`。主要面向小米 Pad、Android 13。双人对战是同机面对面轮流下棋，不是联网对战。十二档统一包含经典练习与原生限强，不对应经过标定的 Elo。

下载：[0.4.7 APK](https://github.com/conanwhf/chess/releases/download/v0.4.7/little-chess-0.4.7-debug.apk) · [Release 页面](https://github.com/conanwhf/chess/releases/tag/v0.4.7)。历史版本保留在仓库的 Releases 中。

安装包为调试签名的试用版。用 Android 设备打开 APK 安装；系统提示时，只需允许所用浏览器或文件管理器安装此来源的应用，不要关闭设备整体安全保护。

```sh
npm ci
npm run dev
```

在 Mac 浏览器打开终端输出的本机地址即可调试，修改代码自动刷新，无需安装 APK。浏览器窗口可调整为平板横屏或竖屏大小。首次点击后解锁音效；右上角「中 / En」切换语言，齿轮设置默认棋力并打开棋谱、帮助和声音设置。Android 特有行为再用本机模拟器验证，见 [开发文档](docs/development.md#本机调试)。

构建 APK：先准备 JDK 21 与 Android SDK，执行 `npm run android:debug`。输出 `android/app/build/outputs/apk/debug/app-debug.apk`；本地交付另复制到 `artifacts/little-chess-0.4.7-debug.apk`。APK 作为 Release 附件分发，不提交到 Git 源码历史。

逐版本验证结果见 [测试记录](docs/testing.md)。仍需在实际小米 Pad 验证触控、显示比例及系统后台管理。调试 APK 用于个人试用，不是正式签名发布包。

## 交付目标

- 主屏完整显示棋盘、双方时钟与常用操作，历史和帮助仅在菜单中打开。
- 清晰的立体感棋子，可显示当前语言的棋子名称。
- 点击或拖动均可走棋，支持鼠标与触摸；非法落点或棋盘外释放不落子，棋盘不会带动页面滚动。
- 人机第 2 档 Thinker (classic) 及以上隐藏自动合法落点标记，仍可主动请求推荐走法；第 1 档与同机双人保留落点标记。
- 仅保留离线音效，可关闭；进入后台自动静音，无背景音乐。
- 人机对战与同机双人对战；默认白方、最低难度。
- 十二档恢复旧 3–6 级，加入过渡档并与原生档粗测后穿插排序。旧 Thinker 对应第 2 档「认真思考（经典）」，其他头衔从「勇气先锋」逐步升至「巅峰棋圣」。齿轮只调整默认棋力，新局可单独选档，旧局保留对应策略。档位不是经过标定的 Elo。
- 无倒计时、5 / 10 / 15 分钟、10+5 秒计时。点击时钟或进入齿轮设置可局中切换，应用新预设重设双方时间，不重开棋局。
- 点击提示，在真实棋盘上叠加最多三个推荐走法，不实际走子。
- 合法走子、将军、将死、和棋、升变、王车易位与吃过路兵。
- 本地保存进行中的棋局；支持暂停、悔棋、翻转棋盘与重新开局。
- 终局展示胜方戴皇冠的王及短暂动画；支持当前棋局的前进、后退和自动复盘，详见 [终局动画与复盘](docs/game-review.md)。

## 开发文档

- [需求与验收](docs/requirements.md)
- [架构与规则](docs/architecture.md)
- [开发、构建和安装](docs/development.md)
- [测试记录](docs/testing.md)
- [迭代记录](CHANGELOG.md)

## 许可证

本项目采用 GPL-3.0-only，使用 Stockfish.js（GPL-3.0）和 chess.js（BSD-2-Clause）。依赖与资源的具体来源见 `THIRD_PARTY_NOTICES.md`。棋子图形由本项目原创，不依赖在线图片服务。APK 中的所有棋局与分析均在设备本地完成。
