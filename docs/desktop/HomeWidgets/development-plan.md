# 首页内置小组件开发计划

> 版本：1.0
> 日期：2026-03-25
> 文档状态：草案

---

## 1. 开发目标

在不重写首页网格系统的前提下，把当前“通用快捷卡片”演进为“支持内置业务组件的首页 widget 系统”，并完成首期 3 个内置组件：

- 番茄钟
- 日期
- 天气

预计整体工作量：`9 - 12 人日`

---

## 2. 设计原则

### 2.1 不破坏现有布局能力

- 继续复用 `CompArea` 的网格布局、碰撞检测、拖拽与 reflow
- 新增能力尽量放在“组件注册 + 创建流程 + 渲染分发”层

### 2.2 业务渲染与通用卡片分层

- `GridItem` 负责壳层、拖拽壳、右键菜单、背景与尺寸容器
- 业务内容交给独立 widget renderer
- 避免把番茄钟、日期、天气逻辑直接塞进 `GridItem.vue`

### 2.3 数据结构一次扩到位

- 本期就把 `sourceType / widgetType / sizePreset / widgetConfig` 建好
- 兼容旧数据，避免下一个内置组件再做一次迁移

---

## 3. 建议实现结构

### 3.1 新增前端目录

建议新增：

- `desktop/src/renderer/widgets/home/registry.ts`
- `desktop/src/renderer/widgets/home/types.ts`
- `desktop/src/renderer/widgets/home/renderers/BuiltinPomodoroWidget.vue`
- `desktop/src/renderer/widgets/home/renderers/BuiltinDateWidget.vue`
- `desktop/src/renderer/widgets/home/renderers/BuiltinWeatherWidget.vue`
- `desktop/src/renderer/widgets/home/renderers/ShortcutWidget.vue`
- `desktop/src/renderer/widgets/home/forms/PomodoroWidgetForm.vue`
- `desktop/src/renderer/widgets/home/forms/DateWidgetForm.vue`
- `desktop/src/renderer/widgets/home/forms/WeatherWidgetForm.vue`

### 3.2 现有文件改造点

- `desktop/src/renderer/components/CompArea/WidgetSizePicker.vue`
  - 升级为“组件创建器”，不再只做宽高选择
- `desktop/src/renderer/components/CompArea/GridItem.vue`
  - 从通用卡片渲染切换为“外壳 + 内容分发”
- `desktop/src/renderer/components/CompArea/WidgetEditor.vue`
  - 根据 `widgetType` 显示不同配置区
- `desktop/src/renderer/components/CompArea/CompArea.vue`
  - 创建逻辑从“传 colSpan,rowSpan”升级为“传完整 widget draft”
- `desktop/src/renderer/pages/Home/Home.vue`
  - 创建、持久化、编辑入口适配新字段
- `desktop/src/renderer/composables/useGridPersistence.ts`
  - DTO 和前端类型互转增加新字段

---

## 4. 数据层改造计划

### 4.1 TS DTO 扩展

修改：

- `desktop/src/shared/home_layout.ts`
- `desktop/src/renderer/types/grid.d.ts`

新增字段建议：

```ts
type HomeWidgetSourceType = 'builtin' | 'shortcut' | 'plugin';
type HomeWidgetType = 'shortcut' | 'pomodoro' | 'date' | 'weather';

sourceType: HomeWidgetSourceType;
widgetType: HomeWidgetType;
sizePreset?: string;
widgetConfig?: Record<string, unknown>;
```

说明：

- `shortcut` 作为旧组件与通用组件的默认类型
- `sizePreset` 用于限制尺寸切换和预览模板
- `widgetConfig` 用于业务配置持久化

### 4.2 IPC 序列化扩展

修改：

- `desktop/src/main/home_layout_ipc.ts`

工作内容：

- 新增 `widgetConfig` 的序列化/反序列化
- 创建、更新、导入接口补齐新字段

### 4.3 Rust model 扩展

修改：

- `multi_platform_core/src/models/home_layout.rs`
- `multi_platform_core/index.d.ts`

工作内容：

- `HomeWidget`
- `CreateHomeWidgetInput`
- `UpdateHomeWidgetInput`
- `ImportHomeWidgetInput`

都增加 `source_type / widget_type / size_preset / widget_config`

### 4.4 数据库迁移

新增迁移，建议命名：

- `005_extend_home_widgets_for_builtin.sql`

工作内容：

- 为 `home_widgets` 表追加字段：
  - `source_type TEXT NOT NULL DEFAULT 'shortcut'`
  - `widget_type TEXT NOT NULL DEFAULT 'shortcut'`
  - `size_preset TEXT`
  - `widget_config TEXT`
- 给旧数据补默认值

注意：

- 不要直接修改旧迁移 `004_add_home_layout.sql` 作为唯一方案
- 应新增迁移，保证已安装环境可平滑升级

---

## 5. 前端交互开发计划

### 阶段 A：创建器重构

目标：把当前尺寸选择器重构为“创建器”

任务：

- 用新的 `WidgetCreateDialog` 替换或扩展 `WidgetSizePicker.vue`
- 支持：
  - 选择来源
  - 选择类型
  - 选择尺寸预设
  - 配置表单
  - 预览
- 默认聚焦“内置组件”

输出：

- 可以创建带完整元数据的 widget draft

预计：`2 人日`

### 阶段 B：渲染分发层

目标：让 `GridItem` 可按类型渲染不同内容

任务：

- 新建 widget registry
- `GridItem.vue` 中根据 `item.widgetType` 选择 renderer
- 保留外层背景、边框、拖拽、右键菜单逻辑

输出：

- `shortcut` 继续按原卡片渲染
- `pomodoro/date/weather` 使用专用 renderer

预计：`1.5 人日`

### 阶段 C：编辑器改造

目标：编辑已有组件时支持类型化配置

任务：

- `WidgetEditor.vue` 增加业务配置区
- 尺寸切换仅展示当前类型允许的 preset
- 对不支持切换的数据做表单禁用或文案提示

预计：`1 人日`

---

## 6. 业务组件开发计划

### 6.1 番茄钟

任务：

- 设计配置 schema 和默认值
- 按 `2x2 / 4x2 / 4x3` 输出三套布局
- 以结束时间戳计算剩余时间
- 接入通知能力

实现建议：

- 静态配置放 `widgetConfig`
- 运行时状态先放本地 store 或 `localStorage`
- 不把高频 ticking 状态直接写入首页布局数据库

预计：`2 人日`

### 6.2 日期

任务：

- 实现 `2x2 / 4x2 / 4x3` 三套展示
- 本地计算年月日、星期、月历矩阵
- 预留农历/节假日开关字段，但首期可不实现内容

预计：`1 人日`

### 6.3 天气

任务：

- 定义天气 provider 抽象层
- 实现当前天气、小时级、未来多日三档展示
- 增加加载、失败、缓存态

实现建议：

- 首期只接 1 个 provider
- provider key 和接口配置进入设置页或本地配置
- 请求层做最小缓存，避免首页每次切页都重新打接口

预计：`2 - 2.5 人日`

---

## 7. 推荐的组件注册模型

建议前端通过注册表驱动，而不是写死分支：

```ts
type BuiltinWidgetDefinition = {
  sourceType: 'builtin';
  widgetType: 'pomodoro' | 'date' | 'weather';
  title: string;
  description: string;
  icon: string;
  supportedSizes: Array<{
    preset: '2x2' | '4x2' | '4x3';
    colSpan: number;
    rowSpan: number;
    label: string;
  }>;
  createDefaultConfig: () => Record<string, unknown>;
  renderer: Component;
  form: Component;
};
```

收益：

- 创建器、编辑器、渲染器都可复用同一套定义
- 后续新增更多内置组件只需注册，不改核心流程

---

## 8. 测试计划

### 8.1 单元测试

- widget registry 尺寸约束
- widgetConfig 默认值生成
- 番茄钟剩余时间计算
- 日期月历矩阵生成
- 天气状态机和缓存判断

### 8.2 集成测试

- 创建内置 widget 后正确持久化到数据库
- 编辑 widget 后重新加载仍保持配置
- 旧数据无新字段时可正常加载

### 8.3 手工验证

- 不同尺寸创建后布局位置正确
- 尺寸切换后 reflow 正常
- 天气失败态展示稳定
- 多个番茄钟实例同时运行不明显卡顿
- 路由切换后番茄钟时间自动校正

---

## 9. 风险与应对

### 风险 1：把业务逻辑继续堆进 `GridItem.vue`

影响：

- 后续每加一个组件都会放大维护成本

应对：

- 第一版就抽 renderer 分发层

### 风险 2：天气接口耦合过重

影响：

- 设置、接口、缓存、异常一起变复杂

应对：

- 首期只做单 provider + 最小缓存
- 多 provider 放二期

### 风险 3：番茄钟用 interval 递减导致时间漂移

影响：

- 切页面或窗口挂起后时间不准

应对：

- 基于 `targetTimestamp - now` 计算剩余时间

### 风险 4：旧数据迁移不完整

影响：

- 已有首页组件加载异常

应对：

- DB 默认值 + TS 反序列化兜底双保险

---

## 10. 里程碑

### M1：数据层打底

- 完成 schema、IPC、DTO、迁移
- 旧数据兼容通过

### M2：创建器可用

- 可创建 `shortcut / pomodoro / date / weather`
- 类型、尺寸、配置可联动

### M3：3 个内置组件可渲染

- 首屏展示完成
- 编辑和持久化完成

### M4：联调与验证

- 天气缓存、异常态、通知、性能验证完成

---

## 11. 建议实施顺序

1. 先做数据结构和迁移，否则后续 UI 都是临时状态
2. 再做注册表和创建器，让新增组件走统一流程
3. 然后实现 `shortcut` 渲染兜底，保证旧组件不回归
4. 最后逐个补齐 `pomodoro`、`date`、`weather`

---

## 12. 建议首期上线标准

达到以下条件再合并到主干：

- 创建、编辑、删除、拖拽 4 条主链路均正常
- 旧首页数据不丢失
- 3 个内置组件至少各有 2 个有效尺寸
- 天气失败态和未配置态完整
- 番茄钟切路由后时间无明显漂移

