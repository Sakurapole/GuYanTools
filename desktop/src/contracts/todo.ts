import type { BackgroundStyleConfig, BackgroundType } from './background';

// ==================== DTO/Response Types ====================

export interface TodoList {
  id: string;
  workspaceId: number;
  name: string;
  icon: string;
  themeColor: string;
  sortOrder: number;
  incompleteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: string;
  listId: string;
  title: string;
  note: string;
  isCompleted: boolean;
  isImportant: boolean;
  isMyDay: boolean;
  myDayDate?: string;
  dueDate?: string;
  repeatRule?: string;
  sortOrder: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  steps: TodoStep[];
  reminders: TodoReminder[];
}

export interface TodoStep {
  id: string;
  todoId: string;
  title: string;
  imageUrl?: string;
  isCompleted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TodoReminder {
  id: string;
  todoId: string;
  remindAt: string;
  isSent: boolean;
  createdAt: string;
}

export interface CompleteTodoResult {
  completedTodo: Todo;
  nextTodo?: Todo;
}

// ==================== Payload/Input Types ====================

export interface CreateTodoListPayload {
  id: string;
  name: string;
  icon?: string;
  themeColor?: string;
  sortOrder: number;
}

export interface UpdateTodoListPayload {
  name?: string;
  icon?: string;
  themeColor?: string;
  sortOrder?: number;
}

export interface CreateTodoPayload {
  id: string;
  listId: string;
  title: string;
  note?: string;
  isImportant?: boolean;
  isMyDay?: boolean;
  dueDate?: string;
  repeatRule?: string;
  sortOrder?: number;
}

export interface UpdateTodoPayload {
  listId?: string;
  title?: string;
  note?: string;
  isImportant?: boolean;
  isMyDay?: boolean;
  myDayDate?: string;
  dueDate?: string;
  repeatRule?: string;
  sortOrder?: number;
}

export interface CreateTodoStepPayload {
  id: string;
  todoId: string;
  title: string;
  imageUrl?: string;
  sortOrder?: number;
}

export interface UpdateTodoStepPayload {
  title?: string;
  imageUrl?: string;
  isCompleted?: boolean;
  sortOrder?: number;
}

export interface CreateTodoReminderPayload {
  id: string;
  todoId: string;
  remindAt: string;
}

export type TodoBackgroundTarget = 'app' | 'sidebar' | 'content' | 'detail' | 'item' | 'sidebar-item';

export interface TodoBackgroundConfig {
  type: BackgroundType;
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundStyleConfig;
}

export type TodoBackgroundState = Partial<Record<TodoBackgroundTarget, TodoBackgroundConfig>>;

// ==================== API Interface ====================

export interface TodoApi {
  // 列表
  getAllLists: () => Promise<TodoList[]>;
  createList: (input: CreateTodoListPayload) => Promise<TodoList>;
  updateList: (listId: string, input: UpdateTodoListPayload) => Promise<TodoList>;
  deleteList: (listId: string) => Promise<void>;
  reorderLists: (ids: string[]) => Promise<void>;

  // 任务
  createTodo: (input: CreateTodoPayload) => Promise<Todo>;
  updateTodo: (todoId: string, input: UpdateTodoPayload) => Promise<Todo>;
  deleteTodo: (todoId: string) => Promise<void>;
  completeTodo: (todoId: string) => Promise<CompleteTodoResult>;
  uncompleteTodo: (todoId: string) => Promise<Todo>;
  getTodosByList: (listId: string, includeCompleted: boolean) => Promise<Todo[]>;
  searchTodos: (query: string) => Promise<Todo[]>;
  moveTodo: (todoId: string, targetListId: string) => Promise<Todo>;

  // 智能列表
  getMyDayTodos: (date: string) => Promise<Todo[]>;
  getImportantTodos: () => Promise<Todo[]>;
  getPlannedTodos: () => Promise<Todo[]>;
  getAllTodos: () => Promise<Todo[]>;
  getCompletedTodos: () => Promise<Todo[]>;

  // 我的一天
  addToMyDay: (todoId: string, date: string) => Promise<void>;
  removeFromMyDay: (todoId: string) => Promise<void>;
  getYesterdayIncomplete: (today: string) => Promise<Todo[]>;
  getMyDaySuggestions: (today: string) => Promise<Todo[]>;

  // 步骤
  createStep: (input: CreateTodoStepPayload) => Promise<TodoStep>;
  updateStep: (stepId: string, input: UpdateTodoStepPayload) => Promise<TodoStep>;
  deleteStep: (stepId: string) => Promise<void>;
  reorderSteps: (ids: string[]) => Promise<void>;

  // 提醒
  createReminder: (input: CreateTodoReminderPayload) => Promise<TodoReminder>;
  deleteReminder: (reminderId: string) => Promise<void>;
  getRemindersByTodo: (todoId: string) => Promise<TodoReminder[]>;

  // 昨日提示忽略日期（SQLite 持久化）
  getDismissedDate: () => Promise<string | null>;
  setDismissedDate: (date: string) => Promise<void>;

  // 个性化背景（SQLite 持久化）
  getBackgrounds: () => Promise<TodoBackgroundState>;
  updateBackgrounds: (payload: TodoBackgroundState) => Promise<TodoBackgroundState>;
}
