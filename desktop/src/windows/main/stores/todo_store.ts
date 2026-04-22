import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Todo, CompleteTodoResult } from '@/contracts/todo';
import { useTodoListStore } from './todo_list_store';
import { useTodoEvents } from '@/windows/main/composables/useTodoEvents';

declare const todoApi: import('@/contracts/todo').TodoApi;

export type SmartListType = 'my-day' | 'important' | 'planned' | 'all' | 'completed';
export type SortBy = 'default' | 'importance' | 'dueDate' | 'createdDate' | 'alphabetical';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTodoStore = defineStore('todo', () => {
  // State
  const listStore = useTodoListStore();
  const { notifyTodoMutated, todoMutationTick } = useTodoEvents();
  const currentView = ref<SmartListType | string>('my-day');
  const todos = ref<Todo[]>([]);
  const selectedTodoId = ref<string | null>(null);
  const loading = ref(false);
  const searchQuery = ref('');
  const yesterdayIncomplete = ref<Todo[]>([]);
  const showYesterdayPrompt = ref(false);
  const sortBy = ref<SortBy>('default');
  const smartListCounts = ref<Record<SmartListType, number>>({
    'my-day': 0,
    'important': 0,
    'planned': 0,
    'all': 0,
    'completed': 0,
  });

  // Computed
  const selectedTodo = computed(() => todos.value.find(t => t.id === selectedTodoId.value) ?? null);
  const incompleteTodos = computed(() => todos.value.filter(t => !t.isCompleted));
  const completedTodos = computed(() => todos.value.filter(t => t.isCompleted));

  const sortedIncompleteTodos = computed(() => {
    const list = [...incompleteTodos.value];
    switch (sortBy.value) {
      case 'importance':
        return list.sort((a, b) => (b.isImportant ? 1 : 0) - (a.isImportant ? 1 : 0));
      case 'dueDate':
        return list.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        });
      case 'createdDate':
        return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'alphabetical':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return list;
    }
  });

  // ==================== 视图切换 ====================

  async function switchView(viewId: SmartListType | string) {
    currentView.value = viewId;
    selectedTodoId.value = null;
    await loadTodos();
  }

  async function loadTodos() {
    loading.value = true;
    try {
      todos.value = await getTodosForView(currentView.value);
    } catch (err) {
      console.error('Failed to load todos:', err);
    } finally {
      loading.value = false;
    }
  }

  async function getTodosForView(viewId: SmartListType | string) {
    if (viewId === 'my-day') {
      return todoApi.getMyDayTodos(todayStr());
    }
    if (viewId === 'important') {
      return todoApi.getImportantTodos();
    }
    if (viewId === 'planned') {
      return todoApi.getPlannedTodos();
    }
    if (viewId === 'all') {
      return todoApi.getAllTodos();
    }
    if (viewId === 'completed') {
      return todoApi.getCompletedTodos();
    }
    return todoApi.getTodosByList(viewId, true);
  }

  // ==================== 任务 CRUD ====================

  async function addTodo(title: string) {
    const view = currentView.value;
    const isSmartList = ['my-day', 'important', 'planned', 'all', 'completed'].includes(view);
    const listId = isSmartList ? 'default-tasks' : view;

    const input = {
      id: genId(),
      listId,
      title,
      isMyDay: view === 'my-day' ? true : undefined,
      isImportant: view === 'important' ? true : undefined,
    };

    const todo = await todoApi.createTodo(input);
    todos.value.unshift(todo);
    loadSmartListCounts();
    notifyTodoMutated();
  }

  async function updateTodo(todoId: string, patch: import('@/contracts/todo').UpdateTodoPayload) {
    const updated = await todoApi.updateTodo(todoId, patch);
    const idx = todos.value.findIndex(t => t.id === todoId);
    if (idx !== -1) todos.value[idx] = updated;
    notifyTodoMutated();
    return updated;
  }

  async function deleteTodo(todoId: string) {
    await todoApi.deleteTodo(todoId);
    todos.value = todos.value.filter(t => t.id !== todoId);
    if (selectedTodoId.value === todoId) selectedTodoId.value = null;
    loadSmartListCounts();
    notifyTodoMutated();
  }

  async function deleteAllTodosInView(viewId: SmartListType | string) {
    const targetTodos = await getTodosForView(viewId);
    if (targetTodos.length === 0) return 0;

    const deletedIds = new Set(targetTodos.map(todo => todo.id));
    for (const todo of targetTodos) {
      await todoApi.deleteTodo(todo.id);
    }

    todos.value = todos.value.filter(todo => !deletedIds.has(todo.id));
    if (selectedTodoId.value && deletedIds.has(selectedTodoId.value)) {
      selectedTodoId.value = null;
    }

    await Promise.all([
      loadSmartListCounts(),
      listStore.loadLists(),
    ]);
    notifyTodoMutated();
    return targetTodos.length;
  }

  async function completeTodo(todoId: string): Promise<CompleteTodoResult> {
    const result = await todoApi.completeTodo(todoId);
    const idx = todos.value.findIndex(t => t.id === todoId);
    if (idx !== -1) todos.value[idx] = result.completedTodo;
    if (result.nextTodo) {
      todos.value.splice(idx + 1, 0, result.nextTodo);
    }
    loadSmartListCounts();
    notifyTodoMutated();
    return result;
  }

  async function uncompleteTodo(todoId: string) {
    const updated = await todoApi.uncompleteTodo(todoId);
    const idx = todos.value.findIndex(t => t.id === todoId);
    if (idx !== -1) todos.value[idx] = updated;
    loadSmartListCounts();
    notifyTodoMutated();
  }

  async function toggleImportant(todoId: string) {
    const todo = todos.value.find(t => t.id === todoId);
    if (!todo) return;
    await updateTodo(todoId, { isImportant: !todo.isImportant });
  }

  async function toggleMyDay(todoId: string) {
    const todo = todos.value.find(t => t.id === todoId);
    if (!todo) return;
    if (todo.isMyDay) {
      await todoApi.removeFromMyDay(todoId);
    } else {
      await todoApi.addToMyDay(todoId, todayStr());
    }
    await loadTodos();
    notifyTodoMutated();
  }

  // ==================== 搜索 ====================

  async function search(query: string) {
    searchQuery.value = query;
    if (!query.trim()) {
      await loadTodos();
      return;
    }
    todos.value = await todoApi.searchTodos(query);
  }

  // ==================== 提醒 ====================

  async function addReminder(todoId: string, remindAt: string) {
    const reminder = await todoApi.createReminder({
      id: genId(),
      todoId,
      remindAt,
    });
    const todo = todos.value.find(t => t.id === todoId);
    if (todo) todo.reminders.push(reminder);
  }

  async function deleteReminder(reminderId: string) {
    await todoApi.deleteReminder(reminderId);
    for (const todo of todos.value) {
      todo.reminders = todo.reminders.filter(r => r.id !== reminderId);
    }
  }

  // ==================== 智能列表计数 ====================

  async function loadSmartListCounts() {
    try {
      const [myDay, important, planned, all, completed] = await Promise.all([
        todoApi.getMyDayTodos(todayStr()),
        todoApi.getImportantTodos(),
        todoApi.getPlannedTodos(),
        todoApi.getAllTodos(),
        todoApi.getCompletedTodos(),
      ]);
      smartListCounts.value = {
        'my-day': myDay.length,
        'important': important.length,
        'planned': planned.length,
        'all': all.length,
        'completed': completed.length,
      };
    } catch (err) {
      console.error('Failed to load smart list counts:', err);
    }
  }

  // ==================== 步骤 ====================

  async function addStep(todoId: string, title: string) {
    const step = await todoApi.createStep({
      id: genId(),
      todoId,
      title,
      sortOrder: (selectedTodo.value?.steps.length ?? 0),
    });
    const todo = todos.value.find(t => t.id === todoId);
    if (todo) todo.steps.push(step);
  }

  async function updateStep(stepId: string, patch: import('@/contracts/todo').UpdateTodoStepPayload) {
    const updated = await todoApi.updateStep(stepId, patch);
    for (const todo of todos.value) {
      const idx = todo.steps.findIndex(s => s.id === stepId);
      if (idx !== -1) {
        todo.steps[idx] = updated;
        break;
      }
    }
  }

  async function deleteStep(stepId: string) {
    await todoApi.deleteStep(stepId);
    for (const todo of todos.value) {
      todo.steps = todo.steps.filter(s => s.id !== stepId);
    }
  }

  // ==================== 昨日未完成 ====================

  async function checkYesterdayIncomplete() {
    // 检查今天是否已忽略过（从 SQLite 读取，兼容旧版 localStorage）
    let dismissedDate: string | null = null;
    try {
      dismissedDate = await todoApi.getDismissedDate();
    } catch {
      // 降级到 localStorage（兼容旧版本）
      dismissedDate = localStorage.getItem('todo_yesterday_dismissed_date');
    }
    if (dismissedDate === todayStr()) {
      showYesterdayPrompt.value = false;
      return;
    }

    const result = await todoApi.getYesterdayIncomplete(todayStr());
    yesterdayIncomplete.value = result;
    showYesterdayPrompt.value = result.length > 0;
  }

  async function addYesterdayToToday(todoIds: string[]) {
    for (const id of todoIds) {
      await todoApi.addToMyDay(id, todayStr());
    }
    // 从列表中移除已添加的项目
    yesterdayIncomplete.value = yesterdayIncomplete.value.filter(t => !todoIds.includes(t.id));
    // 如果全部添加完了，关闭弹窗并标记当天已忽略
    if (yesterdayIncomplete.value.length === 0) {
      showYesterdayPrompt.value = false;
      try {
        await todoApi.setDismissedDate(todayStr());
      } catch {
        localStorage.setItem('todo_yesterday_dismissed_date', todayStr());
      }
    }
    await loadTodos();
  }

  function dismissYesterdayPrompt() {
    showYesterdayPrompt.value = false;
    todoApi.setDismissedDate(todayStr()).catch(() => {
      localStorage.setItem('todo_yesterday_dismissed_date', todayStr());
    });
  }

  function selectTodo(todoId: string | null) {
    selectedTodoId.value = todoId;
  }

  // 监听来自首页 widget 的写操作信号，自动重新加载 Todo 页面当前视图。
  // 注意：loadTodos() 是纯读操作，不会再次触发 notifyTodoMutated，不存在循环。
  let externalReloadTimer: ReturnType<typeof setTimeout> | null = null;
  watch(todoMutationTick, () => {
    // 只有 store 已经被激活（有数据或已选择视图）时才重载，避免冷启动时的无效请求
    if (externalReloadTimer) clearTimeout(externalReloadTimer);
    externalReloadTimer = setTimeout(() => {
      externalReloadTimer = null;
      loadTodos();
      loadSmartListCounts();
    }, 150);
  });

  return {
    currentView,
    todos,
    selectedTodoId,
    selectedTodo,
    loading,
    searchQuery,
    yesterdayIncomplete,
    showYesterdayPrompt,
    incompleteTodos,
    completedTodos,
    sortBy,
    sortedIncompleteTodos,
    smartListCounts,
    switchView,
    loadTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    deleteAllTodosInView,
    completeTodo,
    uncompleteTodo,
    toggleImportant,
    toggleMyDay,
    search,
    addStep,
    updateStep,
    deleteStep,
    addReminder,
    deleteReminder,
    loadSmartListCounts,
    checkYesterdayIncomplete,
    addYesterdayToToday,
    dismissYesterdayPrompt,
    selectTodo,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTodoStore, import.meta.hot));
}
