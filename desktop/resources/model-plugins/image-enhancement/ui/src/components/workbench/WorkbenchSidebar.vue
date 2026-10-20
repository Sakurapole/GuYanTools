<script setup lang="ts">
import type { WorkbenchNav } from '../../types/image-workbench';

defineProps<{ activeNav: WorkbenchNav }>();
const emit = defineEmits<{ navigate: [nav: WorkbenchNav]; toggle: [] }>();
const items: Array<{ id: WorkbenchNav; label: string; icon: string }> = [
  { id: 'workbench', label: '处理工作台', icon: '⌁' },
  { id: 'models', label: '模型库', icon: '◇' },
  { id: 'history', label: '任务历史', icon: '◷' },
  { id: 'runtime', label: '运行环境', icon: '▣' },
];
</script>

<template>
  <aside class="workbench-sidebar workbench-sidebar--left">
    <div class="sidebar__head">
      <span class="sidebar__label">工作区</span
      ><button title="折叠导航" @click="emit('toggle')">‹</button>
    </div>
    <nav class="sidebar-nav">
      <button
        v-for="item in items"
        :key="item.id"
        :class="{ active: activeNav === item.id }"
        @click="emit('navigate', item.id)"
      >
        <span>{{ item.icon }}</span
        ><span>{{ item.label }}</span>
      </button>
    </nav>
    <div class="sidebar__foot">
      <div class="sidebar__hint"><span class="live-dot"></span><span>本机运行正常</span></div>
      <span class="sidebar__version">v0.1.0 · 本地模型库</span>
    </div>
  </aside>
</template>
