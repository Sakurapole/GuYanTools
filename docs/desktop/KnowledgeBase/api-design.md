# 知识库 API 设计

> 版本：0.1
> 日期：2026-05-27
> 文档状态：草案

## 1. IPC 命名

所有桌面端 IPC 通道使用 `knowledge:*` 前缀。

## 2. Renderer API

`window.knowledgeApi` 在 V0.2-V0.6 提供以下方法：

```ts
interface KnowledgeApi {
  listLibraries(): Promise<KnowledgeLibrary[]>;
  createLibrary(input: CreateKnowledgeLibraryPayload): Promise<KnowledgeLibrary>;
  listSpaces(libraryId?: string): Promise<KnowledgeSpace[]>;
  createSpace(input: CreateKnowledgeSpacePayload): Promise<KnowledgeSpace>;
  listTree(input?: ListKnowledgeTreePayload): Promise<KnowledgeNode[]>;
  createFolder(input: CreateKnowledgeFolderPayload): Promise<KnowledgeNode>;
  createPage(input: CreateKnowledgePagePayload): Promise<KnowledgePageDetail>;
  getPage(pageId: string): Promise<KnowledgePageDetail>;
  updatePage(pageId: string, input: UpdateKnowledgePagePayload): Promise<KnowledgePageDetail>;
  listQuickNotes(input?: ListKnowledgeQuickNotesPayload): Promise<KnowledgeQuickNoteDetail[]>;
  createQuickNote(input: CreateKnowledgeQuickNotePayload): Promise<KnowledgeQuickNoteDetail>;
  updateQuickNote(noteId: string, input: UpdateKnowledgeQuickNotePayload): Promise<KnowledgeQuickNoteDetail>;
  archiveQuickNote(noteId: string): Promise<KnowledgeQuickNoteDetail>;
  convertQuickNoteToPage(noteId: string, input?: ConvertKnowledgeQuickNoteToPagePayload): Promise<KnowledgePageDetail>;
  linkQuickNoteTodo(noteId: string, todoId: string): Promise<KnowledgeQuickNoteDetail>;
  saveAsset(input: SaveKnowledgeAssetPayload): Promise<KnowledgeAsset>;
  getAsset(assetId: string): Promise<KnowledgeAsset>;
  openAsset(assetId: string): Promise<void>;
  showAssetInFolder(assetId: string): Promise<void>;
  importFiles(input?: ImportKnowledgeFilesPayload): Promise<ImportKnowledgeFilesResult>;
  listIndexJobs(input?: ListKnowledgeIndexJobsPayload): Promise<KnowledgeIndexJob[]>;
  search(input: KnowledgeSearchPayload): Promise<KnowledgeSearchResult[]>;
  listTags(input?: ListKnowledgeTagsPayload): Promise<KnowledgeTag[]>;
  createTag(input: CreateKnowledgeTagPayload): Promise<KnowledgeTag>;
  updateTag(tagId: string, input: UpdateKnowledgeTagPayload): Promise<KnowledgeTag>;
  bindTag(input: BindKnowledgeTagPayload): Promise<KnowledgeTag>;
  unbindTag(input: UnbindKnowledgeTagPayload): Promise<void>;
  listTagTargets(input: ListKnowledgeTagTargetsPayload): Promise<KnowledgeTaggedTarget[]>;
  listPageLinks(pageId: string): Promise<KnowledgeLink[]>;
  listBacklinks(pageId: string): Promise<KnowledgeBacklink[]>;
  linkTodoSource(input: LinkKnowledgeTodoPayload): Promise<void>;
  getGraph(input: KnowledgeGraphPayload): Promise<KnowledgeGraph>;
  listOrphanPages(input?: ListKnowledgeOrphanPagesPayload): Promise<KnowledgeNode[]>;
  moveNode(nodeId: string, input: MoveKnowledgeNodePayload): Promise<KnowledgeNode>;
  updateNode(nodeId: string, input: UpdateKnowledgeNodePayload): Promise<KnowledgeNode>;
  archiveNode(nodeId: string): Promise<KnowledgeNode>;
  toggleFavorite(nodeId: string, favorite: boolean): Promise<KnowledgeNode>;
  deleteNode(nodeId: string): Promise<void>;
}
```

## 3. IPC 通道

| 方法 | IPC | 参数 |
| --- | --- | --- |
| `listLibraries` | `knowledge:list-libraries` | 无 |
| `createLibrary` | `knowledge:create-library` | `CreateKnowledgeLibraryPayload` |
| `listSpaces` | `knowledge:list-spaces` | `libraryId?` |
| `createSpace` | `knowledge:create-space` | `CreateKnowledgeSpacePayload` |
| `listTree` | `knowledge:list-tree` | `ListKnowledgeTreePayload?` |
| `createFolder` | `knowledge:create-folder` | `CreateKnowledgeFolderPayload` |
| `createPage` | `knowledge:create-page` | `CreateKnowledgePagePayload` |
| `getPage` | `knowledge:get-page` | `pageId` |
| `updatePage` | `knowledge:update-page` | `pageId`, `UpdateKnowledgePagePayload` |
| `listQuickNotes` | `knowledge:list-quick-notes` | `ListKnowledgeQuickNotesPayload?` |
| `createQuickNote` | `knowledge:create-quick-note` | `CreateKnowledgeQuickNotePayload` |
| `updateQuickNote` | `knowledge:update-quick-note` | `noteId`, `UpdateKnowledgeQuickNotePayload` |
| `archiveQuickNote` | `knowledge:archive-quick-note` | `noteId` |
| `convertQuickNoteToPage` | `knowledge:convert-quick-note-to-page` | `noteId`, `ConvertKnowledgeQuickNoteToPagePayload?` |
| `linkQuickNoteTodo` | `knowledge:link-quick-note-todo` | `noteId`, `todoId` |
| `saveAsset` | `knowledge:save-asset` | `SaveKnowledgeAssetPayload` |
| `getAsset` | `knowledge:get-asset` | `assetId` |
| `openAsset` | `knowledge:open-asset` | `assetId` |
| `showAssetInFolder` | `knowledge:show-asset-in-folder` | `assetId` |
| `importFiles` | `knowledge:import-files` | `ImportKnowledgeFilesPayload?` |
| `listIndexJobs` | `knowledge:list-index-jobs` | `ListKnowledgeIndexJobsPayload?` |
| `search` | `knowledge:search` | `KnowledgeSearchPayload` |
| `listTags` | `knowledge:list-tags` | `ListKnowledgeTagsPayload?` |
| `createTag` | `knowledge:create-tag` | `CreateKnowledgeTagPayload` |
| `updateTag` | `knowledge:update-tag` | `tagId`, `UpdateKnowledgeTagPayload` |
| `bindTag` | `knowledge:bind-tag` | `BindKnowledgeTagPayload` |
| `unbindTag` | `knowledge:unbind-tag` | `UnbindKnowledgeTagPayload` |
| `listTagTargets` | `knowledge:list-tag-targets` | `ListKnowledgeTagTargetsPayload` |
| `listPageLinks` | `knowledge:list-page-links` | `pageId` |
| `listBacklinks` | `knowledge:list-backlinks` | `pageId` |
| `linkTodoSource` | `knowledge:link-todo-source` | `LinkKnowledgeTodoPayload` |
| `getGraph` | `knowledge:get-graph` | `KnowledgeGraphPayload` |
| `listOrphanPages` | `knowledge:list-orphan-pages` | `ListKnowledgeOrphanPagesPayload?` |
| `moveNode` | `knowledge:move-node` | `nodeId`, `MoveKnowledgeNodePayload` |
| `updateNode` | `knowledge:update-node` | `nodeId`, `UpdateKnowledgeNodePayload` |
| `archiveNode` | `knowledge:archive-node` | `nodeId` |
| `toggleFavorite` | `knowledge:toggle-favorite` | `nodeId`, `favorite` |
| `deleteNode` | `knowledge:delete-node` | `nodeId` |

## 4. NAPI 方法

`JsDatabase` 暴露与 IPC 对应的方法：

- `listKnowledgeLibraries`
- `createKnowledgeLibrary`
- `listKnowledgeSpaces`
- `createKnowledgeSpace`
- `listKnowledgeTree`
- `createKnowledgeFolder`
- `createKnowledgePage`
- `getKnowledgePage`
- `updateKnowledgePage`
- `listKnowledgeQuickNotes`
- `createKnowledgeQuickNote`
- `updateKnowledgeQuickNote`
- `archiveKnowledgeQuickNote`
- `convertKnowledgeQuickNoteToPage`
- `linkKnowledgeQuickNoteTodo`
- `createKnowledgeAsset`
- `getKnowledgeAsset`
- `importKnowledgeDocument`
- `listKnowledgeIndexJobs`
- `searchKnowledge`
- `listKnowledgeTags`
- `createKnowledgeTag`
- `updateKnowledgeTag`
- `bindKnowledgeTag`
- `unbindKnowledgeTag`
- `listKnowledgeTagTargets`
- `listKnowledgePageLinks`
- `listKnowledgeBacklinks`
- `linkKnowledgeTodoSource`
- `getKnowledgeGraph`
- `listKnowledgeOrphanPages`
- `moveKnowledgeNode`
- `updateKnowledgeNode`
- `archiveKnowledgeNode`
- `toggleKnowledgeFavorite`
- `deleteKnowledgeNode`

## 5. 约定

- ID 由 Rust core 生成，renderer 不负责生成 UUID。
- `libraryId` 为空时使用默认知识库。
- `spaceId` 为空时使用默认空间。
- 有 `parentId` 时，`libraryId` 和 `spaceId` 以父节点为准。
- `contentText` 不传时，Markdown 页面默认使用 `contentMarkdown` 作为索引文本。
- `archiveNode` 是归档，不物理删除。
- `deleteNode` 在 V0.3 采用软删除：写入 `deleted_at` 并从默认树查询中隐藏，避免误删后无法恢复。
- `saveAsset` 在 main process 中写入用户数据目录，并通过 core 写入 `knowledge_assets` 元数据。
- Markdown 图片粘贴和附件拖拽使用 `app://knowledge-assets/id/<assetId>/<filename>` 引用已入库资产；历史 `file://.../knowledge-assets/...` 在预览层兼容转换。
- V0.5 速记窗口通过 `window.quickNoteWindowApi` 暴露 `show`、`close`、`dock`、`setAlwaysOnTop` 和 `onPrefill`。
- V0.5 系统快捷键配置新增 `shortcuts.system.toggleQuickNote` 和 `shortcuts.system.captureClipboardToQuickNote`。
- V0.6 文件导入由 main process 选择和读取本地文件，renderer 只调用 `importFiles`，不直接访问本地路径。
- V0.6 搜索统一走 `knowledge:search`，支持 `page`、`document`、`quick_note`、`asset` 类型过滤；UI 可切换全库或当前空间；底层使用 `knowledge_search_fts` 并保留 `LIKE` 兼容中文连续文本查询。
- V0.6 Office/PDF 文本抽取为无新依赖 MVP：Markdown/文本直读，DOCX/PPTX/XLSX 通过 OpenXML ZIP XML 轻量抽取，PDF 通过 best-effort 文本操作符抽取；复杂版式和 OCR 进入 V0.7+。
- V0.7 `showAssetInFolder` 只允许 main process 根据 `assetId` 查询入库路径后调用系统定位，renderer 不接收任意本地路径能力。
- V0.7 摘录页面复用 `createPage`，页面类型为 `markdown`，`propertiesJson.sourceType = "document_excerpt"`，并保留 `sourceAssetId`、`sourceDocumentId`、来源标题、来源文件名、预览类型、可获得的 slide/sheet/cell 上下文和摘录时间；知识库页面根据 `sourceDocumentId` 提供“回到来源”。
- V0.8 块页面复用 `createPage` / `updatePage`，页面类型为 `block`；renderer 保存 `contentJson` 作为 `guyantools.block-page` v1，保存时同步 `contentText` 和 `contentMarkdown`。
- V0.8 块页面附件和图片复用 `saveAsset`，块 JSON 仅保存 `assetId`、名称、MIME 和受控 `app://knowledge-assets/id/...` 引用；打开和系统定位复用 `openAsset` / `showAssetInFolder`。
- V0.8 任务块转 Todo 使用现有 `todoApi.createTodo`，并把 `todoId` 回填到块 JSON；知识库关系表深度联动进入 V0.9。
- V0.9 标签 API 以 `knowledge_tags` / `knowledge_tag_bindings` 为事实源，支持页面、附件、速记和 Todo 目标类型。
- V0.9 页面保存会自动解析 `[[页面名]]`，写入 `knowledge_links`；未命中页面使用 `target_type = missing_page` 和 `target_url` 保留待创建页面名。
- V0.9 Todo 来源关系通过 `linkTodoSource` 写入 `page -> todo` 与 `todo -> page` 双向 link；Todo 详情侧根据备注中的来源 ID 做跳转入口。
- V0.9 关系图 API 返回 200 个节点以内的页面、附件、Todo 节点和关系边；复杂可视化布局留给后续版本。
- V1.0 新增 `retryIndexJob`、`cancelIndexJob`、`clearPreviewCache`：
  - `retryIndexJob(jobId)` 仅对附件抽取任务重跑，从 asset 的 `originalPath` 或 `storagePath` 读取源文件。
  - `cancelIndexJob(jobId)` 将非完成任务标记为 `cancelled`，用于 UI 层停止等待和后续重试；当前不强杀已经开始的同步抽取过程。
  - `clearPreviewCache()` 只清理受控预览缓存目录，不删除 `knowledge_assets` 中的原始附件。
- V1.0 导入行为读取 `AppConfig.features.knowledge`：
  - `defaultLibraryId` 作为未指定库时的默认目标。
  - `assetStorageMode/customAssetDirectory` 控制新资产落盘位置。
  - `indexingEnabled = false` 时跳过文本抽取，索引任务写入 `cancelled`。
  - `maxImportFileSizeMb` 在复制和抽取前做大文件保护。
  - `previewCacheTtlDays` 在 main process 启动和缓存相关配置变化时用于清理过期预览缓存，`0` 表示只保留手动清理。
- V1.1 Markdown 写作增强不新增 IPC 或 core API；Frontmatter、Focus/Typewriter、表格助手、Callout/数学/Mermaid 安全预览和导出入口均在 renderer 编辑器层完成。
- V1.2 画布页面不新增 IPC 或 core API；`createPage` / `updatePage` 使用 `pageType = canvas`、`contentJson = guyantools.canvas-page` v1，并同步 `contentText` / `contentMarkdown`。
- V1.2 画布截图和图片复用 `saveAsset`，画布元素只保存 asset id、名称、MIME 和受控 `app://knowledge-assets/id/...` URL。
- V1.2 画布元素的页面引用和 Todo ID 暂作为元素 metadata 和搜索文本保存，renderer 可按页面标题/ID 或 Todo ID 跳转，不自动写入 `knowledge_links`；关系图同步需后续版本补齐。
- V1.3 知识库内部问答不新增知识库专属 Provider、模型或聊天 IPC；renderer 复用 `window.aiApi` 的会话、发送、停止、引用和 embedding 重建能力。
- V1.3 知识库问答调用 AI 时必须传入知识库 grounding 选项：`knowledgeSearchMode = force | auto`、`libraryId?`、`spaceId?`，当前页面/选区范围通过提示词上下文和引用 metadata 表达。
- V1.3 知识库模块仍只通过既有 `knowledge:search`、AI chunk、embedding 和来源 metadata 提供检索上下文；模型调用由 AI main service 负责。
- V1.3 “在 AI 页面继续”只传递会话 ID 或可恢复上下文，不把 API Key、Provider secret、本地文件路径暴露给 renderer。
