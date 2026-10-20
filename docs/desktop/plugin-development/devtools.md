# 插件页面 DevTools 按钮

在 `guyantools.plugin.json` 中配置：

```json
{
  "uiApiVersion": "1.0.0",
  "ui": {
    "theme": "guyantools",
    "components": "@guyantools/plugin-ui",
    "showDevToolsButton": true
  }
}
```

`ui.showDevToolsButton` 必须是布尔值。省略或为 `false` 时，宿主顶栏隐藏按钮；为 `true` 时，只在当前插件页面显示“打开当前插件 DevTools”。图像处理插件已开启。

按钮调用宿主 preload 的 `pluginHostApi.openDevTools(pluginId, pageId)`。主进程只接受主窗口 sender，再校验插件开启状态、manifest 配置和当前挂载页面的身份，最后打开该插件 WebContentsView 的独立 DevTools。不会打开主窗口或其他插件的工具。

此配置控制按钮显示，不改变插件沙箱、Node 权限或既有调试快捷键。更改 manifest 后重新加载插件/应用配置以生效。

插件资源请求白名单与 DevTools 共享同一个 Electron session。宿主只为该 session 中 Chromium 创建的 `remote` WebContents 放行 `devtools://devtools/bundled/` 内置前端资源和 `devtools://theme/colors.css` 主题样式，并验证实际请求 sender 身份。DevTools 首次加载时 `devToolsWebContents` 尚未赋值，因此不能只依赖该属性来判断首个请求。

插件页面与 Worker 仍不能借此访问 DevTools 内部页面、外网或插件目录外文件。`remoteBase` 查询参数不会授予外网权限。此修复针对 `devtools://...devtools_app.html` 被误拦截为 `ERR_BLOCKED_BY_CLIENT` 的问题。

运行 `node desktop/scripts/verify-plugin-devtools-electron.cjs` 可在独立 Electron 进程验证真实 DevTools 首次打开、关闭后重开、内置资源加载，以及插件沙箱与直连网络拦截。测试使用临时插件目录和临时 userData，结束后清理，不修改现有应用安装记录。
