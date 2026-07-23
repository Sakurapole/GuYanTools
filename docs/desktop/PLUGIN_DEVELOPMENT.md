# GuYanTools 插件开发

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

## 安全要求

生产插件不得包含 `dev`、`devServer`、`uiUrl`、`workerUrl`、session token、绝对路径或 `node_modules`。插件运行时保持 `sandbox`、`contextIsolation`、`nodeIntegration: false`、`webSecurity` 和 sender-context 权限检查。站点专用解析、下载和匹配逻辑必须放在插件自己的 worker/resolver 中，宿主只提供通用能力。
