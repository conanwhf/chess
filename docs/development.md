# 开发、构建和安装

## 环境

- Node.js 22.12 或更高版本，npm。
- Android 构建另需 JDK 21、Android SDK，以及生成工程要求的 SDK Platform / Build Tools。
- 不把 JDK、SDK、缓存或签名密钥提交 Git。Android 本机路径写入被忽略的 `android/local.properties` 或通过环境变量指定。

## 应用开发

```sh
npm ci
npm run dev -- --port 5173
```

访问 `http://127.0.0.1:5173/`。端口被占用时使用 Vite 输出的实际端口。引擎和许可证由 `prepare:assets` 自动从本地依赖复制，资源不依赖 CDN。

如果 npm 缓存不可写，可使用 `npm --cache .cache/npm ci`，不要修改整个用户目录的权限。

```sh
npm test
npm run build
npm run test:e2e
```

集成测试使用本机 Google Chrome，自动启动 `4173` 端口的生产预览，并验证真实 WebAssembly 引擎。测试启动器应在有权运行 Chrome 的环境执行；Conan 的环境要求在沙盒外执行。截图写入被忽略的 `artifacts/`，失败信息与 trace 写入 `test-results/`。

针对场景检查可运行 `npm run test:e2e -- --grep 'promotion|stale hints'`，不用每次修改都跑完整测试。

## Android 工程

`android/` 随仓库提交，不要重复执行 `cap add android`。使用 JDK 21，设置 `JAVA_HOME` 和 `ANDROID_HOME`，通过 SDK Manager 安装 `platforms;android-36`、`build-tools;35.0.0`、`platform-tools` 并确认 SDK 许可证。

```sh
npm run android:debug
```

命令会先构建静态资源并同步 Capacitor，再调用 Gradle。产物为 `android/app/build/outputs/apk/debug/app-debug.apk`。Gradle Wrapper 自动下载 Gradle 8.14.3；首次构建需要联网下载 npm、Gradle 和 Maven 依赖，安装好的应用不需要联网。

本地 SDK / JDK / Gradle 缓存可放在用户选择的位置，不需要写入工程。受限环境可另设 `ANDROID_USER_HOME` 与 `GRADLE_USER_HOME`，避免工具向不可写的默认目录写缓存。

本工程使用 Capacitor 8.6.2，`minSdk=24`、`compileSdk=targetSdk=36`、Android Gradle Plugin 8.13.0。主要验收设备为 Android 13 平板。AndroidManifest 不申请 `INTERNET` 或其他权限；WebView 资源通过 Capacitor 本地拦截器读取。

## 源码与资源

`npm run prepare:assets` 只复制单线程 lite 引擎，生成原创棋子与图标，并汇总实际依赖的许可证。不要将 Stockfish 整个 npm 包（约 200 MB）复制进 APK。`public/legal/` 保留对应版本源码、神经网络与构建说明，可离线取得。

## Git 迭代

1. 文档：明确需求、默认行为、许可证、验收范围。
2. 应用：实现棋规、计时、难度、提示、双语界面和测试。
3. Android：构建 APK、完成浏览器验收，记录结果与真机验证边界。

只有确认该里程碑完成后才提交，不逐文件提交。不自动推送；用户确认后再推送 `origin`。

## 安装边界

调试 APK 可用于个人测试；Android 安装时可能要求允许所用文件管理器安装未知应用。不能关闭设备整体安全保护。首次正式发布前，必须用稳定签名密钥签名并在目标真机验证。调试签名与正式签名不同，不能直接覆盖安装。
