# Hello Plugin 示例

本例展示 `hybrid` 插件的最小可用链路：组件库页面调用 SDK 命令，沙箱 Worker 返回结果，页面使用 `storage.self` 保存次数。

在仓库根目录运行：

```powershell
pnpm install
pnpm --dir packages/plugin-cli run build
pnpm run build:ui-vue
pnpm --dir examples/hello-plugin run build
pnpm --dir examples/hello-plugin run validate
```

在应用的“插件平台”中注册 `examples/hello-plugin` 目录，逐项批准 `ui.contribute`、`storage.self` 和 `commands.execute`，然后启用并打开“Hello Plugin”页面。生产入口由构建生成：`dist/index.html` 和 `dist/worker.html`。应用会拒绝把裸 JS 作为第三方 Worker 入口。

本例不申请网络或文件权限，也不调用 Node/Electron API。插件业务数据只通过 `window.pluginAPI` 访问宿主。
