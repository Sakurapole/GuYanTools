# Android 工具箱 Windows 设备矩阵

> 记录 Android 工具箱第一版在 Windows x64 的自动化与真实设备验证边界。真实设备序列号、授权密钥和完整日志不得写入仓库。

## 自动化验证

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 工具链固定绝对路径与缺失依赖诊断 | 已覆盖 | `toolchain.test.ts` |
| ADB 单设备/多设备/未授权/离线解析 | 已覆盖 | `adb_parser.test.ts` |
| `track-devices` 事件与订阅清理 | 已覆盖 | `adb_service.test.ts` |
| scrcpy 镜像、音频-only、`audio-dup`、OTG 参数白名单 | 已覆盖 | `scrcpy_args.test.ts`、`scrcpy_service.test.ts` |
| UHID 失败后 SDK 回退 | 已覆盖 | `scrcpy_service.test.ts` |
| fastboot 只读变量与重启参数 | 已覆盖 | `fastboot_service.test.ts` |
| 插件权限、session owner 隔离、任意 argv/写操作拒绝 | 已覆盖 | `android_service.test.ts` |
| Android facade IPC/SDK 通道 | 已覆盖 | `packages/plugin-sdk/tests/runtime.test.ts`、插件平台测试 |
| 静态安全门禁 | 已覆盖 | `pnpm run verify:android-tools` |
| 无缝输入路由：四方向边缘进入/返回、快捷键、双击 Esc、按键策略 | 已覆盖 | `pnpm run test:android-input` |
| 无缝输入静态安全门禁与固定 UHID 路径 | 已覆盖 | `pnpm run verify:android-input` |

## 真实设备矩阵

状态值：`待测`、`通过`、`失败`。填写时只记录错误码、系统版本和复现步骤，不记录 serial 或敏感日志。

| 场景 | Android 11 | Android 12 | Android 13+ | 结果/备注 |
| --- | --- | --- | --- | --- |
| USB 2.0 ADB 镜像 + 键鼠 | 待测 | 待测 | 待测 |  |
| USB 3.x ADB 镜像 + 键鼠 | 待测 | 待测 | 待测 |  |
| 首次连接 `unauthorized`，用户授权后重连 | 待测 | 待测 | 待测 | 记录 `ANDROID_DEVICE_UNAUTHORIZED` 前后状态 |
| ADB `offline`、拔线、重新连接 | 待测 | 待测 | 待测 | 记录 `ANDROID_DEVICE_OFFLINE` 与 session 事件 |
| 音频-only 回传到电脑 | 待测 | 待测 | 待测 | Android 10 预期禁用 |
| 音频 capture 失败诊断 | 待测 | 待测 | 待测 | 记录 `ANDROID_AUDIO_CAPTURE_FAILED` 或上游错误 |
| Android 13+ `audio-dup` | 不适用 | 不适用 | 待测 | 确认设备端继续播放且电脑有声音 |
| UHID 键鼠失败后 SDK 回退 | 待测 | 待测 | 待测 | 记录回退后的 session 模式 |
| 小米额外安全设置 | 待测 | 待测 | 待测 | 记录设置项和错误码，不记录账号信息 |
| OTG 键鼠 | 待测 | 待测 | 待测 | 仅 USB；不应启动镜像/音频 |
| OTG 与 ADB/scrcpy 冲突 | 待测 | 待测 | 待测 | 预期 `ANDROID_USB_CONFLICT` |
| 多设备同时连接与选择 | 待测 | 待测 | 待测 | 每个 session 必须显示目标设备 |
| fastboot `getvar`/重启 | 待测 | 待测 | 待测 | 不执行 flash/erase/unlock |

## 执行记录模板

```text
日期：
Windows 版本：
GuYanTools 版本/提交：
设备厂商与型号（不含 serial）：
Android 版本 / SDK：
连接方式：USB 2.0 / USB 3.x
场景：
结果：通过 / 失败
错误码：
复现步骤：
备注：
```

真实设备验证完成前，发布说明必须明确“自动化验证通过，硬件矩阵仍有待测项”。
