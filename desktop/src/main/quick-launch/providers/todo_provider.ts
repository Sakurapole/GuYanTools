import { dbManager } from '@/core/database';
import type { Todo } from '@/contracts/todo';
import type { QuickLaunchResult } from '@/contracts/quick_launch';
import { compactSnippet, scoreQuickLaunchFields } from '../matcher';
import type { QuickLaunchProvider, QuickLaunchProviderContext } from '../types';

export const todoProvider: QuickLaunchProvider = {
  id: 'todo',
  async search(context: QuickLaunchProviderContext): Promise<QuickLaunchResult[]> {
    if (!context.query.trim() || !dbManager.isInitialized()) {
      return [];
    }

    const todos = await dbManager.getDatabase().searchTodos(context.query) as Todo[];
    return todos
      .map((todo): QuickLaunchResult | null => {
        const subtitle = compactSnippet(todo.note || (todo.isCompleted ? '已完成待办' : '待办任务'));
        const match = scoreQuickLaunchFields(
          context.query,
          { value: todo.title, weight: todo.isCompleted ? 55 : 78 },
          { value: subtitle, weight: 32 },
          [
            { value: todo.id, weight: 12 },
            { value: todo.dueDate ?? '', weight: 18 },
          ],
        );
        if (!match) {
          return null;
        }

        return {
          id: `todo:${todo.id}`,
          providerId: 'todo',
          title: todo.title,
          subtitle,
          detail: todo.dueDate ? `截止 ${todo.dueDate}` : undefined,
          keywords: [todo.id, todo.dueDate ?? ''],
          score: match.score,
          highlights: {
            title: match.titleHighlights,
            subtitle: match.subtitleHighlights,
          },
          action: {
            type: 'open-todo',
            todoId: todo.id,
          },
        } satisfies QuickLaunchResult;
      })
      .filter((item): item is QuickLaunchResult => Boolean(item))
      .slice(0, context.limit);
  },
};
