/**
 * 进程信息 —— 由 app.getAppMetrics() 转换而来
 */
export interface ProcessInfo {
  /** 操作系统进程 ID */
  pid: number;
  /** Electron 进程类型: Browser | Tab | Utility | GPU | Zygote | Sandbox helper | Unknown */
  type: string;
  /** 进程显示名（关联窗口标题或 serviceName） */
  name: string;
  /** Utility 进程的服务名 */
  serviceName?: string;
  /** CPU 占用百分比 */
  cpuPercent: number;
  /** 每秒空闲唤醒次数 */
  cpuIdleWakeups: number;
  /** 工作集内存 (KB) */
  memoryWorkingSet: number;
  /** 峰值工作集内存 (KB) */
  memoryPeakWorkingSet: number;
  /** 私有内存 (KB) — Windows */
  memoryPrivate: number;
  /** 共享内存 (KB) — Windows */
  memoryShared: number;
  /** 进程创建时间 (ms since epoch) */
  creationTime: number;
  /** 是否沙箱 */
  sandboxed?: boolean;
  /** 完整性级别 — Windows */
  integrityLevel?: string;
  /** 关联窗口标题（仅 Tab 类型有值） */
  windowTitle?: string;
  /** 关联窗口 URL（仅 Tab 类型有值） */
  windowUrl?: string;
  /** 关联窗口 ID（仅 Tab 类型有值） */
  windowId?: number;
}

/**
 * GPU 信息摘要
 */
export interface GpuInfoSummary {
  vendor: string;
  device: string;
  driverVersion: string;
  featureStatus: Record<string, string>;
}

export interface ProcessManagerApi {
  /** 获取所有进程列表 */
  getProcessList: () => Promise<ProcessInfo[]>;
  /** 获取 GPU 信息 */
  getGpuInfo: () => Promise<GpuInfoSummary | null>;
  /** 结束指定进程 */
  killProcess: (pid: number) => Promise<{ ok: boolean; message?: string }>;
}

declare global {
  interface Window {
    processManagerApi: ProcessManagerApi;
  }
}
