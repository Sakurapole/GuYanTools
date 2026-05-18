# Project Guidance

本文件约束整个 `GuYanTools` 仓库。修改代码前先按当前目录和技术栈确认影响范围；优先沿用已有模块边界、命名和数据流，不为单点需求引入新的框架或依赖。

## Project Overview

GuYanTools 是一个跨平台工具应用仓库，当前主要由四部分组成：

- `desktop/`：Electron 桌面端，使用 Electron Forge + Vite + Vue 3 + TypeScript + Pinia + SCSS。
- `multi_platform_core/`：Rust 核心库，负责 SQLite 数据、终端、SSH、FTP 等跨端能力，并通过 napi-rs 暴露给桌面端，预留 Flutter 绑定。
- `mobile/`：Flutter 客户端实验/移动端实现，使用 Provider、Material 组件和本地状态模型。
- `docs/` 与 `stitch/`：正式需求、方案、架构文档和视觉设计参考。正式 Markdown 文档以 `docs/` 下版本为准。

根目录是 pnpm workspace，当前 workspace 包包括 `desktop` 和 `multi_platform_core`。不要把 `mobile/` 当作 pnpm workspace 包处理。

## Directory Structure

- `desktop/src/main/`：Electron 主进程能力，按领域拆分，如 `terminal`、`ssh`、`ftp`、`webview`、`plugin-host`、`tray`、`notification`。
- `desktop/src/preload.ts`：集中暴露 renderer 可用 API。新增 IPC 能力时需要同步维护 typed contract、preload API 和 main handler。
- `desktop/src/contracts/`：主进程、preload、renderer 共享的 TypeScript 契约。跨进程数据形状先放这里，不要让 renderer 猜测 IPC payload。
- `desktop/src/windows/main/`：主窗口 Vue 应用，包含 `pages/`、`components/`、`stores/`、`composables/`、`widgets/`、`assets/`。
- `desktop/src/windows/terminal/`、`notification/`、`tray-menu/`、`splash/`、`func/`：独立窗口入口，各自保留轻量 App 和 main 文件。
- `multi_platform_core/src/db/`：SQLite 连接、错误和迁移机制。
- `multi_platform_core/src/models/`：Rust 数据模型。
- `multi_platform_core/src/services/`：核心业务服务，常见模式是 `Service` 结构体 + 静态方法 + `DbResult<T>`。
- `multi_platform_core/src/bindings/`：平台绑定层，`napi.rs` 面向 Electron，`flutter.rs` 面向 Flutter。
- `multi_platform_core/migrations/`：SQL 迁移，按编号顺序执行。新增表/字段必须补迁移。
- `multi_platform_core/vendor/`：本仓库内置第三方代码补丁区，除非任务明确涉及 vendored 依赖，否则不要修改。
- `mobile/lib/`：Flutter 业务代码，分为 `core/`、`state/`、`ui/`、`features/`。
- `docs/`：正式文档目录。新增长期有效文档放入对应主题目录；临时草稿不要散落在根目录。

## Code Style

### General

- 先复用已有 helper、service、store、composable、UI 组件和主题变量，再考虑新增抽象。
- 保持改动小而可审查；不要顺手重排无关文件或做大范围格式化。
- 新增依赖需要明确必要性；能用现有依赖和标准库完成时不要加包。
- 注释只解释不明显的业务约束、边界条件或平台限制；避免重复代码表面含义。
- 代码中已经大量使用中文业务注释和中文 UI 文案，可以延续；公共 API、类型、函数和文件名保持英文命名。

### TypeScript / Electron / Vue

- TypeScript 使用 `@/* -> desktop/src/*` 路径别名；跨模块引用优先使用该别名。
- `desktop/tsconfig.json` 开启 `noImplicitAny`，但 ESLint 当前允许显式 `any`。新增代码仍应优先给出具体类型，只有 Electron/IPC 边界等确实难以表达时再使用 `any`。
- IPC 能力按领域命名，通道使用 `domain:action` 格式，例如 `ftp:list-profiles`、`terminal:create-session`。
- 新增 renderer 可调用能力时，通常按顺序修改：
  1. `desktop/src/contracts/<domain>.ts`
  2. `desktop/src/preload.ts`
  3. `desktop/src/main/<domain>/ipc.ts`
  4. 对应 host/service/store/component
- Vue 组件优先使用 `<script lang="ts" setup>`、Composition API、`computed/ref/watch` 和 scoped SCSS。
- Pinia store 当前多采用 setup store；异步操作负责维护本地状态、loading、事件通知和必要的 HMR。
- UI 组件优先复用 `desktop/src/windows/main/components/ui/`，样式优先使用 `assets/*.scss` 中的 CSS variables、主题 token、现有半径/阴影/控件高度变量。
- 样式命名延续 BEM-like class，例如 `ui-button__label`、`ui-button--primary`。避免在页面内重复造通用控件。
- 多窗口代码保持隔离，不要让主窗口专用 store/composable 泄漏到 tray、notification、terminal detached window，除非已经存在共享抽象。

### Rust Core

- Rust edition 为 2021。数据库和业务方法统一返回 `DbResult<T>`，错误通过 `DbError`/`thiserror`/`anyhow` 体系传递。
- 数据库访问优先通过 `Database::with_connection` 或 `Database::transaction`，写操作涉及多步一致性时使用 transaction。
- SQL 使用 `rusqlite::params!` 参数化，不拼接用户输入。
- 新业务能力按 `models -> migrations -> services -> bindings -> TypeScript declarations` 顺序补齐。
- N-API 相关能力放在 `bindings/napi.rs`，构建时通过 `features = ["napi"]` 启用；Flutter binding 不要和 napi 特定逻辑耦合。
- 新增迁移文件使用连续编号，如 `016_add_xxx.sql`，并检查 `src/db/migration.rs` 是否需要注册。
- 对核心业务逻辑优先添加 Rust 单元测试；已有服务测试多放在同文件的 `#[cfg(test)] mod tests` 中。

### Flutter / Dart

- 遵循 `mobile/analysis_options.yaml` 中的 `flutter_lints`。
- UI 代码延续 Material + Provider 风格，状态放入 `mobile/lib/state/`，主题色和公共模型放入 `mobile/lib/core/`。
- 页面组件保持小函数拆分，例如 `_buildGreeting`、`_buildTaskItem`，但不要把一次性布局过度抽象成全局组件。

### Documentation

- 面向功能设计、架构、验收的文档放入 `docs/` 对应目录。
- `stitch/` 用作设计稿和视觉参考，不作为正式产品文档来源。
- 更新实现时，如果行为、架构或验证方式与现有文档冲突，优先同步相关 `docs/` 文件。

## Build and Test Commands

按改动范围选择最小但足够的验证：

- 安装依赖：`pnpm install`
- 桌面开发启动：`pnpm run desktop:start`
- 桌面 lint：`pnpm --dir desktop run lint`
- 桌面构建：`pnpm --dir desktop run build:app`
- 原生核心 debug 构建：`pnpm run native:build:debug`
- 原生核心 release 构建：`pnpm run native:build`
- Rust 测试：`cargo test --manifest-path multi_platform_core/Cargo.toml`
- Flutter 分析：`flutter analyze`（在 `mobile/` 下）
- Flutter 测试：`flutter test`（在 `mobile/` 下）
- 提交信息检查：`pnpm run commitlint -- --from HEAD~1 --to HEAD` 或对具体消息使用项目 commitlint 配置。

若只修改 Markdown，可不跑完整构建，但最终说明里要明确验证范围。

## Git Guidance

- 提交前按照项目中配置的规范生成提交信息：优先使用 `pnpm run commit`，提交格式遵循 `commitlint.config.js`。
- commit type 必须是 `build|feat|fix|docs|style|refactor|perf|test|revert|ci|config|chore` 之一。
- scope 建议使用项目已有范围：`desktop`、`mobile`、`core`、`docs`、`openspec`、`build`、`deps`、`git`、`config`、`ui`、`terminal`、`ssh`、`ftp`、`webview`、`todo`、`plugins`、`home`、`media`、`notification`、`tray`、`tests`。
- subject 用一句话说明“为什么做这次变更”，不超过 72 字符。
- 重要提交建议补充 Lore trailers，例如 `Constraint:`、`Rejected:`、`Confidence:`、`Scope-risk:`、`Tested:`、`Not-tested:`。
- 不要回滚或覆盖用户未提交改动；处理同一文件时先读 diff，基于现状继续修改。

## Restrictions

- 不要提交构建产物、`.node` 原生二进制、`target/`、`node_modules/` 或临时日志。
- 不要在 renderer 中直接访问 Node/Electron/数据库；必须通过 preload 暴露的白名单 API 和 typed contracts。
- 不要绕过插件权限、manifest、lifecycle 和 runtime router 直接给第三方插件开放宿主能力。
- 不要在核心数据模型变更时遗漏 SQL migration、Rust model/service、bindings 和 TypeScript declaration 的同步。
- 不要修改 `multi_platform_core/vendor/` 中的第三方源码，除非任务目标明确要求修补 vendored 依赖。
- 不要在没有必要的情况下引入全局状态、单例或长生命周期定时器；涉及终端、SSH、FTP、插件 runtime 时尤其要处理释放、取消订阅和窗口关闭路径。
