import { app } from 'electron';
import path from 'node:path';

/**
 * 开发态使用独立 userData 目录，避免与已安装版本冲突。
 *
 * 必须在所有其他主进程模块加载之前执行，确保 constants/paths.ts 等
 * 在模块顶层缓存 userData 路径的代码拿到正确的开发态路径。
 *
 * 解决的冲突：
 * - 单实例锁（requestSingleInstanceLock 基于 userData 路径）
 * - SQLite 数据库文件锁
 * - 全局快捷键注册
 * - 配置文件 / 缓存 / 插件目录
 */
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'GuyanTools-dev'));
}
