import { JsDatabase } from '@guyantools/core';
import { app } from 'electron';
import path from 'path';

/**
 * 数据库管理器
 * 封装 Rust 核心数据库功能供 Electron 主进程使用
 */
class DatabaseManager {
  private db: JsDatabase | null = null;

  /**
   * 初始化数据库
   * @param dbPath 数据库文件路径，默认使用应用数据目录
   */
  async initialize(dbPath?: string): Promise<void> {
    try {
      const finalPath = dbPath || path.join(app.getPath('userData'), 'guyantools.db');
      this.db = new JsDatabase(finalPath);
      console.log(`数据库初始化成功: ${finalPath}`);
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建内存数据库（用于测试）
   */
  async initializeInMemory(): Promise<void> {
    try {
      this.db = JsDatabase.newInMemory();
      console.log('内存数据库初始化成功');
    } catch (error) {
      console.error('内存数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): JsDatabase {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 检查数据库是否已初始化
   */
  isInitialized(): boolean {
    return this.db !== null;
  }
}

// 导出单例
export const dbManager = new DatabaseManager();
export { JsDatabase };

