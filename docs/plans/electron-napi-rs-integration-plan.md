# Electron 中接入 `napi-rs` 模块的实施方案

## 背景与根因

当前仓库中 `multi_platform_core` 通过 `napi-rs` 暴露 `@guyantools/core`，但原先的构建脚本没有传 `--features napi`。Rust 侧的 Node 绑定代码被 `feature = "napi"` 保护，因此生成的 `.node` 文件不是已注册的 N-API addon，最终在 Node 和 Electron 中都表现为：

```text
Module did not self-register
```

这不是 Electron 特有问题，而是原生模块本体构建错误。

## 当前落地方案

### 1. Workspace

- 根目录新增 `pnpm-workspace.yaml`
- workspace 包固定为：
  - `desktop`
  - `multi_platform_core`
- 根目录 `package.json` 设为 `private`，并作为统一命令入口

### 2. 原生模块构建

- `multi_platform_core` 是 workspace 内唯一的原生 Node 包
- 标准构建命令：

```bash
pnpm run native:build
```

- 标准开发构建命令：

```bash
pnpm run native:build:debug
```

- 对应实际执行：

```bash
pnpm --dir multi_platform_core build
pnpm --dir multi_platform_core build:debug
```

- `multi_platform_core/package.json` 中的关键脚本：

```json
{
  "build": "napi build --platform --release --features napi",
  "build:debug": "napi build --platform --features napi"
}
```

### 3. Electron 加载方式

- Electron 主进程只从包名 `@guyantools/core` 导入
- 不再将 `@guyantools/core` alias 到 `../multi_platform_core/index.js`
- 不再通过手写 Vite `.node` 插件参与解析
- `@guyantools/core` 在主进程构建中保持 runtime external
- 渲染进程不得直接导入原生包，只能通过 preload / IPC 调用

### 4. Forge 打包方式

- 使用 `@electron-forge/plugin-auto-unpack-natives`
- 不再通过 `extraResource` 从源码目录复制 `.node`
- 打包后的 `.node` 应来自 `node_modules/@guyantools/core`，并位于 unpack 路径

### 5. 构建产物边界

- `.node` 文件视为构建产物，不纳入 Git
- 删除仓库中已跟踪的 `desktop/multi-platform-core.win32-x64-msvc.node`
- `.gitignore` 已加入 `**/*.node`

## 标准命令

### 开发

```bash
pnpm install
pnpm run desktop:start
```

### 打包

```bash
pnpm install
pnpm run desktop:package
```

### 制作安装包

```bash
pnpm install
pnpm run desktop:make
```

## 目录与职责

- `multi_platform_core`
  - Rust 核心库
  - `napi-rs` 绑定
  - `@guyantools/core` 包装入口
- `desktop`
  - Electron 主进程、preload、renderer
  - 仅消费 `@guyantools/core`
- 根目录
  - workspace
  - 统一脚本
  - 文档与验收入口

## 故障排查

### 1. `Module did not self-register`

优先检查是否使用了错误构建命令。必须确保使用：

```bash
pnpm --dir multi_platform_core build
```

或：

```bash
pnpm --dir multi_platform_core build:debug
```

并且命令中包含 `--features napi`。

### 2. Electron 打包后找不到 `.node`

检查：

- `@electron-forge/plugin-auto-unpack-natives` 是否启用
- `@guyantools/core` 是否仍在 `node_modules` 中作为依赖存在
- `.node` 是否位于 `app.asar.unpacked` 或等价 unpack 路径

### 3. 运行 `desktop:start` 仍失败

检查：

- 根目录是否执行过 `pnpm install`
- `desktop/package.json` 中 `@guyantools/core` 是否为 `workspace:*`
- `multi_platform_core` 目录下是否已生成当前平台的 `.node`

## 本次验收结果

已完成的本地验证：

- `cargo test --manifest-path multi_platform_core/Cargo.toml` 通过
- `pnpm install` 已在根 workspace 完成
- `pnpm run native:build:debug` 成功生成 `multi-platform-core.win32-x64-msvc.node`
- `node -e "require('./multi_platform_core')"` 可直接加载成功
- `pnpm -C desktop exec node -e "require('@guyantools/core')"` 可加载成功
- `pnpm run desktop:start` 可正常启动 Electron，未再出现 `Module did not self-register`

打包相关验证：

- `pnpm run desktop:package` 已进入 Forge 的 `Packaging application` 阶段，未再出现原生模块加载错误
- 当前机器上的 `desktop/out/guyantools-win32-x64/resources/app.asar` 被系统锁定，导致 Forge 默认输出目录复用时返回 `EBUSY`
- 使用与 `@electron-forge/plugin-auto-unpack-natives` 相同的 unpack 规则单独打包到新目录后，已确认 `.node` 会出现在 `resources/app.asar.unpacked/node_modules/@guyantools/core/`

## 相关文档

- `docs/desktop/USAGE_EXAMPLE.md`
- `docs/core/INTEGRATION_GUIDE.md`
- `docs/core/QUICK_START.md`

上述文档已同步修正为以 `pnpm workspace + @guyantools/core + Forge unpack` 为准。
