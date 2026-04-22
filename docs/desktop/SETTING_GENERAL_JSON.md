# 统一 JSON 配置与设置页重构

## Summary

- 新增主进程统一配置管理器，配置文件固定为 `app.getPath('userData')/guyantools.config.json`，不再把应用设置写入 SQLite，也不再依赖渲染层 `localStorage` 保存真实配置。
- 应用启动时先在主进程加载并缓存配置，再由渲染进程在 `bootstrap()` 早期读取配置快照，立即应用主题、语言、字体族和基础字号。
- 重写设置页内容结构，保留现有 `UiTabs` 的 line 样式，但移除 `UiCard`，主内容区不加 padding，改为分段式平铺布局。
- 设置顶层 tab 调整为 `基础设置`、`AI Agent`、`插件配置`；后续新增内置功能时，继续直接挂到顶层 tab，不再保留“应用内部功能配置”这一层。

## Key Changes

- 配置模型统一为 `AppConfig`，至少包含：
  - `version`
  - `appearance.theme`: `'light' | 'dark'`
  - `appearance.language`: `'zh' | 'en'`
  - `appearance.fontFamily`: `string`，支持保留值 `system-default`
  - `appearance.baseFontSize`: `number`
  - `features.aiAgent`: `{}`，先保留对象容器
  - `plugins.unloadAfterMinutes`: `number`，`0` 表示关闭自动 unload
  - `plugins.items`: `Record<string, Record<string, unknown>>`
- 主进程新增配置服务与 IPC：
  - `getConfig()`
  - `updateConfig(patch)`
  - `listLocalFonts()`
  - `listLocalFonts()` 采用本地字体枚举能力优先；不可用时返回仅含 `system-default` 的回退列表。
- preload 暴露统一 `appConfigApi`，渲染层只通过该 API 读写配置。
- 渲染层新增配置 store，职责仅为：
  - 持有配置快照
  - 调用 IPC 更新配置
  - 把配置同步到运行时 UI
- 主题与字体应用方式固定：
  - `theme` 继续控制根节点 `light/dark` class
  - `fontFamily` 和 `baseFontSize` 写入根节点 CSS 变量或 `html` 样式
  - 全局字号基线采用 `html { font-size: <baseSize>px; }`
  - 共享 UI 组件和设置页文本统一使用 `rem` 比例，不再新增与 `baseSize` 脱钩的固定字号
- `vue-i18n` 初始化改为读取配置中的 `language`，不再写死 `zh`。
- `useTheme()` 改为基于配置 store，而不是 `useLocalStorage('theme')`。
- `settings_store.ts` 仅保留页面内部 UI 状态：
  - `activeSettingsTab`
  - `activePluginConfigId`
  - 不再持久化真实应用配置
- 设置页结构固定为：
  - `基础设置`：字体、基础字号、语言、主题
  - `AI Agent`：把现有占位内容上移为独立顶层页
  - `插件配置`：顶部仍用 `UiTabs` 切换每个已安装插件
- `插件配置` 页具体表现固定为：
  - 顶部显示全局插件策略字段：`unloadAfterMinutes`
  - 下方按插件 tab 展示插件元信息
  - 每个插件面板提供一个宿主管理的通用 JSON 配置编辑区，绑定 `config.plugins.items[pluginId]`
  - 不引入插件 schema 协议；没有配置时显示空对象 `{}` 作为初始值
- 插件闲置 unload 的语义固定为“仅卸载运行时实例”：
  - 不修改插件注册状态，不改 `enabled/disabled`
  - 仅对已挂载的 UI 插件页面生效
  - 由主进程记录插件最近使用时间，在超时后调用现有 runtime unmount 逻辑
  - 再次进入插件页面时重新 mount
- 空闲使用判定固定为：
  - 插件页面 mount 时记一次使用
  - 插件页面 bounds 更新或再次导航进入该插件页时刷新使用时间
  - `unloadAfterMinutes <= 0` 时不启动自动卸载
- 配置文件读取策略固定为：
  - 文件不存在时写入默认配置
  - 文件存在但字段缺失时按默认值补齐并回写
  - 文件 JSON 非法时保留损坏文件副本并重建默认配置

## Public Interfaces / Types

- 新增共享类型：
  - `AppConfig`
  - `AppAppearanceConfig`
  - `AppPluginsConfig`
  - `LocalFontOption`
- 扩展 `window` 暴露：
  - `window.appConfigApi.getConfig`
  - `window.appConfigApi.updateConfig`
  - `window.appConfigApi.listLocalFonts`
- 设置页顶层 tab key 固定为：
  - `general`
  - `ai-agent`
  - `plugins`

## Test Plan

- 配置服务：
  - 首次启动自动生成默认 `guyantools.config.json`
  - 缺失字段时能补齐默认值
  - 非法 JSON 时能回退并恢复默认配置
- 启动链路：
  - 启动后主题、语言、字体、基础字号按配置立即生效
  - 刷新/重启后配置保持一致
- 设置页：
  - 不再使用 `UiCard`
  - 顶层 tab 为 `基础设置 / AI Agent / 插件配置`
  - 主内容区无额外 padding
  - 修改基础设置后配置文件同步更新
- 字体与字号：
  - 可选 `system-default` 和本地字体列表
  - 修改 `baseFontSize` 后共享控件文本按 `rem` 缩放
- 插件配置：
  - 插件 tab 能加载已安装插件
  - 每个插件的 JSON 配置可读可写并持久化到统一配置文件
  - `unloadAfterMinutes` 可配置并持久化
- 自动 unload：
  - 开启超时后，闲置插件页会被 unmount
  - 插件仍保持 enabled
  - 再次访问插件页时可重新 mount

## Assumptions

- 本期主题只支持 `light` 和 `dark`，不加入 `system`。
- 本期语言只支持 `zh` 和 `en`。
- 字体选择默认值为 `system-default`，基础字号默认值为 `16`。
- 活跃 tab 这类纯页面 UI 状态不写入统一配置 JSON。
- 插件配置先使用宿主管理的通用 JSON 容器，不定义插件设置 schema 协议。
- 自动 unload 只处理 UI 运行时页面，不处理 worker/background 任务。
