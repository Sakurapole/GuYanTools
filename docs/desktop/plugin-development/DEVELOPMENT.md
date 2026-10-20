# 插件开发流程

插件由 `guyantools.plugin.json`、UI 页面和可选 Worker 组成。第三方插件只支持 `trustLevel: "sandboxed"`，运行时为 `ui`、`worker` 或 `hybrid`。页面与 Worker 都在沙箱中执行，宿主依据实际创建的 runtime 身份检查每次调用。

## 清单与入口

生产清单至少声明身份、版本、运行时、入口、权限、业务能力和贡献点。`permissions` 是宿主原语授权，`capabilities` 是插件对外提供的业务功能，互不替代。下面是示例项目的关键字段：

```json
{
  "schemaVersion": "1.1",
  "id": "guyantools.hello-plugin",
  "pluginApiVersion": "1.0.0",
  "trustLevel": "sandboxed",
  "runtime": "hybrid",
  "entry": { "ui": "dist/index.html", "worker": "dist/worker.html" },
  "permissions": ["ui.contribute", "storage.self", "commands.execute"],
  "capabilities": [],
  "contributes": {
    "pages": [{ "id": "main", "title": "Hello Plugin" }],
    "commands": [{ "id": "guyantools.hello-plugin.greet", "title": "生成问候语" }]
  }
}
```

实际清单还必须提供 `name`、`displayName`、`version`、`description`、`hostVersionRange` 和 UI 声明。请以示例源码为完整基准。入口必须是插件目录内的相对常规文件；符号链接越界、绝对路径和 `..` 会被拒绝。

## 沙箱 Worker 与 ready

第三方 Worker 入口必须是 HTML。`@guyantools/plugin-vite` 根据 `src/worker.ts` 生成 `worker.js`、`worker-bootstrap.js` 和 `worker.html`。bootstrap 在模块加载和 handler 登记后调用 `lifecycle.ready()`；宿主收到 ready 后才认为 Worker 可用。`workerRuntime: "utility"` 和裸 JS 入口都会在校验时拒绝。

```ts
await window.pluginAPI.commands.register('guyantools.hello-plugin.greet', (payload) => {
  return { message: `你好，${String(payload ?? '')}` };
});
```

不要在 Worker 里使用 `require`、`process`、`fs` 或直接 `fetch`。网络、文件和下载需求须分别声明权限，并调用 SDK 的受控 API。

## 权限与调用

安装不会自动批准权限。用户可逐项批准；未获批准的 API 调用返回结构化权限错误。插件声明命令或 capability 后，运行时还要注册相应 handler，宿主才能转发调用。命令 ID 必须以插件 ID 为前缀。

`contributes` 支持页面、widget、命令、应用/上下文菜单、快捷键和后台任务。菜单和快捷键引用已声明命令；后台任务使用 `every:<分钟>m` 调度，并要求 `background.run`、`commands.execute` 两项已批准。对用户可见的入口以宿主的启用状态和实际注册结果为准。

## 本地开发与交付

使用 `pnpm run dev` 启动本地开发会话，`pnpm run build` 生成生产文件，`pnpm run validate` 检查清单及入口，`pnpm run pack` 生成 zip 和 SHA-256 目录条目。打包前确认 `dist/worker.html` 存在，并检查 zip 内没有 `node_modules`、开发 token 或源码绝对路径。发布市场时还要校验 catalog 摘要与真实 manifest 一致。

## 状态与故障排查

启用需要通过兼容性、授权、依赖和 Worker ready 检查。失败后在插件管理页查看运行状态和错误。常见错误：`PLUGIN_ENTRY_INVALID` 表示入口不符合规则；`PLUGIN_WORKER_READY_TIMEOUT` 表示 Worker 未完成启动；`PERMISSION_DENIED` 表示对应宿主权限未批准；`PLUGIN_CAPABILITY_RUNTIME_UNAVAILABLE` 表示目标 handler 未运行。先复核 manifest 与构建产物，再检查插件页面和 Worker 的注册代码。
