# Android 工具链第三方声明

此目录在发布包中包含官方 Android Platform Tools（ADB/fastboot）和官方 Genymobile scrcpy 发行包。发布构建必须将上游随附的 LICENSE、NOTICE 和动态库许可证复制到 `resources/android-tools/THIRD-PARTY-NOTICES/`，并在应用的关于页面提供查看入口。

## 需要保留的来源

- Android Platform Tools：ADB、fastboot、`AdbWinApi.dll`、`AdbWinUsbApi.dll` 及其 `NOTICE.txt`。
- scrcpy：`scrcpy.exe`、`scrcpy-server` 及 scrcpy Apache License 2.0 文本。
- scrcpy 发行包依赖：SDL、FFmpeg/libav、libusb 和 swresample 的对应许可证与版权声明。

## 版本与校验

发布前固定每个平台和架构的版本，记录下载地址、SHA-256、构建日期和许可证文件来源。应用运行时只校验随包资源，不在生产环境从 PATH 或网络静默替换工具。

## 分发边界

仓库不跟踪 `.exe`、`.dll` 或无扩展名的 `scrcpy-server` 二进制。CI/发布流水线负责下载官方资源、核对 SHA-256、复制到资源目录，并在打包产物中保留本声明要求的文件。
