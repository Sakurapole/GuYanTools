import type { GridItem } from '../types/grid';

const STORAGE_KEY = 'grid-layout-snapshots';

/**
 * 布局位置快照
 */
type PositionSnapshot = {
  col: number;
  row: number;
  preferredCol: number;
  preferredRow: number;
};

/**
 * 某个列数下的全部 widget 位置快照（序列化格式）
 */
type SerializedSnapshot = Record<string, PositionSnapshot>;

/**
 * 持久化存储格式: categoryId → colNum(string) → { itemId → position }
 */
type SerializedStore = Record<string, Record<string, SerializedSnapshot>>;

/**
 * 某个列数下的全部 widget 位置快照
 */
type LayoutSnapshot = Map<string, PositionSnapshot>;

// ─── 序列化 / 反序列化 ───

function serializeStore(store: Map<string, Map<number, LayoutSnapshot>>): SerializedStore {
  const result: SerializedStore = {};
  for (const [catId, colMap] of store) {
    const colObj: Record<string, SerializedSnapshot> = {};
    for (const [colNum, snapshot] of colMap) {
      const items: SerializedSnapshot = {};
      for (const [itemId, pos] of snapshot) {
        items[itemId] = pos;
      }
      colObj[String(colNum)] = items;
    }
    result[catId] = colObj;
  }
  return result;
}

function deserializeStore(data: SerializedStore): Map<string, Map<number, LayoutSnapshot>> {
  const store = new Map<string, Map<number, LayoutSnapshot>>();
  for (const [catId, colObj] of Object.entries(data)) {
    const colMap = new Map<number, LayoutSnapshot>();
    for (const [colStr, items] of Object.entries(colObj)) {
      const colNum = Number(colStr);
      if (!Number.isFinite(colNum)) continue;
      const snapshot: LayoutSnapshot = new Map();
      for (const [itemId, pos] of Object.entries(items)) {
        snapshot.set(itemId, pos);
      }
      colMap.set(colNum, snapshot);
    }
    store.set(catId, colMap);
  }
  return store;
}

function loadFromStorage(): Map<string, Map<number, LayoutSnapshot>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    return deserializeStore(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

function saveToStorage(store: Map<string, Map<number, LayoutSnapshot>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeStore(store)));
  } catch {
    // localStorage 写入失败（配额等），静默忽略
  }
}

/**
 * 布局记忆 composable
 *
 * 以 `colNum`（列数）为 key，保存每个列数对应的 widget 布局快照。
 * 快照持久化到 localStorage，应用重启后仍可恢复。
 */
export function useGridLayoutMemory() {
  const store = loadFromStorage();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** 防抖写入 localStorage（300ms） */
  function scheduleSave() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveToStorage(store);
    }, 300);
  }

  /**
   * 获取某个 category 的快照仓库（惰性创建）
   */
  function getCategoryStore(categoryId: string): Map<number, LayoutSnapshot> {
    let catStore = store.get(categoryId);
    if (!catStore) {
      catStore = new Map();
      store.set(categoryId, catStore);
    }
    return catStore;
  }

  /**
   * 保存当前布局为 colNum 对应的快照
   */
  function saveSnapshot(categoryId: string, colNum: number, items: GridItem[]): void {
    const catStore = getCategoryStore(categoryId);
    const snapshot: LayoutSnapshot = new Map();

    for (const item of items) {
      if (item.hidden) continue;
      snapshot.set(item.id, {
        col: item.col,
        row: item.row,
        preferredCol: item.preferredCol,
        preferredRow: item.preferredRow,
      });
    }

    catStore.set(colNum, snapshot);
    scheduleSave();
  }

  /**
   * 尝试恢复 colNum 对应的快照到 items 上。
   *
   * 恢复条件：
   * 1. 目标 colNum 存在快照
   * 2. 当前所有可见 item 在快照中都有对应记录
   *
   * @returns `true` 恢复成功；`false` 无可用快照或快照不匹配
   */
  function restoreSnapshot(categoryId: string, colNum: number, items: GridItem[]): boolean {
    const catStore = store.get(categoryId);
    if (!catStore) return false;

    const snapshot = catStore.get(colNum);
    if (!snapshot) return false;

    // 检查所有可见 item 在快照中都有记录
    const visibleItems = items.filter(i => !i.hidden);
    const allPresent = visibleItems.every(item => snapshot.has(item.id));
    if (!allPresent) {
      // 快照已失效（item 列表发生了变化），移除它
      catStore.delete(colNum);
      scheduleSave();
      return false;
    }

    // 恢复位置
    for (const item of visibleItems) {
      const pos = snapshot.get(item.id)!;
      item.col = pos.col;
      item.row = pos.row;
      item.preferredCol = pos.preferredCol;
      item.preferredRow = pos.preferredRow;
    }

    return true;
  }

  /**
   * 清除某个 category 的全部快照（widget 增删后调用）
   */
  function clearCategory(categoryId: string): void {
    store.delete(categoryId);
    scheduleSave();
  }

  /**
   * 清除全部快照
   */
  function clearAll(): void {
    store.clear();
    scheduleSave();
  }

  return {
    saveSnapshot,
    restoreSnapshot,
    clearCategory,
    clearAll,
  };
}
