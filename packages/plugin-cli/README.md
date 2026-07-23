# GuYanTools Plugin CLI

创建并发布 Vue/React 插件：

```powershell
pnpm create guyantools-plugin demo --framework vue
cd demo
pnpm install
pnpm run dev
pnpm run validate
pnpm run build
pnpm run pack
pnpm run publish -- --dry-run
```

`dev` 只绑定 `127.0.0.1`，并写入 `.guyantools/plugin.dev.json`。生产包只包含 `dist/`、生产 manifest、README 和 LICENSE；manifest 不得包含 dev URL、session token、绝对路径或未声明权限。插件页面通过 `@guyantools/plugin-sdk` 使用宿主的 typed runtime API。
