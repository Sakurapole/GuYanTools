# 知识库 Milkdown Markdown POC 评估报告

日期：2026-06-02

## 目标

验证 Milkdown/Crepe 是否适合作为 GuYanTools 知识库 Markdown 页面的实验所见即所得编辑模式。

## 不变量

- Markdown 页面继续以 `contentMarkdown` 为主存储。
- CodeMirror 继续作为默认 Markdown 编辑器和大文档回退编辑器。
- Block 页面与 Canvas 页面不接入 Milkdown。
- 本 POC 不新增数据库迁移，不新增 pageType。

## 当前实现

- 已添加 `@milkdown/crepe`、`@milkdown/vue`、`@milkdown/kit` 作为桌面端依赖。
- 已新增 `KnowledgeMilkdownPocEditor.vue`，通过 Crepe 承载实验编辑器。
- 已在 `KnowledgeMarkdownEditor.vue` 增加 `Milkdown 实验`模式，并使用异步组件加载，避免默认知识库页面首包直接包含 Milkdown。
- 已复用 Markdown 页面的 `markdownDraft`、`saveMarkdownDraft()` 和 `app://knowledge-assets/...` 资产 URL 路径。
- 已新增 fixture 级验证，覆盖基础 Markdown、frontmatter、wiki link、增强块、资产链接和大文档烟测文本。

## 验收结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 基础 Markdown 往返 | 自动基线通过 | `pnpm --dir desktop run verify:knowledge-editor` |
| Frontmatter 保留 | 自动基线通过 | fixture 要求两个 `---` 分隔符 |
| Wiki Link 保留 | 自动基线通过 | fixture 会拒绝丢失 `[[页面]]` 的结果 |
| Callout/Math/Mermaid 保留 | 自动基线通过 | 仅验证 POC 关键片段保留 |
| 资产链接上传与保存 | 编译接线通过，待运行手测 | `uploadMarkdownAssetUrl()` 返回 `app://knowledge-assets/...` |
| 2,000 section 大文档烟测 | fixture 已准备，待运行手测 | `large_document_smoke` fixture |

## 决策

当前决策：继续保留实验状态。

升级为默认中小文档 WYSIWYG 的条件：

1. 基础 Markdown、frontmatter、wiki link、资产链接无明显破坏。
2. 2,000 section 烟测输入和保存不卡死。
3. 用户能无损切回 CodeMirror。

拒绝继续迁移的条件：

1. 保存后破坏 `[[页面]]` 或 `app://knowledge-assets/...`。
2. 中型文档输入明显卡顿。
3. 无法稳定接入当前保存和资产上传链路。

## 后续手测清单

1. 打开一个 Markdown 知识页，确认默认仍是 CodeMirror/分屏模式。
2. 切换到 `Milkdown 实验`，输入文本，等待自动保存或手动保存。
3. 切回 CodeMirror，确认 Markdown 原文同步。
4. 粘贴图片，确认生成 `app://knowledge-assets/...` 图片链接。
5. 粘贴 `large_document_smoke` fixture，确认编辑、滚动、保存没有明显卡死。
