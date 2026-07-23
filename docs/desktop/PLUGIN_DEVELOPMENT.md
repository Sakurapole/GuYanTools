# GuYanTools 插件开发

完整的能力范围、manifest 示例、SDK 方法、权限表和发布配置见 [插件系统能力与开发指南](./PLUGIN_SYSTEM_CAPABILITIES.md)。

## 技术边界

插件 UI 可以使用 Vue 3 或 React。UI 通过 `@guyantools/plugin-ui` 的 Custom Elements 和 `--gt-*` token 接入宿主主题；业务逻辑通过 `@guyantools/plugin-sdk` 调用，不能直接访问 Electron、Node、数据库或宿主源码。

插件 manifest 使用 schema `1.1`，UI 声明 `uiApiVersion` 与 `ui.theme: "guyantools"`。`permissions` 是宿主 API 权限，`capabilities` 是插件声明的业务能力，两者必须分别填写。

## 开发与热加载

```powershell
pnpm create guyantools-plugin demo --framework vue
cd demo
pnpm install
pnpm run dev
```

CLI 启动插件自己的 Vite server，固定 loopback host，并在 `.guyantools/plugin.dev.json` 写入 session token。桌面端只接受活动 session 的 UI/Worker URL；session 断开后自动回到已安装包的静态入口。开发页会显示连接端口，停止本地开发后删除 session 文件。

## 构建、打包、发布

```powershell
pnpm run validate
pnpm run build
pnpm run pack
pnpm run publish -- --dry-run
```

构建输出固定为 `dist/index.html` 和可选的 `dist/worker.js`，manifest 会被复制到 `dist/guyantools.plugin.json`。`publish --dry-run` 只生成 tag、GitHub Release 和 Marketplace catalog 命令；真实发布需要 GitHub 凭据，并使用 manifest 中原始的 permissions/capabilities。

发布配置写在 `.guyantools/publish.json`。CLI 优先使用 `GH_TOKEN`，否则校验当前 `gh auth status` 登录会话；不会通过 shell 拼接命令。默认 `catalogMode` 是 `pull-request`，会只更新当前插件 ID 对应的 `catalog.json` 条目，推送独立分支并创建 PR。direct 发布需明确配置 `allowDirectPublish: true`，并由 `gh api` 确认目录仓库 push 权限后才会提交到目标分支。`--no-push` 仍创建本地 tag 与 zip，但不会创建 GitHub Release、Marketplace commit 或 PR。

## 安全要求

生产插件不得包含 `dev`、`devServer`、`uiUrl`、`workerUrl`、session token、绝对路径或 `node_modules`。插件运行时保持 `sandbox`、`contextIsolation`、`nodeIntegration: false`、`webSecurity` 和 sender-context 权限检查。站点专用解析、下载和匹配逻辑必须放在插件自己的 worker/resolver 中，宿主只提供通用能力。
