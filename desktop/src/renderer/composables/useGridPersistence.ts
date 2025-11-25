import type { CategoryItem, GridItem } from '../types/grid';

/**
 * 网格布局持久化 composable
 * 负责从 localStorage 加载和保存网格布局
 */
export function useGridPersistence(storageKey: string) {
  function getLayoutStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function loadCategoryLayout(category: CategoryItem) {
    const storage = getLayoutStorage();
    if (!storage) return;

    const key = `${storageKey}-${category.id}`;
    const raw = storage.getItem(key);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const savedMap = new Map<string, Partial<GridItem>>();
      for (const entry of parsed) {
        if (entry && typeof entry.id === 'string') {
          savedMap.set(entry.id, entry);
        }
      }

      for (const item of category.gridItems) {
        const saved = savedMap.get(item.id);
        if (!saved) continue;

        if (typeof saved.col === 'number' && Number.isFinite(saved.col)) {
          item.col = Math.max(1, Math.floor(saved.col));
        }
        if (typeof saved.row === 'number' && Number.isFinite(saved.row)) {
          item.row = Math.max(1, Math.floor(saved.row));
        }
        if (typeof saved.colSpan === 'number' && Number.isFinite(saved.colSpan) && saved.colSpan > 0) {
          item.colSpan = Math.floor(saved.colSpan);
        }
        if (typeof saved.rowSpan === 'number' && Number.isFinite(saved.rowSpan) && saved.rowSpan > 0) {
          item.rowSpan = Math.floor(saved.rowSpan);
        }
        if (typeof saved.preferredCol === 'number' && Number.isFinite(saved.preferredCol)) {
          item.preferredCol = Math.max(1, Math.floor(saved.preferredCol));
        }
        if (typeof saved.preferredRow === 'number' && Number.isFinite(saved.preferredRow)) {
          item.preferredRow = Math.max(1, Math.floor(saved.preferredRow));
        }
        if (typeof saved.priority === 'number' && Number.isFinite(saved.priority)) {
          item.priority = saved.priority;
        }
        if (typeof saved.hidden === 'boolean') {
          item.hidden = saved.hidden;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  function loadAllCategoryLayouts(categories: CategoryItem[]) {
    for (const category of categories) {
      loadCategoryLayout(category);
    }
  }

  function persistLayout(categoryId: string, gridItems: GridItem[]) {
    const storage = getLayoutStorage();
    if (!storage) return;

    const payload = gridItems.map(item => ({
      id: item.id,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      preferredCol: item.preferredCol,
      preferredRow: item.preferredRow,
      priority: item.priority,
      hidden: item.hidden,
    }));

    try {
      const key = `${storageKey}-${categoryId}`;
      storage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  function saveCategoryList(categories: CategoryItem[]) {
    const storage = getLayoutStorage();
    if (!storage) return;

    const categoryData = categories.map(cat => ({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
    }));

    try {
      storage.setItem('category-list', JSON.stringify(categoryData));
    } catch {
      // ignore storage errors
    }
  }

  function loadCategoryList(): Array<{ id: string; label: string; icon: string }> | null {
    const storage = getLayoutStorage();
    if (!storage) return null;

    const raw = storage.getItem('category-list');
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  return {
    loadCategoryLayout,
    loadAllCategoryLayouts,
    persistLayout,
    saveCategoryList,
    loadCategoryList,
  };
}

