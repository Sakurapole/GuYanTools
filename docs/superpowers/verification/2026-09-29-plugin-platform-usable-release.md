# 插件平台可用版本验收记录

日期：2026-09-29  
环境：Windows、Electron 37.2.1、Node/pnpm workspace 依赖已安装

## 通过项

| 验收项 | 命令 | 结果 |
|---|---|---|
| 宿主类型契约 | `pnpm --dir desktop run typecheck` | 通过 |
| 插件平台定向测试 | `pnpm --dir desktop run test:plugin-platform` | 33 个文件、145 个测试通过 |
| SDK | `pnpm --dir packages/plugin-sdk test` | 1 个文件、6 个测试通过 |
| Vite 构建链 | `pnpm --dir packages/plugin-vite exec vitest run` | 2 个文件、4 个测试通过 |
| CLI 工具链 | `pnpm --dir packages/plugin-cli test` | 4 个文件、20 个测试通过 |
| 桌面 lint | `pnpm --dir desktop run lint` | 0 errors；存在既有 warnings |
| 桌面应用构建 | `pnpm --dir desktop run build:app` | 通过；包含 `plugin-worker.js`、插件 preload 与 renderer |
| Windows NSIS 发行包 | `pnpm --dir desktop run dist:win` | 通过；native release build、Electron Builder packaging 和 `out/GuYanTools-0.0.4-setup-x64.exe` 生成成功 |
| 真实 Electron sandbox | `node desktop/scripts/verify-plugin-sandbox-electron.cjs` | 7 项通过：退出、sandbox、Node 全局隔离、preload、身份、worker ready、直连网络阻断 |

## 已实现的发布边界

- 第三方插件仅允许 `sandboxed`，worker 入口必须为 `worker.html`。
- `workerRuntime: "utility"`、裸 `.js/.mjs/.cjs` worker 和未知贡献点在 manifest 校验阶段拒绝。
- 第三方 worker 使用 sandboxed `WebContentsView`；UtilityProcess 仅保留给宿主内置 worker，且缺少 bootstrap 时启动失败。
- 应用退出会等待插件 runtime 清理，后台任务、worker、pending 调用和 idle timer 均进入统一释放路径。
- Forge Vite build 列表显式包含 plugin worker，发行构建不依赖源码目录中的 bootstrap。

## 尚未运行

- macOS/Linux 发行包：未在对应平台运行。
- 真实市场签名发布、升级回滚和离线安装包矩阵：已有模块测试，但未在本次记录中进行完整端到端发行演练。

## 复现

```powershell
pnpm --dir desktop run typecheck
pnpm --dir desktop run test:plugin-platform
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
pnpm --dir packages/plugin-sdk test
pnpm --dir packages/plugin-vite exec vitest run
pnpm --dir packages/plugin-cli test
node desktop/scripts/verify-plugin-sandbox-electron.cjs
git diff --check
```
