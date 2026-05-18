import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';
import type { TodoList } from '@/contracts/todo';
import { notifyError } from '@/windows/main/composables/useInAppNotification';

declare const todoApi: import('@/contracts/todo').TodoApi;

function genId(): string {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTodoListStore = defineStore('todoList', () => {
  const lists = ref<TodoList[]>([]);
  const loading = ref(false);

  async function loadLists() {
    loading.value = true;
    try {
      lists.value = await todoApi.getAllLists();
    } catch (err) {
      console.error('Failed to load todo lists:', err);
      notifyError(err, '待办清单加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function createList(name: string) {
    const sortOrder = lists.value.length;
    const newList = await todoApi.createList({
      id: genId(),
      name,
      sortOrder,
    });
    lists.value.push(newList);
    return newList;
  }

  async function updateList(listId: string, patch: import('@/contracts/todo').UpdateTodoListPayload) {
    const updated = await todoApi.updateList(listId, patch);
    const idx = lists.value.findIndex(l => l.id === listId);
    if (idx !== -1) lists.value[idx] = updated;
    return updated;
  }

  async function deleteList(listId: string) {
    await todoApi.deleteList(listId);
    lists.value = lists.value.filter(l => l.id !== listId);
  }

  async function reorderLists(ids: string[]) {
    await todoApi.reorderLists(ids);
    await loadLists();
  }

  return {
    lists,
    loading,
    loadLists,
    createList,
    updateList,
    deleteList,
    reorderLists,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTodoListStore, import.meta.hot));
}
