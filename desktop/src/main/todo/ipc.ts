import { ipcMain } from 'electron';
import { dbManager, JsDatabase } from '../../core/database';
import type {
  CreateTodoListPayload,
  UpdateTodoListPayload,
  CreateTodoPayload,
  UpdateTodoPayload,
  CreateTodoStepPayload,
  UpdateTodoStepPayload,
  CreateTodoReminderPayload,
} from '@/contracts/todo';

let registered = false;

/** 系统内置的默认列表 ID，用于收纳从智能视图（我的一天/重要/等）创建的 todo。
 *  该列表不向用户暴露，不会出现在侧边栏。
 */
const SYSTEM_DEFAULT_LIST_ID = 'default-tasks';

/** 确保系统默认列表在数据库中存在。如果已存在则跳过。 */
async function ensureSystemDefaultList(db: JsDatabase) {
  const allLists = await db.getAllTodoLists();
  const exists = allLists.some(l => l.id === SYSTEM_DEFAULT_LIST_ID);
  if (!exists) {
    await db.createTodoList({
      id: SYSTEM_DEFAULT_LIST_ID,
      name: '默认任务',
      sortOrder: -1, // 排在最前，但会被过滤掉
    });
  }
}

export function registerTodoIpcHandlers() {
  if (registered) return;

  const db = () => dbManager.getDatabase();

  // ==================== 列表 ====================

  ipcMain.handle('todo:get-all-lists', async () => {
    const allLists = await db().getAllTodoLists();
    // 过滤掉系统内置列表，不向用户暴露
    return allLists.filter(l => l.id !== SYSTEM_DEFAULT_LIST_ID);
  });

  ipcMain.handle('todo:create-list', async (_event, input: CreateTodoListPayload) => {
    return db().createTodoList({
      id: input.id,
      name: input.name,
      icon: input.icon,
      themeColor: input.themeColor,
      sortOrder: input.sortOrder,
    });
  });

  ipcMain.handle('todo:update-list', async (_event, listId: string, input: UpdateTodoListPayload) => {
    return db().updateTodoList(listId, {
      name: input.name,
      icon: input.icon,
      themeColor: input.themeColor,
      sortOrder: input.sortOrder,
    });
  });

  ipcMain.handle('todo:delete-list', async (_event, listId: string) => {
    await db().deleteTodoList(listId);
  });

  ipcMain.handle('todo:reorder-lists', async (_event, ids: string[]) => {
    await db().reorderTodoLists(ids);
  });

  // ==================== 任务 ====================

  ipcMain.handle('todo:create-todo', async (_event, input: CreateTodoPayload) => {
    return db().createTodo({
      id: input.id,
      listId: input.listId,
      title: input.title,
      note: input.note,
      isImportant: input.isImportant,
      isMyDay: input.isMyDay,
      dueDate: input.dueDate,
      repeatRule: input.repeatRule,
      sortOrder: input.sortOrder,
    });
  });

  ipcMain.handle('todo:update-todo', async (_event, todoId: string, input: UpdateTodoPayload) => {
    return db().updateTodo(todoId, {
      listId: input.listId,
      title: input.title,
      note: input.note,
      isImportant: input.isImportant,
      isMyDay: input.isMyDay,
      myDayDate: input.myDayDate,
      dueDate: input.dueDate,
      repeatRule: input.repeatRule,
      sortOrder: input.sortOrder,
    });
  });

  ipcMain.handle('todo:delete-todo', async (_event, todoId: string) => {
    await db().deleteTodo(todoId);
  });

  ipcMain.handle('todo:complete-todo', async (_event, todoId: string) => {
    return db().completeTodo(todoId);
  });

  ipcMain.handle('todo:uncomplete-todo', async (_event, todoId: string) => {
    return db().uncompleteTodo(todoId);
  });

  ipcMain.handle('todo:get-by-list', async (_event, listId: string, includeCompleted: boolean) => {
    return db().getTodosByList(listId, includeCompleted);
  });

  ipcMain.handle('todo:search', async (_event, query: string) => {
    return db().searchTodos(query);
  });

  ipcMain.handle('todo:move', async (_event, todoId: string, targetListId: string) => {
    return db().moveTodo(todoId, targetListId);
  });

  // ==================== 智能列表 ====================

  ipcMain.handle('todo:get-my-day', async (_event, date: string) => {
    return db().getMyDayTodos(date);
  });

  ipcMain.handle('todo:get-important', async () => {
    return db().getImportantTodos();
  });

  ipcMain.handle('todo:get-planned', async () => {
    return db().getPlannedTodos();
  });

  ipcMain.handle('todo:get-all', async () => {
    return db().getAllTodos();
  });

  ipcMain.handle('todo:get-completed', async () => {
    return db().getCompletedTodos();
  });

  // ==================== 我的一天 ====================

  ipcMain.handle('todo:add-to-my-day', async (_event, todoId: string, date: string) => {
    await db().addTodoToMyDay(todoId, date);
  });

  ipcMain.handle('todo:remove-from-my-day', async (_event, todoId: string) => {
    await db().removeTodoFromMyDay(todoId);
  });

  ipcMain.handle('todo:get-yesterday-incomplete', async (_event, today: string) => {
    return db().getYesterdayIncompleteTodos(today);
  });

  ipcMain.handle('todo:get-my-day-suggestions', async (_event, today: string) => {
    return db().getMyDaySuggestions(today);
  });

  // ==================== 步骤 ====================

  ipcMain.handle('todo:create-step', async (_event, input: CreateTodoStepPayload) => {
    return db().createTodoStep({
      id: input.id,
      todoId: input.todoId,
      title: input.title,
      sortOrder: input.sortOrder,
    });
  });

  ipcMain.handle('todo:update-step', async (_event, stepId: string, input: UpdateTodoStepPayload) => {
    return db().updateTodoStep(stepId, {
      title: input.title,
      isCompleted: input.isCompleted,
      sortOrder: input.sortOrder,
    });
  });

  ipcMain.handle('todo:delete-step', async (_event, stepId: string) => {
    await db().deleteTodoStep(stepId);
  });

  ipcMain.handle('todo:reorder-steps', async (_event, ids: string[]) => {
    await db().reorderTodoSteps(ids);
  });

  // ==================== 提醒 ====================

  ipcMain.handle('todo:create-reminder', async (_event, input: CreateTodoReminderPayload) => {
    return db().createTodoReminder({
      id: input.id,
      todoId: input.todoId,
      remindAt: input.remindAt,
    });
  });

  ipcMain.handle('todo:delete-reminder', async (_event, reminderId: string) => {
    await db().deleteTodoReminder(reminderId);
  });

  ipcMain.handle('todo:get-reminders', async (_event, todoId: string) => {
    return db().getRemindersByTodo(todoId);
  });

  // ==================== 昨日提示忽略日期 ====================

  const DISMISSED_DATE_KEY = 'todo.yesterday_dismissed_date';

  ipcMain.handle('todo:get-dismissed-date', async () => {
    try {
      const raw = await db().getPluginStateValue('__system__', DISMISSED_DATE_KEY);
      return raw ?? null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('todo:set-dismissed-date', async (_event, date: string) => {
    await db().setPluginStateValue('__system__', DISMISSED_DATE_KEY, date);
  });

  registered = true;
}

/**
 * 在数据库初始化完成后调用，执行 Todo 相关的数据初始化工作。
 * 必须在 dbManager.initialize() 之后调用。
 */
export async function initializeTodoData(): Promise<void> {
  await ensureSystemDefaultList(dbManager.getDatabase());
}
