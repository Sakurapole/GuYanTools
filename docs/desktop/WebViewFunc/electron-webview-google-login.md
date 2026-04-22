# Electron Webview 中 Google 登录复用实现总结

本文总结 Cherry Studio 在 Electron `webview` 中实现 Google 登录复用的方式，重点说明：

- 实际起作用的核心机制是什么
- 哪些只是辅助兼容手段
- 如果要迁移到另一个 Electron 应用，建议如何实现
- 哪些能力在当前实现里并不存在，不应误判

本文基于以下代码整理：

- `src/renderer/src/components/MinApp/WebviewContainer.tsx`
- `src/renderer/src/components/MinApp/MinappPopupContainer.tsx`
- `src/main/services/WebviewService.ts`
- `src/main/services/WindowService.ts`
- `src/main/ipc.ts`
- `src/main/services/ProxyManager.ts`

## 一句话结论

Cherry Studio 在 `webview` 里复用 Google 登录态，核心不是“深度伪装成受信任浏览器”，而是：

1. 所有小程序 `webview` 共享同一个持久化 session 分区 `persist:webview`
2. 先在独立的 Google 小程序里登录，把 cookie / storage 写入这个共享 session
3. 其他小程序继续使用同一个 session，因此能复用 Google 登录态
4. UA 和请求头改写只是辅助兼容，不是主要机制

## 核心实现

### 1. 所有小程序共用同一个 partition

`WebviewContainer.tsx` 中每个小程序都使用同一个分区：

```tsx
<webview
  allowpopups={'true' as any}
  partition="persist:webview"
  ...
/>
```

这意味着：

- 同一个 partition 下的多个 `webview` 共享 cookies
- 共享 local storage / indexed storage / service workers 等站点数据
- Google 登录一旦完成，后续站点如果也走这个 partition，就可能直接拿到登录态

对应代码：

- `src/renderer/src/components/MinApp/WebviewContainer.tsx`

### 2. Google 小程序和 Gemini 小程序都走这个共享分区

默认小程序列表里至少包含：

- `google` -> `https://google.com/`
- `gemini` -> `https://gemini.google.com/`

对应代码：

- `src/renderer/src/config/minapps.ts`

这使得一种明确的使用路径成立：

1. 先打开 Google 小程序
2. 在 Google 小程序里完成账号登录
3. 再打开 Gemini 或其他依赖 Google 登录的小程序
4. 这些页面复用同一个 session，因此能继承登录态

### 3. 产品层面明确提示“先去 Google 小程序登录”

`MinappPopupContainer.tsx` 里有一段显式逻辑：

- 监听页面当前 URL
- 如果命中 Google 登录相关地址，例如 `accounts.google.com`
- 且当前小程序不是 `google`
- 就弹出提示，要求用户先打开 Google 小程序登录

典型检测模式包括：

- `accounts.google.com`
- `signin/oauth`
- `auth/google`
- `login/google`
- `sign-in/google`
- `google.com/signin`
- `gsi/client`

并且点击提示按钮会直接：

```ts
openMinappById('google', true)
```

这说明设计意图非常明确：它不是在“自动绕过 Google 登录限制”，而是在引导用户先把共享 session 建好。

对应代码：

- `src/renderer/src/components/MinApp/MinappPopupContainer.tsx`

### 4. 小程序 webview 是 keep-alive 的

`MinappPopupContainer.tsx` 没有在切换小程序时销毁所有 `webview`，而是：

- 用 `Map<string, WebviewTag | null>` 保存多个 webview 引用
- 切换时只改 `display`
- 最小化时也保留这些 webview

这会带来两个效果：

- 页面内存态、登录上下文更稳定
- 用户在 Google 页面登录后，切回其他小程序更容易直接复用状态

这不是 session 共享的必要条件，但会增强体验稳定性。

对应代码：

- `src/renderer/src/components/MinApp/MinappPopupContainer.tsx`

## UA 和请求头处理

### 1. session 级 UA 清洗

`WebviewService.ts` 在启动时会初始化 `persist:webview` 的 session：

- 读取原始 UA
- 去掉 `CherryStudio/...`
- 去掉 `Electron/...`

简化后逻辑类似：

```ts
const wvSession = session.fromPartition('persist:webview')
const originUA = wvSession.getUserAgent()
const newUA = originUA.replace(/CherryStudio\/\S+\s/, '').replace(/Electron\/\S+\s/, '')
wvSession.setUserAgent(newUA)
```

这一步的目的主要是减少“桌面容器特征”暴露。

### 2. 请求头级别再次改写

同一个文件还对 `onBeforeSendHeaders` 做了处理：

- 默认把 `User-Agent` 改成 `newUA`
- 但 URL 包含 `google.com` 时，改回 `originUA`
- 同时补充 `Accept-Language`

逻辑类似：

```ts
'User-Agent': details.url.includes('google.com') ? originUA : newUA,
'Accept-Language': `${language}, en;q=0.9, *;q=0.5`
```

这里要特别注意：

- 这是网络层请求头的改写
- 它不等同于完整模拟 Safari / Chrome
- 它也不代表一定能通过 Google 的“受信任浏览器”策略

### 3. Google 小程序单独设置了 `useragent` 属性

渲染层还对 `appid === 'google'` 的 `<webview>` 单独设置了一个 Safari 风格的 `useragent`：

```tsx
useragent={
  appid === 'google'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)  Safari/537.36'
    : undefined
}
```

这里需要注意两点：

1. 它只针对 `google` 小程序
2. 它和 session 级 `onBeforeSendHeaders` 的 UA 改写并不完全一致

因此真实表现是“DOM 侧 UA + 网络层 UA 混合改写”，并不是一套严谨统一的浏览器指纹模拟。

对应代码：

- `src/renderer/src/components/MinApp/WebviewContainer.tsx`
- `src/main/services/WebviewService.ts`

## 弹窗和新窗口行为

### 1. webview 内部弹窗默认允许打开

`WebviewContainer.tsx` 给 `<webview>` 打开了：

```tsx
allowpopups={'true' as any}
```

同时主进程里可以通过 IPC 控制：

- 是否把新链接交给系统浏览器
- 或者允许继续在应用内打开

`WebviewService.ts` 中对应的是：

```ts
webview.setWindowOpenHandler(({ url }) => {
  if (isExternal) {
    void shell.openExternal(url)
    return { action: 'deny' }
  } else {
    return { action: 'allow' }
  }
})
```

这部分主要是控制“弹窗去哪里打开”，不是专门为 Google 登录写的。

### 2. 主窗口对部分 OAuth 弹窗强制使用 `persist:webview`

`WindowService.ts` 对主窗口 `setWindowOpenHandler()` 做了一个白名单：

- 某些 OAuth / 充值 / 控制台 URL 被允许在应用内弹出
- 并且显式指定 `overrideBrowserWindowOptions.webPreferences.partition = 'persist:webview'`

简化后类似：

```ts
return {
  action: 'allow',
  overrideBrowserWindowOptions: {
    webPreferences: {
      partition: 'persist:webview'
    }
  }
}
```

这一点很重要，因为它说明项目作者明确知道：

- 只要弹出的页面和主小程序共享同一个 partition
- 登录态和站点数据就更容易复用

不过这里的白名单不是针对 Google 登录专门写的，而是针对若干特定站点。

对应代码：

- `src/main/services/WindowService.ts`

## 缓存、cookie、代理都围绕 `persist:webview`

### 1. 清缓存时会清这个分区

`ipc.ts` 中清缓存逻辑同时处理：

- `session.defaultSession`
- `session.fromPartition('persist:webview')`

并清理：

- `cache`
- `cookies`
- `filesystem`
- `serviceworkers`
- `cachestorage`

这进一步证明 `persist:webview` 是一个长期持有登录态的关键分区。

### 2. 代理也会下发到这个分区

`ProxyManager.ts` 会对以下两个 session 一起 `setProxy()`：

- `session.defaultSession`
- `session.fromPartition('persist:webview')`

这说明：

- 如果你的另一个 Electron 应用也需要在国内环境下让 Google 页面可访问
- 除了共享 partition，也要考虑代理配置同步到对应 session

对应代码：

- `src/main/ipc.ts`
- `src/main/services/ProxyManager.ts`

## 当前实现里“没有看到”的能力

下面这些能力，在当前代码里没有发现：

- 没有专门给 Google 登录页注入脚本来自动填表、自动跳转或篡改流程
- 没有手动写入 Google cookies / localStorage
- 没有接管 Google OAuth 回调并在本地解析 token
- 没有专门绕过证书校验
- 没有权限请求统一放行逻辑，例如 `setPermissionRequestHandler`
- 没有做更完整的浏览器指纹模拟，例如 `navigator`、client hints、platform 指纹统一伪装

因此不能把这套实现理解成：

- “完整绕过 Google 的受信任浏览器策略”
- “可靠模拟原生 Chrome”
- “只靠改 UA 就能解决登录问题”

更准确的理解是：

- 能成功时，主要靠共享 session
- UA 改写只是降低被识别为 Electron 容器的概率
- 如果 Google 进一步提高风控要求，这套方案不一定稳定

## 可迁移到另一个 Electron 应用的最小实现方案

如果你要在另一个 Electron 应用里复用这套思路，建议最少实现以下几步。

### 1. 所有相关 webview 使用同一个 persistent partition

示例：

```tsx
<webview
  src="https://google.com/"
  partition="persist:webview"
  allowpopups
/>
```

以及其他依赖 Google 登录的页面也使用同一个 `partition`。

### 2. 在主进程统一初始化该 partition 的 session

示例：

```ts
import { session } from 'electron'

export function initSharedWebviewSession() {
  const shared = session.fromPartition('persist:webview')
  const originUA = shared.getUserAgent()
  const safeUA = originUA.replace(/YourAppName\/\S+\s/, '').replace(/Electron\/\S+\s/, '')

  shared.setUserAgent(safeUA)
  shared.webRequest.onBeforeSendHeaders((details, cb) => {
    cb({
      requestHeaders: {
        ...details.requestHeaders,
        'User-Agent': details.url.includes('google.com') ? originUA : safeUA
      }
    })
  })
}
```

### 3. 提供一个专门的 Google 登录入口页

建议单独放一个 Google webview 页面，专门让用户先登录 Google。

然后其他业务页复用同一 partition。

不要指望每个站点自己的“Google 登录弹窗”都能稳定触发并稳定成功。

### 4. 检测 Google 登录 URL，必要时引导用户回到 Google 登录页

建议监听页面跳转：

- 如果命中 `accounts.google.com`
- 但当前页不是专门的 Google 登录页
- 就提示用户“请先在 Google 登录页完成账号登录”

这个产品设计比“盲目重试弹窗登录”更稳定。

### 5. 代理配置同步到这个 session

如果你的应用运行环境可能需要代理，记得对共享 partition 也设置代理：

```ts
await session.fromPartition('persist:webview').setProxy(config)
```

### 6. 明确告诉业务方：这不是 100% 可靠方案

必须接受以下现实：

- Google 登录的风控策略可能变化
- 只改 UA 不保证成功
- 某些站点会额外检查浏览器可信度、嵌入环境、指纹或弹窗链路

所以更合理的定位是：

- 这是一个“尽量复用 Google 登录态”的工程化方案
- 不是一个保证通过所有 Google 登录校验的通用黑科技

## 迁移建议

如果你要在自己的 Electron 应用里落地，建议采用下面的结构：

1. `shared webview session service`
   统一初始化 `session.fromPartition('persist:webview')`
2. `google login webview`
   专门承载 Google 登录
3. `business webviews`
   Gemini、NotebookLM、第三方站点等全部走同一 partition
4. `login hint layer`
   发现进入 Google 登录页时，引导用户回到 Google 登录入口完成登录
5. `session maintenance`
   提供 clear cache / clear storage / proxy sync

## 官方文档参考

- Electron `window.open` / `webContents.setWindowOpenHandler()`
  - https://www.electronjs.org/docs/latest/api/window-open
- Electron `<webview>` 标签
  - https://www.electronjs.org/docs/latest/api/webview-tag

## 最终结论

Cherry Studio 的实现可以概括为：

- 用共享持久化 `partition` 保存 Google 登录态
- 用独立 Google 小程序作为登录入口
- 用 URL 检测和提示把用户引导到正确登录路径
- 用 UA / 请求头改写做轻量兼容
- 用 keep-alive 和统一代理/缓存管理提高稳定性

如果你要在另一个 Electron 应用里复用，这套思路是可迁移的；但它解决的是“登录态复用”问题，不是“彻底伪装成受信任浏览器”问题。
