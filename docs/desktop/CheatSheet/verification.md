# Windows 小抄窗口捕获保护回归记录

日期：2026-10-13。

## 问题与根因

首次打开小抄时报“系统未启用窗口捕获保护”。在本机 Electron 37.2.1、Windows 10.0.26300 上，`setContentProtection(true)` 对尚未原生显示的窗口只记录设置，`isContentProtected()` 返回 false，Windows `GetWindowDisplayAffinity` 为 0。页面加载完成后再次调用设置仍为此状态；首次原生显示后返回 true，原生值成为 `0x11`（`WDA_EXCLUDEFROMCAPTURE`）。透明和非透明窗口均复现。

旧代码在首次显示之前读取状态，将尚未生效误判成设置失败并销毁窗口。

## 修复行为

创建空窗口 → 设为 0% 透明度 → 请求内容保护 → `showInactive()` 初始化原生显示状态 → 检查保护 → 隐藏 → 加载题库视图 → 恢复用户透明度 → 显示。题库内容开始加载前保护已生效。保护仍失败时销毁窗口并报错，保留原有失败保护逻辑。

并发打开时优先等待进行中的创建操作，避免其他调用提前显示正在初始化的窗口。

## 已运行验证

- `pnpm --dir desktop exec vitest run --config vite.main.config.ts src/main/cheat-sheet src/main/shortcuts/feature_shortcuts.test.ts src/main/shortcuts/plugin_shortcuts.test.ts`：4 文件、20 项通过。
- `pnpm --dir desktop exec tsc --noEmit`：通过。
- 修改的窗口源文件与测试文件定向 ESLint：通过；脚本位于仓库 ESLint 忽略范围，未计为已 lint。
- `pnpm --dir desktop run build:main`：通过。
- `node desktop/scripts/verify-cheat-sheet-electron.cjs`：真实 Electron 窗口回归通过。

实机脚本使用生产 `CheatSheetWindow` 实现，独立临时用户数据目录和中性 HTML 测试页。快捷键宿主与图标解析使用测试替代；该测试不等于整个 GuYanTools UI 验收。窗口、透明度、持久化 helper 以及 Windows API 查询均为真实实现。每次创建在 `did-start-loading` 时检查保护，覆盖首次打开、隐藏再打开、销毁后重建。

| 检查点 | Electron 保护状态 | 原生亲和值 | 内容层透明度 / 原生窗口透明度 |
| --- | --- | --- | --- |
| 首次页面开始加载前 | true | 0x11 | 尚未恢复用户透明度 |
| 首次打开 | true | 0x11 | 90% / 100% |
| 隐藏后重开 | true | 0x11 | 90% / 100% |
| 重建页面开始加载前 | true | 0x11 | 尚未恢复用户透明度 |
| 销毁后重建 | true | 0x11 | 90% / 100% |

## 尚未验证

腾讯会议、飞书、Teams、Zoom、OBS、Windows 截图以及 Chrome/Edge 屏幕共享的接收端/输出画面尚未逐项实测。本次结果证明窗口打开和系统排除捕获状态正确，不能替代各应用捕获模式的兼容性验收。
