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

发布配置位于 `.guyantools/publish.json`。非 dry-run 发布会使用 `GH_TOKEN`，或当前已登录的 `gh` 会话；命令通过参数数组调用 `git` 和 `gh`，不经 shell 解析。默认 `catalogMode: "pull-request"` 会更新指定插件的 Marketplace 条目并创建 PR。使用 `catalogMode: "direct"` 时，必须同时设置 `allowDirectPublish: true`，CLI 还会用 `gh api` 验证对目录仓库的 push 权限。`--no-push` 只创建本地 tag 和包，不会创建 Release、提交 Marketplace 或发起 PR。
