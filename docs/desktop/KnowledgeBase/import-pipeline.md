# 知识库导入管线设计

> 版本：0.1
> 日期：2026-05-27
> 文档状态：草案

## 1. 目标

导入管线负责把本地文件变成知识库可管理、可预览、可搜索、可引用的资料。V0.2 只预留数据结构，V0.6 开始实现。

## 2. 管线阶段

```text
选择文件
  -> 计算 hash
  -> 复制到 assets
  -> 创建 asset 记录
  -> 创建 document node
  -> 抽取文本
  -> 创建 index job
  -> 写入索引
```

## 3. 文件存储

当前目录：

```text
userData/knowledge-assets/<library-id>/<hash-prefix>/<hash>.<ext>
```

SQLite 当前保存 asset 绝对路径；renderer 不直接读取路径，只通过 `app://knowledge-assets/id/<assetId>/...` 访问。V0.7 先使用原 asset 和抽取 metadata 作为预览来源，独立预览缓存和缩略图目录进入后续增强。

## 4. 格式策略

| 格式 | 抽取 | 预览 | 编辑 |
| --- | --- | --- | --- |
| Markdown | 直接解析 | 编辑器预览 | 可编辑 |
| PDF | best-effort 文本操作符抽取 | V0.7 Chromium 内嵌预览，PDF.js 文本层后续增强 | 不编辑 |
| DOCX | OpenXML ZIP XML | V0.7 抽取文本/section 预览，LibreOffice/PDF 后续增强 | 不编辑 |
| PPTX | OpenXML ZIP XML | V0.7 slide 文本预览，LibreOffice/PDF 后续增强 | 不编辑 |
| XLSX | OpenXML ZIP XML | V0.7 sheet/row 表格预览 | 不编辑 |
| 图片 | metadata | V0.7 原图预览，OCR 后续增强 | 标注另存 |

## 5. Job 状态

`knowledge_index_jobs.status`：

- `pending`
- `running`
- `succeeded`
- `failed`
- `cancelled`

V0.6 导入流程保存最终态 `succeeded` / `failed`，失败时保存 `error_message` 并在文档详情中展示；可观察的 `pending` / `running` 进度和重试队列进入 V0.10。

## 6. 安全策略

- 不执行 Office 宏。
- 不自动加载外部资源。
- 不把导入内容上传。
- HTML 输出必须 sanitize。
- 预览窗口禁用 Node。

## 7. V0.6 验收

- 导入重复文件可识别 hash。
- 文件读取和复制使用异步 I/O，导入由 main process 执行，renderer 不直接阻塞。
- 抽取失败有明确状态。
- 搜索能命中文档正文。
- 点击搜索结果能打开对应页面或文档。

## 8. 当前实现对齐

V0.6 当前实现采用无新依赖 MVP：

- `desktop/src/main/knowledge/ipc.ts` 提供 `knowledge:import-files`，由 main process 打开系统文件选择器、计算 SHA-256、复制到 `userData/knowledge-assets/<library>/<hash-prefix>/`。
- `desktop/src/main/knowledge/text_extractor.ts` 提供轻量抽取：
  - Markdown、文本、CSV、JSON、XML、HTML：按 UTF-8 文本读取。
  - DOCX：读取 OpenXML ZIP 中 `word/document.xml` 与 header/footer。
  - PPTX：读取 `ppt/slides/slide*.xml`。
  - XLSX：读取 `xl/sharedStrings.xml` 与 worksheet XML。
  - PDF：best-effort 解压 Flate stream 并解析 `Tj/TJ` 文本操作符。
  - 图片：作为可管理资产入库，正文索引为空。
- `multi_platform_core/migrations/023_add_knowledge_search_fts.sql` 新增 `knowledge_search_fts`，并为 `knowledge_ai_chunks` 增加 source 索引。
- `KnowledgeService::import_document` 在一个事务中复用或创建 asset、创建 `document` 节点、创建 `external_document` 页面、写入索引任务与搜索索引。
- 重复文件通过同一 library 下的 `hash` 识别，复用既有 asset 和 document 节点，并在导入结果里返回 `duplicateAsset = true`。
- 搜索通过 `knowledge:search` 统一返回页面、导入文档、附件、速记的命中结果；UI 支持全库/当前空间查询、类型过滤、命中片段和点击跳转。

当前限制：

- PDF 和 Office 抽取只保证基础文本，不保证复杂版式、扫描件 OCR、宏、嵌入对象或表格结构完整保真。
- V0.6 暂不提供可取消/可重试的后台 job 队列，长文档的 CPU 抽取仍可能占用 main process 短时间。
- V0.6 只提供导入文档详情页和打开原文件；分页阅读、缩略图、摘录和 Office 预览属于 V0.7。

V1.0 对齐：

- `retryIndexJob(jobId)` 已支持失败或取消的附件抽取任务从原文件或入库文件重跑。
- `cancelIndexJob(jobId)` 已支持把非完成任务写入 `cancelled` 终态；当前仍不是可中断 worker 队列，已经开始的同步抽取不会被强杀。
- 导入前会读取 `AppConfig.features.knowledge.maxImportFileSizeMb` 做大文件保护，关闭全文索引时仍创建文档节点并把索引任务记为 `cancelled`。

## 9. V0.7 当前实现对齐

V0.7 在 V0.6 导入结果上补充预览 metadata 和页面能力：

- `ExtractKnowledgeTextResult.metadata.previewKind` 标记预览类型：`text`、`pdf`、`image`、`slides`、`sheets` 或 `unsupported`。
- DOCX metadata 保留 section 文本；PPTX metadata 保留 slide 文本；XLSX metadata 保留 sheet 名称和有限行列表。
- PDF 和图片不生成额外文件，直接通过 `app://knowledge-assets` 读取受控资产。
- 文档页面内创建摘录时使用 `createPage` 写入 Markdown 页面，并把来源 asset/document 信息及可获得的 slide/sheet/cell 上下文写入 `propertiesJson`。
- 摘录 Markdown 页面通过 `propertiesJson.sourceDocumentId` 提供“回到来源”入口。
- `knowledge:show-asset-in-folder` 由 main process 根据 asset id 定位系统文件，避免 renderer 获取任意路径访问能力。

仍未完成：

- preview PDF / thumbnail 实体缓存与重建队列。
- PDF.js 页码、文本层、批注和页内反链。
- LibreOffice headless 转换后的 Office 高保真预览。
