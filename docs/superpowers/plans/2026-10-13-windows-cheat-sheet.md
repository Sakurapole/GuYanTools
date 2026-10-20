# Windows 小抄实现计划

**Goal:** 实现受 Windows 内容保护的独立 Markdown 题库窗口和完整键盘操作。

**Architecture:** 主进程持有本地题库、窗口和统一快捷键注册；typed contract 与 preload 提供受限 IPC；独立 Vue 视图管理搜索、编辑、确认与阅读。

**Tech Stack:** Electron 37、Vue 3、TypeScript、现有 marked/KaTeX、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-13-windows-cheat-sheet-design.md`（用户已确认）。

## 约束

- Windows build >= 19041；保护设置在 show 前应用，失败不显示。
- 不添加依赖，不改 Rust 核心表；20%～100% 透明度，默认 90%。
- 5,000 题、单题 1 MiB、整库 32 MiB；原子串行写入，失败保留原库和草稿。
- 保留工作区已有修改，仅修改必要接入点；沿用现有主题与组件。
- 全部会议/录屏/浏览器目标逐项标记实测状态，API 状态不能替代兼容性实测。

## Task 1：契约与题库

文件：新增 `contracts/cheat_sheet.ts`、`main/cheat-sheet/bank.ts`、`bank.test.ts`。

- [x] 先写真实临时目录测试：规范化标题搜索、忽略代码块标题的导入、重名独立 ID、重启读回、并发写入、非法内容与损坏文件不覆盖。
- [x] 运行 `pnpm --dir desktop exec vitest run --config vite.main.config.ts src/main/cheat-sheet/bank.test.ts` 确认失败。
- [x] 实现 `CheatSheetBank(filePath)`，提供 `load()`、`saveQuestion(input)`、`deleteQuestion(id)`、`importMarkdown(files)`、`updateSettings(patch)` 与 `flush()`；搜索使用 `searchQuestions(questions, query)`，文件标题用 `titleFromMarkdown(markdown, filename)`。
- [x] 重跑测试确认通过。

## Task 2：受保护窗口、IPC 与统一快捷键

文件：新增 `main/cheat-sheet/window.ts`、`ipc.ts` 及测试；修改 `main/shortcuts/service.ts`、`main/index.ts`、`preload.ts`。

- [ ] 先写窗口顺序与调用方测试：`protect -> load -> show`、系统不支持/保护失败隐藏、并发唤起、关闭重建、非法 IPC、快捷键隐藏释放。
- [ ] 运行相关 Vitest，确认新行为未实现。
- [ ] 实现 `CheatSheetWindow` 生命周期与 `execute(command)`；新增统一 `syncFeatureShortcuts(owner, bindings)`、`clearFeatureShortcuts(owner)`，保留插件和应用快捷键占用检查。
- [ ] 唤起/搜索快捷键接入 `AppSystemShortcutsConfig` 和统一设置；阅读快捷键采用功能组，窗口可见时注册，隐藏/销毁时注销；退出等待 `bank.flush()`。
- [ ] 重跑新测试与已有 `plugin_shortcuts.test.ts`。

## Task 3：独立 Vue 工作流与入口

文件：新增 `windows/cheat-sheet/App.vue`、`main.ts`、样式与视图辅助测试、`cheat_sheet.html`；修改 Vite 入口与 Settings 必要入口。

- [ ] 编写键盘/IME、受限 Markdown、草稿保护的行为测试并运行确认失败。
- [ ] 实现搜索结果分页、阅读、题目 CRUD、导入导出、帮助/快捷键设置和内部确认视图；按钮采用现有 UiButton，所有控件可 Tab 到达。
- [ ] 从现有应用设置读取主题和代码字体，订阅变化并在销毁时释放；Markdown 移除图片加载与主动内容。
- [ ] 在设置页提供 Windows 小抄打开按钮和唤起热键配置；独立 HTML 加入 Vite 构建入口。
- [ ] 重跑行为测试。

## Task 4：验证与交付

- [ ] 受影响文件 eslint、相关主进程/renderer Vitest、`pnpm --dir desktop run build:app`、`git diff --check`。
- [ ] 用本地 Electron/CDP 检查独立窗口、题目 CRUD、快捷键、透明度、保护状态和关闭重建；测试数据使用独立临时目录。
- [ ] 能运行的截图/浏览器捕获测试保存证据；会议接收端或软件不可用的目标明确标为未验证。
- [ ] 增加正式使用说明和验证记录，检查最终 diff 未覆盖现有工作。

执行方式：当前会话顺序实施；已获得用户执行授权，无需再次审批常规实现步骤。每项先失败测试，再实现，再验证。
