# 知识库验证计划

> 版本：0.1
> 日期：2026-05-27
> 文档状态：草案

## 1. V0.1 验证

- 底部栏出现知识库入口。
- 点击进入 `/knowledge`。
- 页面三栏布局稳定。
- 路由切换不报错。
- renderer 构建通过。

推荐命令：

```powershell
pnpm --dir desktop run build:renderer
```

## 2. V0.2 验证

### 2.1 Rust 单元测试

覆盖：

- 自动创建默认知识库、默认空间和快速收集箱。
- 创建库。
- 创建空间。
- 创建文件夹。
- 创建 Markdown 页面。
- 获取页面详情。
- 更新页面内容。
- 移动节点。
- 归档节点。
- 收藏节点。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

### 2.2 Native build

验证 NAPI 绑定可以生成：

```powershell
pnpm run native:build:debug
```

### 2.3 Desktop build

验证 preload、IPC、contract 和 renderer 类型能通过：

```powershell
pnpm --dir desktop run build:app
```

## 3. 手动验证

V0.2 暂无复杂 UI，可通过开发控制台或后续 store 调用验证：

- `window.knowledgeApi.listLibraries()`
- `window.knowledgeApi.listSpaces()`
- `window.knowledgeApi.listTree()`
- `window.knowledgeApi.createPage({ title: '测试页面' })`
- `window.knowledgeApi.getPage(page.id)`

## 4. V0.3 验证

覆盖：

- 进入知识库后自动加载默认库、空间和资料树。
- 左侧快捷入口显示快速收集箱、最近编辑和收藏。
- 新建空间、新建文件夹、新建 Markdown 页面后立即刷新树。
- 右键节点可以重命名、移到空间根目录、收藏、归档、删除。
- 页面标题编辑后刷新最近编辑顺序。
- 空页面、加载中、错误状态能正常显示。

推荐命令：

```powershell
pnpm --dir desktop run lint
pnpm --dir desktop run build:renderer
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

手动回归：

- 在默认空间根级创建文件夹和页面。
- 在文件夹内通过右键创建子页面。
- 将子页面移动回空间根目录。
- 收藏后检查“收藏”列表出现该节点。
- 归档或删除后检查左侧树隐藏该节点。
- 切换 Todo、FTP、Terminal 页面后再返回知识库，确认 keepAlive 页面不受影响。

## 5. V0.4 验证

覆盖：

- Markdown 页面打开后进入 CodeMirror 编辑器。
- Markdown 原文编辑后可以自动保存，也可以点击保存或按 `Ctrl+S` 保存。
- 未保存状态和保存状态显示正确。
- `Ctrl+B`、`Ctrl+I`、`Ctrl+K` 可以在选区插入 Markdown 标记。
- 分屏预览能渲染标题、列表、任务列表、引用、代码块、表格、图片和链接。
- 预览会移除不可信脚本、事件属性和危险 URL。
- 页面内搜索可以显示匹配数量并跳转上下匹配。
- 右侧预览区生成页面标题目录。
- 字数、行数统计随内容更新。
- 粘贴图片会写入 `knowledge_assets` 并插入 Markdown 图片引用。
- 拖拽文件会写入 `knowledge_assets` 并插入 Markdown 附件链接。
- 切换页面前会先保存未保存的 Markdown 内容。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
pnpm run native:build:debug
pnpm --dir desktop run lint
pnpm --dir desktop run build:renderer
pnpm --dir desktop run build:app
```

手动回归：

- 创建两个 Markdown 页面，在页面 A 输入长文本，立刻切到页面 B，再切回页面 A 检查内容未丢失。
- 粘贴一张图片，确认编辑器插入 `![](...)`，预览可见图片。
- 拖拽 PDF 或文本文件，确认编辑器插入附件链接。
- 在预览中输入 `<script>alert(1)</script>` 和 `<img onerror=...>`，确认脚本不会执行。

## 6. 回归关注

- 旧数据库 migration 不能破坏已有 Todo、FTP、Terminal 数据。
- 新增 preload API 不能影响已有 API。
- 底部栏已有 tab 顺序和用户配置不能被强制重排。
- V0.4 不应引入新的运行时依赖。

## 7. 已知验证缺口

- V0.4 不验证文档导入。
- V0.4 不提供 Typora 级所见即所得体验。
- V0.4 不验证 AI。
- V0.5 不验证文档导入。
- V0.5 不验证复杂 Todo 详情反链导航，仅验证 Todo 备注保留来源信息和 `knowledge_links` 关系写入。
- V0.5 不验证多设备同步或跨设备便签。
- V0.6 不验证高保真 Office/PDF 预览、OCR、缩略图或摘录，这些属于 V0.7。
- V0.7 不验证 LibreOffice/PDF.js/OCR/缩略图缓存重建；当前只验证无新依赖预览、附件 Inspector 和摘录页面闭环。
- V0.8 不验证 Tiptap/ProseMirror、嵌套块、协同编辑或块级反链；当前只验证无新依赖 block editor MVP。

## 8. V0.5 验证

覆盖：

- 设置页快捷键中出现“知识库速记”和“剪贴板转速记”。
- `shortcuts.system.toggleQuickNote` 默认 `CommandOrControl+Alt+N`，用于显示/隐藏速记窗口。
- `shortcuts.system.captureClipboardToQuickNote` 默认 `CommandOrControl+Alt+Shift+N`，用于把剪贴板内容带入速记窗口。
- 快捷键或知识库工具栏可打开速记窗口。
- 速记窗口支持正文、标题、标签、颜色、置顶、保存。
- 剪贴板捕获会把当前文本填入速记窗口。
- 保存后，知识库快速收集箱可看到对应速记。
- 知识库内可搜索速记标题、正文和标签。
- 速记可转 Markdown 页面，页面保留来源提示和标签。
- 速记可转 Todo，Todo 备注保留来源标题和来源 ID。
- 速记归档后默认列表隐藏，但已转换页面或 Todo 不会被删除。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
pnpm --dir desktop run lint
pnpm --dir desktop run build:renderer
pnpm --dir desktop run build:app
```

## 9. V0.6 验证

覆盖：

- 知识库工具栏出现“导入”按钮，点击后打开系统文件选择器。
- 导入 Markdown、文本、PDF、DOCX、PPTX、XLSX、图片时会复制到 `userData/knowledge-assets`。
- 同一 library 下重复导入相同 hash 的文件会复用 asset 和 document 节点，并返回 duplicate 标记。
- 每次导入会创建 `knowledge_index_jobs` 记录。
- Markdown/文本正文可被全文搜索命中。
- DOCX/PPTX/XLSX 的 OpenXML 文本可被搜索命中。
- PDF 若能抽取到文本则可被搜索命中；抽取失败时 asset 状态为 `failed`，索引任务保留错误信息。
- 搜索支持全库/当前空间范围切换，并支持全部、页面、文档、速记、附件类型过滤。
- 点击搜索结果可跳转到 Markdown 页面、导入文档详情或打开资产。
- 导入文档详情页显示原文件名、扩展名、大小、hash、索引状态和已抽取文本。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
cargo check --manifest-path multi_platform_core/Cargo.toml --features napi
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

手动回归：

- 导入包含中文和英文关键词的 Markdown 文件，搜索中文连续短语和英文单词。
- 导入同一个文件两次，确认树中不会重复出现同一个导入文档。
- 导入一张图片，确认可入库但正文为空，搜索文件名可命中标题。
- 切换类型过滤，确认文档结果不会混入速记或页面结果。
- 切换“全库 / 当前空间”，确认当前空间只返回该空间内的页面和文档。

## 10. V0.7 验证

覆盖：

- 导入 PDF 后，文档详情页可在页面内显示 PDF 预览；CSP 不再阻止 `app://knowledge-assets` 的 frame/object 访问。
- 导入图片后，文档详情页可显示原图预览。
- 导入 DOCX 后，文档详情页显示抽取文本和 section 预览。
- 导入 PPTX 后，文档详情页按 slide 展示抽取文本。
- 导入 XLSX 后，文档详情页按 sheet 展示表格预览。
- 文档详情页显示打开原文件、在系统中显示、摘录为页面。
- 右侧附件 Inspector 显示文件名、大小、hash、导入时间、索引状态和预览类型。
- 在文档预览或已抽取文本中选择文字后，点击“摘录为页面”会创建 Markdown 页面，并保留来源 asset/document metadata。
- 摘录 Markdown 页面标题区显示来源文档提示，并且“回到来源”可跳回原导入文档。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
cargo check --manifest-path multi_platform_core/Cargo.toml --features napi
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

手动回归：

- 分别导入 PDF、图片、DOCX、PPTX、XLSX，确认预览区域不会出现空白或 CSP 报错。
- 在 PPTX slide 文本和 XLSX 单元格文本中选择中文内容，创建摘录页面并确认页面正文、标题、来源信息和可获得的 slide/sheet/cell 上下文正确。
- 从摘录页面点击“回到来源”，确认能回到对应导入文档详情页。

## 11. V0.8 验证

覆盖：

- 知识库顶栏和文件夹视图可新建块页面。
- 块页面保存为 `pageType = block`，`contentJson` 为 `guyantools.block-page` v1。
- paragraph、heading、bullet list、ordered list、task list、code、quote、callout 块可编辑并保存恢复。
- 块可新增、删除、上移、下移，刷新后顺序保持。
- 图片块和附件块可选择文件、入库、打开，并可在系统文件管理器中定位。
- 任务块点击“转 Todo”后创建 Todo，并把 `todoId` 写回块 JSON。
- Markdown 导入可生成块结构并写入 `importedFromMarkdown` 有损导入标记；导出 Markdown 可得到当前快照。
- 搜索可命中块正文，因为保存时同步 `contentText`。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
cargo check --manifest-path multi_platform_core/Cargo.toml --features napi
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

手动回归：

- 新建块页面，分别插入文本、任务、代码、提示、图片和附件块，保存后切换页面再回来确认恢复。
- 调整多个块顺序后保存，确认刷新后顺序不变。
- 对任务块执行“转 Todo”，确认 Todo 中包含来源页面 ID 和块 ID。
- 输入独特中文短语后保存，使用知识库搜索确认可命中。
- 点击“在系统中显示”，确认打开系统文件管理器并定位到已入库 asset。

## 12. V0.9 验证

覆盖：

- 页面保存时解析 `[[页面名]]` 并写入 `knowledge_links`。
- 页面 B 的反链面板能显示引用它的页面 A。
- 未创建页面链接以 `missing_page` 形式显示，并可从 Inspector 创建目标页面。
- 标签可创建、显示颜色、绑定当前页面/文档/速记/附件，并通过标签过滤列出目标。
- 块任务转 Todo 后写入 `page -> todo` 和 `todo -> page` 关系。
- Todo 详情页能显示知识库来源，并可跳回来源页面或速记。
- 关系图 API 在 200 节点以内返回页面、附件、Todo 节点和边。
- 孤立页面视图能列出无标签、无入链、无出链的普通页面。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
cargo check --manifest-path multi_platform_core/Cargo.toml --features napi
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

手动回归：

- 新建“页面 B”，再在“页面 A”输入 `[[页面 B]]` 和 `[[缺失页]]`，保存后检查出链和反链。
- 在反链面板点击“创建页面”，确认缺失页被创建。
- 给页面 A 绑定标签，点击标签过滤，确认结果包含页面 A，关系图随标签过滤更新。
- 给导入文档源附件或块页附件绑定标签，确认标签过滤结果包含附件，关系图包含附件节点。
- 在块页面中把任务块转 Todo，切到 Todo 详情确认出现知识库来源卡片，点击后返回知识库页面。
- 创建一个没有标签和链接的页面，确认孤立页列表可见；给它绑定标签或添加链接后确认不再出现在列表中。

## 13. V1.0 验证

覆盖：

- 设置页出现“知识库”页签，可配置默认知识库、附件目录策略、LibreOffice 路径、全文索引开关、单文件导入上限和预览缓存保留天数；设置页“快捷键”区域可配置知识库速记和剪贴板转速记。
- 新导入文件遵守单文件导入上限，超限文件进入跳过列表并显示原因。
- 关闭全文索引后导入文件仍会入库，但索引任务状态为 `cancelled`。
- 失败或取消的索引任务可在知识库 Inspector 的最近索引任务中点击“重试”。
- 待处理或运行中的索引任务可点击“取消”，core 状态更新为 `cancelled`；已进入同步抽取的任务不要求被强制中断。
- Markdown 页面和块页面在切换页面、窗口关闭和页面隐藏时不会静默丢失脏草稿。
- 预览缓存清理只清理受控缓存目录，不删除原始附件；保留天数用于启动和缓存相关配置变化时的过期缓存清理。
- 旧数据库迁移后默认库、默认空间和快速收集箱仍自动存在。

推荐命令：

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml
cargo check --manifest-path multi_platform_core/Cargo.toml --features napi
pnpm run native:build:debug
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
```

手动回归：

- 在设置页切到“知识库”，调整单文件导入上限为较小值，导入一个超过阈值的文件，确认不会复制入库且有跳过提示。
- 关闭全文索引后导入一个 Markdown 文件，确认文档节点创建成功，最近索引任务显示 `cancelled`，重新开启索引后点击重试。
- 新建 Markdown 页面输入内容但不手动保存，切换到其他页面再回来确认内容已保存。
- 新建块页输入多个块，不手动保存后切换页面，确认块顺序和正文恢复。
- 点击“清理预览缓存”，确认提示释放文件数量，原始附件仍可打开。

## 14. V1.1 验证

覆盖：

- Markdown 编辑器可在源码、分屏即时预览和预览模式之间切换，正文内容不丢失。
- Focus Mode 开启后，非活动行弱化，关闭后恢复正常。
- Typewriter Mode 开启后，长文编辑时当前光标行保持在编辑区中上部。
- Frontmatter 面板可识别 `--- ... ---`，可应用和移除属性块；预览正文不显示 frontmatter。
- 表格助手可按行/列插入 GFM 表格，预览区正常渲染表格。
- Callout 语法 `> [!NOTE]` 在预览区显示为主题化提示块。
- `$$ ... $$` 和 `$...$` 在预览区以安全公式样式展示。
- Mermaid 代码块在预览区以受控容器展示源码，不执行外部脚本。
- Markdown/HTML 导出会下载文件；打印/PDF 会打开系统打印流程。
- 图片粘贴、附件拖拽、双链引用和页面内搜索保持 V0.4/V0.9 行为。

推荐命令：

```powershell
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

手动回归：

- 新建 Markdown 页面，输入包含 frontmatter、标题、表格、callout、数学块、Mermaid 代码块、图片和 `[[页面名]]` 的内容。
- 依次切换源码、分屏、预览、Focus Mode、Typewriter Mode 和编辑主题，确认编辑内容不被重置。
- 导出 Markdown 和 HTML，确认文件内容包含当前页面正文；打印/PDF 流程能看到当前预览内容。

## 15. V1.2 验证

覆盖：

- 顶栏、空状态、文件夹视图和资料树右键菜单可新建画布页面。
- 画布页面保存为 `pageType = canvas`，`contentJson` 为 `guyantools.canvas-page` v1。
- 画布编辑器支持文本框、图片、矩形、箭头和自由线条。
- 粘贴截图或选择图片后会写入知识库 asset，并回填到图片元素。
- 元素可拖动、删除、置顶、置底，可编辑位置、尺寸、标题、页面引用和 Todo ID。
- 填写页面引用或 Todo ID 后，可从画布元素属性面板跳转到目标页面或 Todo。
- 画布保存时同步 `contentText` 和 `contentMarkdown`，搜索可命中文本框、标注、附件名、页面引用和 Todo ID。
- 画布可导出 SVG/PNG；PNG 失败时保留 SVG 兜底。
- core 新建 canvas 页面时使用 canvas 图标，并允许 canvas `content_json` 搜索回归通过。

推荐命令：

```powershell
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

手动回归：

- 新建画布页面，插入文本框、矩形、箭头和自由线条，保存后切换页面再回来确认恢复。
- 从剪贴板粘贴截图，确认画布出现图片元素，右侧附件 Inspector 可选中该 asset。
- 在画布元素中填写独特中文短语、页面引用和 Todo ID，保存后用知识库搜索确认命中，并确认“打开页面 / 打开 Todo”能跳转。
- 导出 SVG 和 PNG，确认下载文件包含当前画布内容；若 PNG 遇到内嵌图片限制，确认 SVG 可用。
