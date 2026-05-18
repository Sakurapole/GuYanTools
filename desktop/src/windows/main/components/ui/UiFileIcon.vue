<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name: string;
  isDir?: boolean;
}>(), {
  isDir: false,
});

const extension = computed(() => {
  const name = props.name || '';
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
});

const iconType = computed(() => {
  if (props.isDir) return 'dir';

  const ext = extension.value;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'archive';
  if (['js', 'ts', 'jsx', 'tsx', 'rs', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'php', 'cs', 'vue', 'html', 'css', 'scss'].includes(ext)) return 'code';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document';
  if (['json', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'config', 'lock'].includes(ext)) return 'config';
  if (['sh', 'bat', 'cmd', 'ps1'].includes(ext)) return 'shell';
  return 'generic';
});
</script>

<template>
  <span class="ui-file-icon" :class="`ui-file-icon--${iconType}`" :title="isDir ? '文件夹' : name">
    <svg v-if="iconType === 'dir'" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 6.5h5l1.4 1.6h8.6v6.9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15z" />
      <path d="M2.5 6V5a1.5 1.5 0 0 1 1.5-1.5h3.6L9 5h7a1.5 1.5 0 0 1 1.5 1.5V8" />
    </svg>
    <svg v-else-if="iconType === 'image'" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="M5.5 14l3.2-3.2 2.3 2.3 1.8-1.8 1.7 2.7" />
    </svg>
    <svg v-else-if="iconType === 'video'" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3.5" width="10.5" height="13" rx="2" />
      <path d="M10.5 8.2l3.8-2.2v8l-3.8-2.2" />
      <path d="M8 8l3.5 2-3.5 2z" />
    </svg>
    <svg v-else-if="iconType === 'audio'" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.2 7.5H10l3.5-2v9l-3.5-2H7.2z" />
      <path d="M14.5 8.2a3.2 3.2 0 0 1 0 3.6" />
      <path d="M16.2 6.6a5.4 5.4 0 0 1 0 6.8" />
    </svg>
    <svg v-else-if="iconType === 'archive'" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="3.5" width="12" height="13" rx="2" />
      <path d="M7 6h6" />
      <path d="M8 8.5h4" />
      <path d="M8.8 11h2.4v3H8.8z" />
    </svg>
    <svg v-else-if="iconType === 'code'" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.2 6.2L4.2 10l3 3.8" />
      <path d="M12.8 6.2l3 3.8-3 3.8" />
      <path d="M11.2 5l-2.4 10" />
    </svg>
    <svg v-else-if="iconType === 'document'" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 3.5h5.5L15 7v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 16V5a1.5 1.5 0 0 1 1-1.4z" />
      <path d="M11.5 3.5V7H15" />
      <path d="M7.5 10h5" />
      <path d="M7.5 12.5h5" />
    </svg>
    <svg v-else-if="iconType === 'config'" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.2l1 .7 1.2-.2.8 1 .9.3.1 1.2.9.8-.4 1.1.4 1.1-.9.8-.1 1.2-.9.3-.8 1-1.2-.2-1 .7-1-.7-1.2.2-.8-1-.9-.3-.1-1.2-.9-.8.4-1.1-.4-1.1.9-.8.1-1.2.9-.3.8-1 1.2.2z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
    <svg v-else-if="iconType === 'shell'" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M6.5 8l2 2-2 2" />
      <path d="M9.8 12h3.7" />
    </svg>
    <svg v-else viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 3.5h5.5L15 7v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 16V5a1.5 1.5 0 0 1 1-1.4z" />
      <path d="M11.5 3.5V7H15" />
    </svg>
  </span>
</template>

<style lang="scss" scoped>
.ui-file-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-width: 36px;
  height: 24px;
  border-radius: var(--ui-radius-full);
  background: color-mix(in srgb, var(--ui-surface-overlay) 96%, transparent);
  color: var(--primary-color);

  svg {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
    overflow: visible;
    transform: translate(
      calc(-50% + var(--ui-file-icon-glyph-x, 0px)),
      calc(-50% + var(--ui-file-icon-glyph-y, 0px))
    );
  }

  &--dir {
    --ui-file-icon-glyph-y: -0.5px;

    color: #52a8ff;
  }

  &--image {
    color: #34d399;
  }

  &--video {
    color: #f59e0b;
  }

  &--audio {
    color: #a78bfa;
  }

  &--archive {
    --ui-file-icon-glyph-y: -0.25px;

    color: #fb7185;
  }

  &--code {
    color: #38bdf8;
  }

  &--document {
    --ui-file-icon-glyph-y: -0.35px;

    color: #94a3b8;
  }

  &--config {
    --ui-file-icon-glyph-y: 0.45px;

    color: #22c55e;
  }

  &--shell {
    --ui-file-icon-glyph-y: -0.25px;

    color: #f97316;
  }
}
</style>
