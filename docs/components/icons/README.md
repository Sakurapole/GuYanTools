# 图标系统说明

本目录包含用于 CompArea 网格小部件的 SVG 图标组件。

## 可用图标

### 小部件图标

用于网格小部件的图标：

- `tool` - 工具图标（扳手）
- `video` - 视频图标（摄像机）
- `audio` - 音频图标（音符）
- `edit` - 编辑图标（铅笔）
- `convert` - 转换图标（双向箭头）
- `api` - API 图标（代码括号）
- `settings` - 设置图标（齿轮）

### 类别图标

用于侧边栏类别的图标：

- `category-tools` - 工具类别（扳手）
- `category-media` - 媒体类别（胶片）
- `category-text` - 文档类别（文档）
- `category-dev` - 开发类别（机器人）
- 还有一个 `AddIcon` 组件用于"添加类别"按钮

## 使用方法

在 `Home.vue` 中定义 GridItem 时，只需添加 `icon` 字段：

```typescript
{
  id: 'grid-item-1',
  label: '工具1',
  icon: 'tool',  // 图标名称
  col: 1,
  row: 1,
  colSpan: 1,
  rowSpan: 1,
  color: 'linear-gradient(135deg, #5c9ded, #84c9ff)',
  // ... 其他配置
}
```

如果不指定 `icon` 字段，将显示默认的文字形式。

## 添加新图标

要添加新图标，请按照以下步骤：

1. 在本目录下创建新的 `.vue` 文件，例如 `NewIcon.vue`

1. 使用以下模板：

```vue
<template>
  <svg xmlns="http://www.w3.org/2000/svg" :width="width" :height="height" :fill="color" viewBox="0 0 24 24">
    <!-- 在这里添加 SVG path -->
    <path d="..."/>
  </svg>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'NewIcon',
  props: {
    width: {
      type: [Number, String],
      default: 24
    },
    height: {
      type: [Number, String],
      default: 24
    },
    color: {
      type: String,
      default: 'currentColor'
    }
  }
});
</script>
```

1. 在 `GridItem.vue` 中注册新图标：

```typescript
const iconComponents: Record<string, any> = {
  'tool': defineAsyncComponent(() => import('../svgs/icons/ToolIcon.vue')),
  // ... 其他图标
  'newicon': defineAsyncComponent(() => import('../svgs/icons/NewIcon.vue')),  // 添加新图标
};
```

1. 现在就可以在 GridItem 中使用 `icon: 'newicon'` 了！

## 图标样式

所有图标默认：

- 大小：48x48 像素（在小部件中）
- 颜色：白色
- 可通过 props 自定义大小和颜色

## 注意事项

- 图标使用异步加载以优化性能
- 如果图标名称不存在，将回退显示文字标签
- 建议使用简洁的 Material Design 或类似风格的图标
