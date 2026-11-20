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

本工程使用 Capacitor 8.6.2，`minSdk=24`、`compileSdk=targetSdk=36`、Android Gradle Plugin 8.13.0。主要验收设备为 Android 13 平板。AndroidManifest 不申请联网、位置、相机或存储权限；WebView 资源通过 Capacitor 本地拦截器读取。AndroidX 自动合并一个本应用签名级接收器权限，不属于用户敏感权限。

本轮可复用的调试签名密钥已放入被 Git 忽略的 `.cache/android-user/debug.keystore`。后续为这台平板构建可覆盖安装的调试版本时，在仓库根目录设置 `ANDROID_USER_HOME="$PWD/.cache/android-user"` 后再构建。备份该文件但不要提交或随 APK 分发；丢失密钥后，新签名的 APK 不能覆盖旧安装。它仍不是正式发布密钥。后续交付还应递增 `android/app/build.gradle` 的 `versionCode`。

## Android 模拟器验收

准备已启动的 Android 13 ARM64 平板模拟器，安装调试 APK 并打开应用。模拟器必须允许 WebView 调试，调试包默认启用。

```sh
npx playwright install android
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n com.conanwhf.littlechess/.MainActivity
ANDROID_SERIAL=emulator-5554 npm run test:android
```

`ANDROID_HOME` 必须已设置，脚本通过 Playwright 官方 Android WebView 接口连接本地 adb。首次需安装 Playwright Android 测试驱动，用于读取 WebView 原生边界，将棋格坐标转换为系统触摸坐标；驱动仅用于测试，不打包进应用。只允许明确指定的模拟器，不会对真机执行；它会冷启动应用、替换模拟器中的当前棋局、切换语言及声音开关、关闭模拟器 Wi-Fi / 移动数据，并旋转屏幕。原生触摸同时验证合法拖动落子、非法拖动不落子及页面不滚动。通过后输出逐项结果，截图写入 `artifacts/android-*.png`。实际触控和小米系统差异仍需真机验收。

本轮临时工具链位于 `/tmp/chess-toolchain`，包含 JDK、SDK、Gradle 缓存和模拟器。它不是仓库的一部分，也不是复现构建的固定路径。新机器可使用 Android Studio 安装相同版本的 SDK。

## 本机调试

日常调整布局、颜色、声音、语言和对弈逻辑时，优先使用 Mac 浏览器，不需要每次传 APK 到平板：

```sh
npm run dev -- --port 5174 --strictPort
```

打开 `http://127.0.0.1:5174/`。开发服务器仅监听本机，代码保存后自动更新。端口已占用时换一个端口，不终止未知服务。Chrome 开发者工具的设备工具栏可设为 `1280×720`、`800×1280` 或 `360×640`；也可直接缩放窗口。「中 / En」按钮保留棋局，齿轮设置可恢复跟随系统；浏览器的首选语言决定首次默认值。音效需要首次点击解锁，并受系统媒体音量控制，不播放背景音乐。

棋力有两个入口：齿轮中的「默认电脑棋力」只影响后续新局；「新棋局」中的选档仅影响即将开始的一局。计时可直接点击双方时钟或进入齿轮设置调整，应用不同预设后双方时间重设，棋盘不变；关闭弹窗后明确点击继续。

浏览器预览运行同一套棋规、引擎和音频代码，但不能替代 Android 生命周期、系统栏、返回键和 WebView 验证。这些场景在本机 Android 模拟器里检查：启动 Android Studio 的 API 33 平板虚拟设备，然后执行上面的构建、安装和 `test:android` 命令。也可使用已有工具链的 `emulator -avd LittleChess_API33` 打开模拟器窗口，前提是已设置相应 `ANDROID_HOME`、`ANDROID_USER_HOME` 和 `ANDROID_AVD_HOME`。

推荐顺序：浏览器修改与调试 → 本机模拟器确认 APK → 最后在小米 Pad 真机验收。Android APK 不能安装在 Apple iPad 上；本项目所说的目标平板仍是小米 Pad / Android 13，iPad 只能用浏览器预览。

## 源码与资源

`npm run prepare:assets` 只复制单线程 lite 引擎，生成原创棋子与图标，并汇总实际依赖的许可证。不要将 Stockfish 整个 npm 包（约 200 MB）复制进 APK。`public/legal/` 保留对应版本源码、神经网络与构建说明，可离线取得。

源码附件使用 ZIP，不能直接改用 `.gz`：Android AAPT 会自动解压 `.gz` 资产并去掉扩展名，导致资源路径变化。构建说明在应用的开源声明中直接读取，不依赖外部浏览器。

## Git 迭代

1. 文档：明确需求、默认行为、许可证、验收范围。
2. 应用：实现棋规、计时、难度、提示、双语界面和测试。
3. Android：构建 APK、完成浏览器验收，记录结果与真机验证边界。

只有确认该里程碑完成后才提交，不逐文件提交。不自动推送；用户确认后再推送 `origin`。

## 安装边界

调试 APK 可用于个人测试；Android 安装时可能要求允许所用文件管理器安装未知应用。不能关闭设备整体安全保护。首次正式发布前，必须用稳定签名密钥签名并在目标真机验证。调试签名与正式签名不同，不能直接覆盖安装。
