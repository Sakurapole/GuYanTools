import type { PluginPermission } from '@/contracts/plugin_host';

export type PermissionTier = 'default' | 'elevated' | 'builtin';

/** Renderer-side mirror of host permission_matrix copy. Keep in sync with permission_matrix.ts. */
const PERMISSION_META: Array<{
  permission: PluginPermission;
  tier: PermissionTier;
  title: string;
  description: string;
}> = [
  {
    permission: 'workspace.read',
    tier: 'default',
    title: '读取工作区',
    description: '读取当前工作区的公开摘要信息',
  },
  {
    permission: 'storage.self',
    tier: 'default',
    title: '插件私有存储',
    description: '在本机保存插件自己的配置与缓存，有容量上限',
  },
  {
    permission: 'ui.contribute',
    tier: 'default',
    title: '界面贡献',
    description: '在应用内注册页面、组件或命令入口',
  },
  {
    permission: 'observability.logs',
    tier: 'default',
    title: '写入插件日志',
    description: '写入插件日志，便于排查问题，有频率限制',
  },
  {
    permission: 'network.fetch',
    tier: 'default',
    title: '访问网络',
    description: '发起受限制的 HTTP(S) 请求，禁止访问本机与内网地址',
  },
  {
    permission: 'navigation.open',
    tier: 'default',
    title: '打开应用页面',
    description: '打开应用内的指定页面',
  },
  {
    permission: 'system.notifications',
    tier: 'elevated',
    title: '发送通知',
    description: '在系统或应用内显示通知，有频率限制',
  },
  {
    permission: 'system.dialog',
    tier: 'elevated',
    title: '打开选择器',
    description: '打开文件或目录选择对话框',
  },
  {
    permission: 'system.clipboard',
    tier: 'elevated',
    title: '剪贴板',
    description: '读写系统剪贴板；读取通常需要您的操作触发',
  },
  {
    permission: 'system.shortcuts',
    tier: 'elevated',
    title: '注册快捷键',
    description: '注册全局快捷键，冲突时需要您确认',
  },
  {
    permission: 'files.read',
    tier: 'elevated',
    title: '读取文件',
    description: '读取您明确授权目录中的文件',
  },
  {
    permission: 'files.write',
    tier: 'elevated',
    title: '写入文件',
    description: '写入您明确授权目录中的文件',
  },
  {
    permission: 'downloads.manage',
    tier: 'elevated',
    title: '管理下载',
    description: '创建并控制下载任务',
  },
  {
    permission: 'jobs.manage',
    tier: 'elevated',
    title: '管理任务队列',
    description: '创建、查询、取消和重试插件自己的任务',
  },
  {
    permission: 'media.preview',
    tier: 'elevated',
    title: '媒体预览',
    description: '获取本地媒体的预览信息与受控播放地址',
  },
  {
    permission: 'media.transcode',
    tier: 'elevated',
    title: '音视频处理',
    description: '转码、抽取或合并音视频，会占用较多资源',
  },
  {
    permission: 'media.tag',
    tier: 'elevated',
    title: '写入媒体标签',
    description: '修改音频或视频的标签、封面和歌词',
  },
  {
    permission: 'tools.ffmpeg',
    tier: 'elevated',
    title: '使用媒体工具',
    description: '调用内置 FFmpeg/FFprobe 做结构化媒体处理',
  },
  {
    permission: 'secrets.self',
    tier: 'elevated',
    title: '保存插件密钥',
    description: '加密保存插件私有密钥，不会明文导出',
  },
  {
    permission: 'background.run',
    tier: 'elevated',
    title: '后台运行',
    description: '允许插件在后台持续运行',
  },
  {
    permission: 'commands.execute',
    tier: 'elevated',
    title: '执行插件命令',
    description: '触发插件自己注册的命令',
  },
  {
    permission: 'android.devices.read',
    tier: 'elevated',
    title: '读取 Android 设备',
    description: '读取已连接的 Android 设备列表',
  },
  {
    permission: 'android.sessions.read',
    tier: 'elevated',
    title: '读取投屏会话',
    description: '读取插件自己的 Android 会话状态',
  },
  {
    permission: 'android.sessions.control',
    tier: 'elevated',
    title: '控制 Android 设备',
    description: '启动或停止镜像、音频或 OTG 会话',
  },
  {
    permission: 'android.audio.playback',
    tier: 'elevated',
    title: '播放设备音频',
    description: '播放来自 Android 设备的音频',
  },
  {
    permission: 'android.otg.control',
    tier: 'elevated',
    title: 'OTG 输入控制',
    description: '通过 OTG 注入键盘或鼠标输入',
  },
  {
    permission: 'android.fastboot.read',
    tier: 'elevated',
    title: '读取 fastboot 信息',
    description: '读取 fastboot 设备变量',
  },
  {
    permission: 'android.fastboot.reboot',
    tier: 'elevated',
    title: '重启到 fastboot',
    description: '重启设备，可能进入刷机模式，请谨慎授予',
  },
  {
    permission: 'data.user.read',
    tier: 'elevated',
    title: '读取用户资料',
    description: '读取脱敏后的用户公开资料',
  },
  {
    permission: 'data.project.read',
    tier: 'elevated',
    title: '读取项目摘要',
    description: '读取项目公开摘要，不包含数据库连接',
  },
  {
    permission: 'data.settings.read',
    tier: 'elevated',
    title: '读取应用设置',
    description: '读取白名单内的应用设置项',
  },
  {
    permission: 'data.project.write',
    tier: 'builtin',
    title: '修改项目数据',
    description: '修改项目数据，仅内置插件可用',
  },
  {
    permission: 'data.settings.write',
    tier: 'builtin',
    title: '修改应用设置',
    description: '修改应用设置，仅内置插件可用',
  },
];

const BY_PERMISSION = new Map(PERMISSION_META.map((meta) => [meta.permission, meta]));

export function getPermissionCopy(permission: PluginPermission) {
  const meta = BY_PERMISSION.get(permission);
  if (meta) return { title: meta.title, description: meta.description };
  return { title: permission, description: permission };
}

export function getPermissionTier(permission: PluginPermission): PermissionTier | undefined {
  return BY_PERMISSION.get(permission)?.tier;
}

export function getDefaultApprovedSuggestions(
  declared: readonly PluginPermission[]
): PluginPermission[] {
  return declared.filter((permission) => getPermissionTier(permission) === 'default');
}
