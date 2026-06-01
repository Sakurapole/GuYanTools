# 知识库 AI 集成设计

> 版本：0.1
> 日期：2026-05-27
> 文档状态：草案

## 1. 原则

- AI 默认关闭。
- AI 只能在用户明确触发后运行。
- AI 输出不能静默覆盖用户内容。
- 所有回答必须带来源引用。
- embedding 可删除、可重建。

## 2. 与现有 AI 模块关系

知识库不单独实现 Provider 管理。AI Provider、模型、Agent 配置沿用 `docs/desktop/AgentFunc/plans/ai-agent-requirements.md` 中的 Chat / Agent 模块。

知识库只提供：

- 上下文检索。
- 页面/块/附件分块。
- 引用来源。
- AI 操作入口。
- AI 操作结果落库。

## 3. 数据预留

### 3.1 `knowledge_ai_chunks`

保存 AI 可用的文本分块：

- 来源类型。
- 来源 ID。
- 分块序号。
- 文本内容。
- token 估算。
- metadata。

### 3.2 `knowledge_embeddings`

保存向量：

- chunk ID。
- provider。
- model。
- dimension。
- vector blob。

后续可迁移到 sqlite-vec 或 LanceDB。

## 4. 功能阶段

### 4.1 V1.3 轻量 AI

- 选中文本总结。
- 选中文本改写。
- 选中文本提取 Todo。
- 页面摘要。
- 标签建议。
- 找相似页面。
- 当前空间问答。

### 4.2 V2.0 Agent

- 收集箱整理建议。
- 重复页面合并建议。
- 空间目录生成。
- 从资料生成 Todo 计划。
- 批量打标签建议。

## 5. 操作安全

AI 修改知识库必须遵守：

- 展示计划。
- 展示 diff。
- 用户确认后写入。
- 支持撤销。
- 记录操作日志。

## 6. UI 入口

- 选区浮动工具条。
- 右侧 Inspector AI tab。
- 搜索框语义搜索开关。
- 空间页 AI 操作菜单。

V0.2 只保留数据表和 UI 占位，不接入模型调用。
