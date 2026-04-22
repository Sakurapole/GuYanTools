import { dbManager } from '../../core/database';
import { showNotification } from '../windows';

let intervalId: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL = 60_000; // 每 60 秒检查一次

async function checkReminders() {
  try {
    const db = dbManager.getDatabase();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const pendingReminders = await db.getPendingReminders(now);

    for (const reminder of pendingReminders) {
      // 获取任务标题用于通知
      const todoTitle = '你有一个任务需要处理';

      try {
        await showNotification({
          type: 'richText',
          size: 'md',
          title: '⏰ 任务提醒',
          message: todoTitle,
          icon: 'clock',
          duration: 8000,
        });
      } catch (err) {
        console.error('[TodoScheduler] Failed to send notification:', err);
      }

      // 标记已发送
      try {
        await db.markReminderSent(reminder.id);
      } catch (err) {
        console.error('[TodoScheduler] Failed to mark reminder sent:', err);
      }
    }
  } catch (err) {
    // 数据库可能还没初始化，静默忽略
    if (String(err).includes('not initialized')) return;
    console.error('[TodoScheduler] Check error:', err);
  }
}

export function startTodoScheduler() {
  if (intervalId) return;
  console.log('[TodoScheduler] Started, checking every 60s');
  // 启动后延迟 5 秒执行第一次检查（等待数据库就绪）
  setTimeout(() => checkReminders(), 5000);
  intervalId = setInterval(checkReminders, CHECK_INTERVAL);
}

export function stopTodoScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[TodoScheduler] Stopped');
  }
}
