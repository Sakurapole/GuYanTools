import { app, BrowserWindow, ipcMain } from 'electron';
import type { GpuInfoSummary, ProcessInfo } from '@/contracts/process_manager';

let registered = false;

/**
 * 将 Electron ProcessMetric 转换为 renderer 友好的 ProcessInfo，
 * 同时关联 BrowserWindow 信息（仅 Tab 类型）。
 */
function buildProcessInfoList(): ProcessInfo[] {
  const metrics = app.getAppMetrics();
  const windows = BrowserWindow.getAllWindows();

  // 预建 pid → window 映射
  const windowByPid = new Map<number, BrowserWindow>();
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    try {
      const pid = win.webContents.getOSProcessId();
      if (pid) windowByPid.set(pid, win);
    } catch {
      // webContents 可能已销毁
    }
  }

  return metrics.map((m) => {
    // Electron 37 MemoryInfo 字段通过类型断言访问，兼容平台差异
    const mem = m.memory as unknown as Record<string, number>;
    const info: ProcessInfo = {
      pid: m.pid,
      type: m.type,
      name: m.name || m.serviceName || m.type,
      serviceName: m.serviceName,
      cpuPercent: m.cpu.percentCPUUsage ?? 0,
      cpuIdleWakeups: m.cpu.idleWakeupsPerSecond ?? 0,
      memoryWorkingSet: mem.workingSetSize ?? 0,
      memoryPeakWorkingSet: mem.peakWorkingSetSize ?? 0,
      memoryPrivate: mem.privateBytes ?? 0,
      memoryShared: mem.sharedBytes ?? 0,
      creationTime: m.creationTime,
      sandboxed: m.sandboxed,
      integrityLevel: m.integrityLevel,
    };

    if (m.type === 'Tab') {
      const win = windowByPid.get(m.pid);
      if (win) {
        try {
          info.windowTitle = win.getTitle();
          info.windowUrl = win.webContents.getURL();
          info.windowId = win.id;
        } catch {
          // 窗口可能已销毁
        }
      }
    }

    return info;
  });
}

export function registerProcessManagerIpcHandlers() {
  if (registered) return;

  ipcMain.handle('process-manager:list', async () => {
    return buildProcessInfoList();
  });

  ipcMain.handle('process-manager:gpu-info', async () => {
    try {
      const gpuInfo = await app.getGPUInfo('basic') as Record<string, unknown> | null;
      const featureStatus = app.getGPUFeatureStatus() as unknown as Record<string, string>;
      const gpuDevice = (gpuInfo?.gpuDevice as Array<Record<string, string>> | undefined)?.[0];
      const summary: GpuInfoSummary = {
        vendor: gpuDevice?.vendorString ?? 'Unknown',
        device: gpuDevice?.deviceString ?? 'Unknown',
        driverVersion: (gpuInfo?.driverVersion as string) ?? 'Unknown',
        featureStatus: { ...featureStatus },
      };
      return summary;
    } catch {
      return null;
    }
  });

  ipcMain.handle('process-manager:kill', async (_event, pid: number) => {
    if (!pid || typeof pid !== 'number') {
      return { ok: false, message: '无效的进程 ID' };
    }

    // 优先通过窗口关闭渲染进程（更安全）
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win.isDestroyed()) continue;
      try {
        if (win.webContents.getOSProcessId() === pid) {
          win.destroy();
          return { ok: true };
        }
      } catch {
        // 窗口可能已销毁
      }
    }

    // 其他进程（Utility / GPU 等）直接 kill
    try {
      process.kill(pid);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  registered = true;
}
