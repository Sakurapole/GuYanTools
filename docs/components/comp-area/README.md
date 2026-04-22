# CompArea 组件文档

## 概述

CompArea 是一个可拖拽的网格布局组件，已经按照高内聚、低耦合的原则进行了封装。组件支持拖拽排列、自动碰撞检测、布局持久化等功能。

## 组件结构

```
CompArea/
├── CompArea.vue       # 主网格容器组件
├── GridItem.vue       # 网格项组件
└── README.md          # 本文档
```

## Composables (可复用逻辑)

所有可复用的业务逻辑已提取到 `composables` 目录：

### 1. useGridLayout
**职责**: 网格布局计算
- 计算单元格大小 (unitSize)
- 计算网格行列数 (rowNum, colNum)
- 计算水平偏移量 (horizontalOffset)
- 生成网格背景样式 (compAreaStyle)
- 提供坐标转换和边界检测函数

### 2. useGridCollision
**职责**: 碰撞检测
- 检测网格项之间的重叠 (overlaps)
- 判断是否存在碰撞 (hasCollision)
- 查找可用位置 (findAvailablePosition)
- 占位矩阵操作 (canPlaceAt, occupySlot)

### 3. useGridDrag
**职责**: 拖拽交互
- 处理指针事件 (pointerdown, pointermove, pointerup)
- 管理拖拽状态 (draggingItem, draggingPosition)
- 长按触发拖拽 (200ms 延迟)
- 释放时自动对齐到网格

### 4. useGridReflow
**职责**: 布局重排
- 自动排列网格项，避免重叠
- 支持紧凑模式 (compact)
- 按优先级排列网格项
- 使用 requestAnimationFrame 优化性能

### 5. useGridPersistence
**职责**: 布局持久化
- 保存和加载网格布局到 localStorage
- 保存和加载类别列表
- 支持多类别独立布局存储

## 类型定义

所有类型定义位于 `types/grid.d.ts`：

```typescript
export type GridItem = {
  id: string;
  label: string;
  col: number;              // 当前列位置
  row: number;              // 当前行位置
  colSpan: number;          // 横向跨度
  rowSpan: number;          // 纵向跨度
  color: string;            // 背景颜色/渐变
  isDragging: boolean;      // 是否正在拖拽
  preferredCol: number;     // 偏好列位置
  preferredRow: number;     // 偏好行位置
  priority: number;         // 排列优先级
  hidden: boolean;          // 是否隐藏
};

export type CategoryItem = {
  id: string;
  label: string;
  icon: string;
  gridItems: GridItem[];
};

export type GridConfig = {
  GRID_GAP: number;         // 网格间隙
  MIN_UNIT_SIZE: number;    // 最小单元格大小
  STORAGE_KEY: string;      // localStorage 键
  GRID_PADDING: number;     // 网格内边距
  HOLD_DELAY_MS: number;    // 长按延迟
  FIXED_COLUMNS: number;    // 固定列数
};
```

## 使用方法

### 基本使用

```vue
<template>
  <CompArea 
    :category="currentCategory" 
    :config="gridConfig" 
    @layoutChange="handleLayoutChange"
  />
</template>

<script setup>
import CompArea from '@/components/CompArea/CompArea.vue';
import type { CategoryItem, GridConfig } from '@/types/grid';

const gridConfig: GridConfig = {
  GRID_GAP: 8,
  MIN_UNIT_SIZE: 1,
  STORAGE_KEY: 'my-grid-layout',
  GRID_PADDING: 4,
  HOLD_DELAY_MS: 200,
  FIXED_COLUMNS: 16,
};

const currentCategory: CategoryItem = {
  id: 'category-1',
  label: '工具箱',
  icon: '🔧',
  gridItems: [
    {
      id: 'item-1',
      label: '工具1',
      col: 1,
      row: 1,
      colSpan: 2,
      rowSpan: 2,
      color: 'linear-gradient(135deg, #5c9ded, #84c9ff)',
      isDragging: false,
      preferredCol: 1,
      preferredRow: 1,
      priority: 1,
      hidden: false,
    },
    // 更多网格项...
  ],
};

function handleLayoutChange() {
  console.log('布局已更新');
}
</script>
```

### Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | CategoryItem | 是 | 类别数据，包含网格项列表 |
| config | GridConfig | 是 | 网格配置参数 |

### Events

| 事件 | 参数 | 说明 |
|------|------|------|
| layoutChange | - | 布局发生变化时触发（拖拽结束或重排完成） |

## 设计原则

### 高内聚
- 每个 composable 只负责一个明确的功能领域
- 相关的状态和逻辑集中在同一个 composable 中
- 组件内部逻辑清晰，职责单一

### 低耦合
- Composables 之间通过参数传递依赖，而非直接引用
- 每个 composable 可以独立测试和复用
- 组件通过 props 和 events 与外部通信

### 可维护性
- 类型定义独立，便于复用和维护
- 逻辑分层清晰：UI层(组件) → 逻辑层(composables) → 数据层(types)
- 代码注释完整，便于理解

## 特性

✅ 支持拖拽排列  
✅ 自动碰撞检测  
✅ 自动布局重排  
✅ 布局持久化存储  
✅ 响应式布局调整  
✅ 多类别支持  
✅ 长按触发拖拽  
✅ 平滑动画过渡  

## 性能优化

1. **requestAnimationFrame**: 使用 RAF 批量处理布局重排
2. **防抖和节流**: 拖拽时避免频繁计算
3. **增量更新**: 只在布局实际改变时触发持久化
4. **事件监听管理**: 及时清理事件监听器，避免内存泄漏

## 后续扩展建议

1. 支持调整网格项大小
2. 添加网格项右键菜单
3. 支持网格项分组
4. 添加撤销/重做功能
5. 支持导入/导出布局配置

