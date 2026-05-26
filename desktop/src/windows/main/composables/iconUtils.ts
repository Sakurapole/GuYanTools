/**
 * 图标字符串协议工具模块
 *
 * 支持的格式：
 * - `iconify:mdi:wrench`      → Iconify 图标
 * - `image:data:image/...`    → 用户上传图片（base64 或 URL）
 * - `svg:PHN2ZyB4bWxucz...`   → 用户上传 SVG（base64 编码）
 * - `tool` / `category-tools` → 旧版预设键（向后兼容）
 */

export type IconType = 'iconify' | 'image' | 'svg' | 'preset' | 'none';

export interface ParsedIcon {
  type: IconType;
  value: string;
}

// ─── 旧版预设键 → Iconify 名称映射 ───
// widget 图标
const LEGACY_WIDGET_ICON_MAP: Record<string, string> = {
  list: 'lucide:list',
  tool: 'mdi:wrench',
  video: 'mdi:video-outline',
  audio: 'mdi:volume-high',
  edit: 'mdi:pencil-outline',
  convert: 'mdi:swap-horizontal',
  api: 'mdi:api',
  settings: 'mdi:cog-outline',
};

// 类别图标
const LEGACY_CATEGORY_ICON_MAP: Record<string, string> = {
  'category-tools': 'mdi:wrench',
  'category-media': 'mdi:play-circle-outline',
  'category-text': 'mdi:file-document-outline',
  'category-dev': 'mdi:code-braces',
};

const LEGACY_ICON_MAP: Record<string, string> = {
  ...LEGACY_WIDGET_ICON_MAP,
  ...LEGACY_CATEGORY_ICON_MAP,
};

/**
 * 解析图标字符串为 类型+值
 */
export function parseIconValue(icon: string | undefined | null): ParsedIcon {
  if (!icon) {
    return { type: 'none', value: '' };
  }

  if (icon.startsWith('iconify:')) {
    return { type: 'iconify', value: icon.slice(8) };
  }

  if (icon.startsWith('image:')) {
    return { type: 'image', value: icon.slice(6) };
  }

  if (icon.startsWith('svg:')) {
    return { type: 'svg', value: icon.slice(4) };
  }

  // 旧版预设键
  if (LEGACY_ICON_MAP[icon]) {
    return { type: 'preset', value: LEGACY_ICON_MAP[icon] };
  }

  // 未知格式，当作空值处理
  return { type: 'none', value: icon };
}

export function isIconifyIcon(icon: string): boolean {
  return icon.startsWith('iconify:');
}

export function isImageIcon(icon: string): boolean {
  return icon.startsWith('image:');
}

export function isSvgIcon(icon: string): boolean {
  return icon.startsWith('svg:');
}

export function isPresetIcon(icon: string): boolean {
  return icon in LEGACY_ICON_MAP;
}

/**
 * 将 SVG 源码编码为图标字符串
 */
export function encodeSvgIcon(svgSource: string): string {
  return `svg:${btoa(svgSource)}`;
}

/**
 * 解码 SVG 图标字符串为 SVG 源码
 */
export function decodeSvgIcon(encoded: string): string {
  try {
    return atob(encoded);
  } catch {
    return '';
  }
}

/**
 * 将图片 data URL 编码为图标字符串
 */
export function encodeImageIcon(dataUrl: string): string {
  return `image:${dataUrl}`;
}

/**
 * 生成 Iconify 图标字符串
 */
export function encodeIconifyIcon(iconName: string): string {
  return `iconify:${iconName}`;
}

/**
 * 常用图标集列表（用于 IconPicker 浏览）
 */
export const POPULAR_ICON_SETS = [
  { prefix: 'mdi', name: 'Material Design Icons' },
  { prefix: 'ph', name: 'Phosphor' },
  { prefix: 'tabler', name: 'Tabler Icons' },
  { prefix: 'lucide', name: 'Lucide' },
  { prefix: 'ri', name: 'Remix Icon' },
  { prefix: 'carbon', name: 'Carbon' },
  { prefix: 'fluent', name: 'Fluent UI' },
  { prefix: 'heroicons', name: 'Heroicons' },
];

/**
 * 推荐的快捷图标（常用图标）
 */
export const QUICK_PICK_ICONS = [
  'mdi:wrench',
  'mdi:video-outline',
  'mdi:volume-high',
  'mdi:pencil-outline',
  'mdi:swap-horizontal',
  'mdi:api',
  'mdi:cog-outline',
  'mdi:home-outline',
  'mdi:folder-outline',
  'mdi:file-document-outline',
  'mdi:image-outline',
  'mdi:music-note',
  'mdi:code-braces',
  'mdi:play-circle-outline',
  'mdi:download-outline',
  'mdi:upload-outline',
  'mdi:magnify',
  'mdi:star-outline',
  'mdi:heart-outline',
  'mdi:bookmark-outline',
  'mdi:chat-outline',
  'mdi:bell-outline',
  'mdi:calendar-outline',
  'mdi:clock-outline',
];
