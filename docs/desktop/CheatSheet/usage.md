# Windows 小抄

Windows 小抄在 Windows 10 2004（build 19041）及更新版本提供独立题库窗口。窗口启用 Windows 内容保护，窗口内容透明度范围为 20%～100%，背景、文字、输入框和按钮整体同步变化，默认保持置顶。设置页的“快捷键”部分可以打开小抄，默认 `Ctrl+Alt+Q` 显示或隐藏。

题目数据保存在应用用户数据目录的 `cheat_sheet_bank.json`。每道题对应一道 Markdown 文档；可在窗口中新增、编辑、删除、按标题搜索和导入导出 `.md` 文件。导入标题取文档第一个非围栏代码块中的一级标题，没有一级标题时使用文件名。同名题目不会覆盖。

全局阅读快捷键仅在窗口可见时注册。默认使用 `Ctrl+Alt+Left/Right` 在题目列表中切换题目，`Ctrl+Alt+Up/Down` 滚动正文，`Ctrl+Alt+PageUp/PageDown` 翻页，`Ctrl+Alt+-/=` 调整内容透明度，`Ctrl+Alt+Shift+Up/Down/Left/Right` 移动窗口，`Ctrl+Alt+Shift+-/=` 缩小或放大窗口，`Ctrl+Alt+T` 切换置顶，`Ctrl+Alt+0` 恢复窗口。窗口内部支持 `Ctrl+F` 搜索、`Ctrl+N` 新建、`Ctrl+E` 编辑、`Ctrl+S` 保存、`Ctrl+O` 导入和 `Esc` 返回或隐藏。

系统内容保护使用 Electron 在 Windows 上调用的窗口显示亲和设置。不同会议软件、浏览器共享、OBS 捕获后端及 Windows 版本可能采用不同捕获路径。本手册不将 API 成功状态当成应用兼容性结论；只有逐项检查共享接收端画面后才能记录通过。腾讯会议、飞书、Teams、Zoom、OBS、Windows 截图、Chrome 和 Edge 的目标矩阵当前均为未验证。
