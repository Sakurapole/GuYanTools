import { ref } from 'vue';

/**
 * Todo 数据变更事件总线（模块级单例）
 *
 * 通过响应式计数器实现跨组件通知：
 *  - todo_store 在每次写操作（增/改/删/完成）后调用 notifyTodoMutated()
 *  - 任何需要感知变更的组件（如首页 widget）watch todoMutationTick 并重新加载
 */
const todoMutationTick = ref(0);

export function useTodoEvents() {
  /** 触发变更通知，递增计数器 */
  function notifyTodoMutated() {
    todoMutationTick.value++;
  }

  return {
    /** 响应式变更"时钟"，每次数据写操作后递增 */
    todoMutationTick,
    notifyTodoMutated,
  };
}
