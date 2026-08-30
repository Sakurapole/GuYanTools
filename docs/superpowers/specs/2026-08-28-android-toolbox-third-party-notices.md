# Android 工具链第三方声明

此目录在发布包中包含官方 Android Platform Tools（ADB/fastboot）和官方 Genymobile scrcpy 发行包。发布构建必须将上游随附的 LICENSE、NOTICE 和动态库许可证复制到 `resources/android-tools/THIRD-PARTY-NOTICES/`，并在应用的关于页面提供查看入口。

## 需要保留的来源

- Android Platform Tools：ADB、fastboot、`AdbWinApi.dll`、`AdbWinUsbApi.dll` 及其 `NOTICE.txt`。
- scrcpy：`scrcpy.exe`、`scrcpy-server` 及 scrcpy Apache License 2.0 文本。
- scrcpy 发行包依赖：SDL、FFmpeg/libav、libusb 和 swresample 的对应许可证与版权声明。

## 版本与校验

发布前固定每个平台和架构的版本，记录下载地址、SHA-256、构建日期和许可证文件来源。当前 Windows x64 应用内安装清单固定为 Android Platform-Tools 37.0.1 和 scrcpy 4.1；应用只从清单中的官方 HTTPS 地址下载，并在解压前校验 SHA-256。下载由用户在设置或 Android 工具箱页面显式触发，不自动联网或静默替换工具。用户配置的本地工具链路径优先于应用托管目录。

## 分发边界

仓库不跟踪 `.exe`、`.dll` 或无扩展名的 `scrcpy-server` 二进制。CI/发布流水线负责下载官方资源、核对 SHA-256、复制到资源目录，并在打包产物中保留本声明要求的文件；应用内下载则将同样的受校验文件安装到应用数据目录，并复制对应的 NOTICE/LICENSE 到 `THIRD-PARTY-NOTICES/`。
