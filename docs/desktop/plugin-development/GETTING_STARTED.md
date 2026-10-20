# 插件开发入门

GuYanTools 桌面端插件运行在受限的 Electron 页面环境中。页面和后台 Worker 都通过 `window.pluginAPI` 调用宿主，不能直接使用 Node、Electron 或宿主数据库。本指南针对当前仓库中的 manifest schema `1.1`、Plugin API `1.0.0` 和 Windows 桌面端实现。

## 开发前准备

在 GuYanTools 仓库根目录安装依赖，并先构建插件工具链和组件库：

```powershell
pnpm install
pnpm --dir packages/plugin-cli run build
pnpm run build:ui-vue
```

当前 `@guyantools/plugin-cli` 与组件库包是仓库内 workspace 包。仓库内示例使用 `workspace:*`，直接复制到独立仓库前需要先改为实际可获取的包版本或本地路径。

## 从示例开始

打开 `examples/hello-plugin`，这是一个完整的 Vue + 组件库示例。构建与检查命令：

```powershell
pnpm --dir examples/hello-plugin run build
pnpm --dir examples/hello-plugin run validate
```

构建输出 `dist/index.html`、`dist/worker.html` 和 `dist/worker-bootstrap.js`。在应用的“插件平台”页注册示例目录，批准它声明的三项权限，启用后打开 **Hello Plugin** 页面。点击按钮会通过 `commands.execute` 调用沙箱 Worker；问候次数通过 `storage.self` 持久化。

## 创建自己的插件

CLI 提供 Vue 和 React 模板。当前 CLI 是仓库内包，请在仓库根目录执行下面的命令，把新项目放入 `examples/` workspace：

```powershell
Set-Location examples
node ../packages/plugin-cli/dist/index.js create my-plugin --framework vue
Set-Location my-plugin
pnpm install
pnpm run build
pnpm run validate
pnpm run pack
```

模板与示例共用相同的 manifest、构建和打包规则。安装前建议先从最小权限开始，只有需要宿主能力时才新增对应 `permissions`。

## 运行与调试

本地开发可运行 `pnpm run dev`。CLI 只绑定 `127.0.0.1`，并写入 `.guyantools/plugin.dev.json`；在应用插件管理页连接本地目录后，宿主才接受该开发会话。生产 manifest 不允许包含开发 URL 或 session token。调试时先看插件管理页的状态、错误与 Job，再检查页面控制台。

## 下一步

阅读“开发流程”了解 manifest、权限、运行时与生命周期；阅读“API 参考”核对可用方法。示例项目的源文件在 `examples/hello-plugin`，可以直接对照页面和 Worker 的调用链。
