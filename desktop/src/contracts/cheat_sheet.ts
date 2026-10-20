export interface CheatSheetQuestion {
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

export type CheatSheetSummary = Omit<CheatSheetQuestion, 'markdown'>;
export interface SaveCheatSheetQuestion { id?: string; title: string; markdown: string }

export const CHEAT_SHEET_READING_SHORTCUTS = [
  { id: 'previous', label: '上一题', accelerator: 'CommandOrControl+Alt+Left' },
  { id: 'next', label: '下一题', accelerator: 'CommandOrControl+Alt+Right' },
  { id: 'scroll-up', label: '向上滚动', accelerator: 'CommandOrControl+Alt+Up' },
  { id: 'scroll-down', label: '向下滚动', accelerator: 'CommandOrControl+Alt+Down' },
  { id: 'page-up', label: '上一页', accelerator: 'CommandOrControl+Alt+PageUp' },
  { id: 'page-down', label: '下一页', accelerator: 'CommandOrControl+Alt+PageDown' },
  { id: 'opacity-down', label: '降低透明度', accelerator: 'CommandOrControl+Alt+-' },
  { id: 'opacity-up', label: '提高透明度', accelerator: 'CommandOrControl+Alt+=' },
  { id: 'move-left', label: '向左移动', accelerator: 'CommandOrControl+Alt+Shift+Left' },
  { id: 'move-right', label: '向右移动', accelerator: 'CommandOrControl+Alt+Shift+Right' },
  { id: 'move-up', label: '向上移动', accelerator: 'CommandOrControl+Alt+Shift+Up' },
  { id: 'move-down', label: '向下移动', accelerator: 'CommandOrControl+Alt+Shift+Down' },
  { id: 'shrink', label: '缩小窗口', accelerator: 'CommandOrControl+Alt+Shift+-' },
  { id: 'grow', label: '放大窗口', accelerator: 'CommandOrControl+Alt+Shift+=' },
  { id: 'reset', label: '恢复可读窗口', accelerator: 'CommandOrControl+Alt+0' },
  { id: 'pin', label: '切换置顶', accelerator: 'CommandOrControl+Alt+T' },
  { id: 'close', label: '关闭窗口', accelerator: 'CommandOrControl+Alt+Shift+Q' },
] as const;
export const CHEAT_SHEET_INTERNAL_SHORTCUTS = [
  { id: 'search', label: '搜索标题', accelerator: 'CommandOrControl+F' },
  { id: 'new', label: '新增题目', accelerator: 'CommandOrControl+N' },
  { id: 'edit', label: '编辑题目', accelerator: 'CommandOrControl+E' },
  { id: 'save', label: '保存题目', accelerator: 'CommandOrControl+S' },
  { id: 'delete', label: '删除题目', accelerator: 'CommandOrControl+Shift+Delete' },
  { id: 'import', label: '导入 Markdown', accelerator: 'CommandOrControl+O' },
  { id: 'export', label: '导出当前题目', accelerator: 'CommandOrControl+Shift+S' },
  { id: 'help', label: '快捷键帮助', accelerator: 'F1' },
  { id: 'settings', label: '快捷键设置', accelerator: 'CommandOrControl+,' },
] as const;
export type CheatSheetReadingCommand = (typeof CHEAT_SHEET_READING_SHORTCUTS)[number]['id'];
export type CheatSheetInternalCommand = (typeof CHEAT_SHEET_INTERNAL_SHORTCUTS)[number]['id'];
export type CheatSheetCommand = CheatSheetReadingCommand | 'toggle' | 'search' | 'hide';
export interface CheatSheetSettings {
  opacity: number;
  alwaysOnTop: boolean;
  lastQuestionId: string | null;
  shortcuts: Record<CheatSheetReadingCommand, string>;
  internalShortcuts: Record<CheatSheetInternalCommand, string>;
}
export type CheatSheetSettingsPatch = Partial<Omit<CheatSheetSettings, 'shortcuts' | 'internalShortcuts'>> & {
  shortcuts?: Partial<CheatSheetSettings['shortcuts']>;
  internalShortcuts?: Partial<CheatSheetSettings['internalShortcuts']>;
};
export function createDefaultCheatSheetSettings(): CheatSheetSettings {
  return {
    opacity: 0.9, alwaysOnTop: true, lastQuestionId: null,
    shortcuts: Object.fromEntries(CHEAT_SHEET_READING_SHORTCUTS.map((s) => [s.id, s.accelerator])) as CheatSheetSettings['shortcuts'],
    internalShortcuts: Object.fromEntries(CHEAT_SHEET_INTERNAL_SHORTCUTS.map((s) => [s.id, s.accelerator])) as CheatSheetSettings['internalShortcuts'],
  };
}
export interface CheatSheetDocument { schemaVersion: 1; questions: CheatSheetQuestion[]; settings: CheatSheetSettings }
export interface CheatSheetShortcutStatus { id: string; accelerator: string; status: 'registered' | 'conflict' | 'invalid' | 'empty'; message: string }
export interface CheatSheetState {
  questions: CheatSheetSummary[];
  settings: CheatSheetSettings;
  protected: boolean;
  shortcutStatus: CheatSheetShortcutStatus[];
}
export interface CheatSheetApi {
  open(): Promise<void>;
  getState(): Promise<CheatSheetState>;
  getQuestion(id: string): Promise<CheatSheetQuestion | null>;
  saveQuestion(input: SaveCheatSheetQuestion): Promise<CheatSheetQuestion>;
  deleteQuestion(id: string): Promise<void>;
  importMarkdown(): Promise<number>;
  exportMarkdown(id: string): Promise<boolean>;
  updateSettings(patch: CheatSheetSettingsPatch): Promise<CheatSheetState>;
  command(command: CheatSheetCommand): Promise<void>;
  setDirty(dirty: boolean): Promise<void>;
  retryShortcuts(): Promise<CheatSheetShortcutStatus[]>;
  ready(): Promise<void>;
  onCommand(listener: (command: CheatSheetCommand) => void): () => void;
  onStateChanged(listener: () => void): () => void;
}
declare global { interface Window { cheatSheetApi: CheatSheetApi } }
