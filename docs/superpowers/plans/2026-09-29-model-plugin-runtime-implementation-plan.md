# Model Plugin Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows/Linux 桌面端通过内置 图像超分工具插件完成可视化的单图 CPU/CUDA 超分。

**Architecture:** 宿主负责环境、文件句柄和子进程；manifest 声明 Python 入口与依赖；SDK 将插件 UI 请求路由到受权限保护的宿主服务。内置插件按当前仓库插件生命周期注册。

**Tech Stack:** Electron、TypeScript、Vue 插件 UI、Python 3.10、PyTorch、OpenCV、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-29-model-plugin-runtime-design.md`

## Global Constraints

- 目标系统为 Windows x64 与 Linux x64。
- 首个插件使用 Real-CUGAN 官方 PyTorch 实现，支持 CPU 与 NVIDIA CUDA。
- Python 代码执行只对真实内置插件开放；自签名插件不获得该权限。
- 不覆盖仓库现有未提交改动，不引入 renderer 的 Node/Electron 访问。

---

### Task 1: 模型 manifest 与授权

**Files:** `desktop/src/contracts/plugin_host.ts`、`desktop/src/main/plugin-host/manifest_resolver.ts`、`desktop/src/main/plugin-host/permission_matrix.ts`、对应测试。

**Interfaces:** 产出 `PluginManifest.modelRuntime`、`models.execute`，manifest 验证拒绝越界入口和非法依赖。

- [x] 先写失败测试，分别覆盖合法声明、越界入口、非内置插件的权限拒绝。
- [x] 运行 `pnpm --dir desktop exec vitest run src/main/plugin-host/manifest_resolver.test.ts src/main/plugin-host/permission_matrix.test.ts`，确认新用例因缺少功能失败。
- [x] 添加契约、校验与权限文案，使测试通过。

### Task 2: Python 环境与进程服务

**Files:** `desktop/src/main/plugin-host/services/model_runtime_service.ts`、对应测试。

**Interfaces:** 产出 `discoverEnvironments`、`installMiniforge`、`createEnvironment`、`installDependencies`、`pickFile`、`startInference`、`cancel`、`disposePlugin`。

- [ ] 补自动化环境发现测试；现有测试已覆盖非内置调用拒绝、句柄归属、参数校验和排队/运行中子进程取消。
- [x] 运行目标 Vitest 文件确认取消竞态因 `MODEL_JOB_NOT_RUNNING` 失败。
- [x] 实现 Windows/Linux 环境探测、校验下载、进程与 JobService 事件；再次运行目标测试。

### Task 3: SDK、IPC 与生命周期

**Files:** `packages/plugin-sdk/src/contracts.ts`、`packages/plugin-sdk/src/runtime.ts`、`desktop/src/contracts/plugin_host.ts`、`desktop/src/main/plugin-host/ipc.ts`、`desktop/src/main/plugin-host/index.ts`、对应测试。

**Interfaces:** 产出 `window.pluginAPI.models.*`，由 sender context 与安装记录决定授权，停用时清理进程。

- [x] 写 IPC/SDK 失败测试并运行。
- [x] 连接 model runtime service、注册内置插件和 SDK 方法。
- [x] 运行 SDK、IPC 及插件生命周期相关测试。

### Task 4: 图像超分工具插件和包装

**Files:** `desktop/resources/model-plugins/image-enhancement/`、`desktop/forge.config.ts`、构建脚本、对应测试。

**Interfaces:** 产出静态插件页面、manifest、MIT 上游模型源码、`runner.py`。

- [x] 写包装脚本参数测试并运行确认失败。
- [x] 实现环境与依赖按钮、模型链接/文件选择、参数表单、运行状态与取消；包装脚本仅接受 JSON 请求。
- [x] 验证插件 manifest、Python 语法与页面入口，检查打包资源路径。

### Task 5: 文档与端到端验证

**Files:** `docs/desktop/` 下模型插件说明及必要的已有插件文档。

- [x] 运行目标 Vitest、SDK 测试、桌面 typecheck/build、`git diff --check`。
- [x] 在文档中记录官方权重获取、CPU/CUDA 安装、环境路径、授权与真实模型验证限制。
- [x] 检查所有工作树差异，只报告本次新增改动和确实执行过的验证。
