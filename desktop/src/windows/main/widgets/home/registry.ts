import type {
  DateWidgetConfig,
  HomeWidgetSourceType,
  HomeWidgetType,
  PomodoroWidgetConfig,
  TodoWidgetConfig,
  WeatherWidgetConfig,
  WidgetConfig,
  WidgetSizePreset,
} from '../../types/grid';

export type WidgetSizeDefinition = {
  preset: WidgetSizePreset;
  label: string;
  description: string;
  colSpan: number;
  rowSpan: number;
};

export type HomeWidgetDefinition = {
  sourceType: HomeWidgetSourceType;
  widgetType: HomeWidgetType;
  title: string;
  description: string;
  defaultLabel: string;
  defaultIcon?: string;
  defaultColor: string;
  allowAction: boolean;
  allowCustomIcon: boolean;
  supportedSizes: WidgetSizeDefinition[];
  createDefaultConfig: () => WidgetConfig | undefined;
};

const builtinSizes: WidgetSizeDefinition[] = [
  { preset: '2x2', label: '2 × 2', description: '紧凑卡片', colSpan: 2, rowSpan: 2 },
  { preset: '4x2', label: '4 × 2', description: '标准卡片', colSpan: 4, rowSpan: 2 },
  { preset: '4x3', label: '4 × 3', description: '信息完整卡片', colSpan: 4, rowSpan: 3 },
];

export const HOME_WIDGET_DEFINITIONS: HomeWidgetDefinition[] = [
  {
    sourceType: 'builtin',
    widgetType: 'pomodoro',
    title: '番茄钟',
    description: '专注计时、休息轮换和完成统计。',
    defaultLabel: '番茄钟',
    defaultIcon: 'mdi:timer-outline',
    defaultColor: 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)',
    allowAction: false,
    allowCustomIcon: false,
    supportedSizes: builtinSizes,
    createDefaultConfig: (): PomodoroWidgetConfig => ({
      workMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartNext: false,
      enableNotification: true,
      enableSound: false,
    }),
  },
  {
    sourceType: 'builtin',
    widgetType: 'date',
    title: '日期',
    description: '展示今日信息和月历视图。',
    defaultLabel: '日期',
    defaultIcon: 'mdi:calendar-month-outline',
    defaultColor: 'linear-gradient(135deg, #0f172a 0%, #2563eb 100%)',
    allowAction: false,
    allowCustomIcon: false,
    supportedSizes: builtinSizes,
    createDefaultConfig: (): DateWidgetConfig => ({
      displayMode: 'today',
      weekStartsOn: 'monday',
      showWeekNumber: true,
    }),
  },
  {
    sourceType: 'builtin',
    widgetType: 'weather',
    title: '天气',
    description: '展示当前天气、小时趋势和未来预报。',
    defaultLabel: '天气',
    defaultIcon: 'mdi:weather-partly-cloudy',
    defaultColor: 'linear-gradient(135deg, #0891b2 0%, #38bdf8 100%)',
    allowAction: false,
    allowCustomIcon: false,
    supportedSizes: builtinSizes,
    createDefaultConfig: (): WeatherWidgetConfig => ({
      city: '上海',
      unit: 'celsius',
      refreshMinutes: 30,
      showHourly: true,
      showDaily: true,
    }),
  },
  {
    sourceType: 'builtin',
    widgetType: 'todo',
    title: '待办清单',
    description: '展示待办任务列表，支持快速新增与完成操作。',
    defaultLabel: '待办清单',
    defaultIcon: 'mdi:check-circle-outline',
    defaultColor: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a4f 100%)',
    allowAction: false,
    allowCustomIcon: false,
    supportedSizes: builtinSizes,
    createDefaultConfig: (): TodoWidgetConfig => ({
      view: 'my-day',
      allowQuickAdd: true,
      showCompleted: false,
    }),
  },
  {
    sourceType: 'shortcut',
    widgetType: 'shortcut',
    title: '快捷卡片',
    description: '保留原有的图标 + 标题 + 动作卡片。',
    defaultLabel: '新组件',
    defaultIcon: 'mdi:application-outline',
    defaultColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    allowAction: true,
    allowCustomIcon: true,
    supportedSizes: [],
    createDefaultConfig: () => undefined,
  },
];

const widgetDefinitionMap = new Map(HOME_WIDGET_DEFINITIONS.map(definition => [definition.widgetType, definition]));

export function getHomeWidgetDefinition(widgetType: HomeWidgetType): HomeWidgetDefinition {
  return widgetDefinitionMap.get(widgetType) ?? widgetDefinitionMap.get('shortcut')!;
}

export function getWidgetSizeDefinition(widgetType: HomeWidgetType, preset?: string | null): WidgetSizeDefinition | undefined {
  const definition = getHomeWidgetDefinition(widgetType);
  return definition.supportedSizes.find(item => item.preset === preset);
}

export function findWidgetSizePreset(widgetType: HomeWidgetType, colSpan: number, rowSpan: number): WidgetSizePreset {
  const definition = getHomeWidgetDefinition(widgetType);
  const matched = definition.supportedSizes.find(item => item.colSpan === colSpan && item.rowSpan === rowSpan);
  return matched?.preset ?? 'custom';
}

function toPositiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}

export function normalizeWidgetConfig(widgetType: HomeWidgetType, value: WidgetConfig | undefined): WidgetConfig | undefined {
  if (widgetType === 'pomodoro') {
    const raw = (value ?? {}) as Partial<PomodoroWidgetConfig>;
    return {
      workMinutes: toPositiveInteger(raw.workMinutes, 25),
      shortBreakMinutes: toPositiveInteger(raw.shortBreakMinutes, 5),
      longBreakMinutes: toPositiveInteger(raw.longBreakMinutes, 15),
      longBreakInterval: toPositiveInteger(raw.longBreakInterval, 4),
      autoStartNext: toBoolean(raw.autoStartNext, false),
      enableNotification: toBoolean(raw.enableNotification, true),
      enableSound: toBoolean(raw.enableSound, false),
    } satisfies PomodoroWidgetConfig;
  }

  if (widgetType === 'date') {
    const raw = (value ?? {}) as Partial<DateWidgetConfig>;
    return {
      displayMode: raw.displayMode === 'calendar' ? 'calendar' : 'today',
      weekStartsOn: raw.weekStartsOn === 'sunday' ? 'sunday' : 'monday',
      showWeekNumber: toBoolean(raw.showWeekNumber, true),
    } satisfies DateWidgetConfig;
  }

  if (widgetType === 'weather') {
    const raw = (value ?? {}) as Partial<WeatherWidgetConfig>;
    return {
      city: typeof raw.city === 'string' && raw.city.trim() ? raw.city.trim() : '上海',
      unit: raw.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      refreshMinutes: toPositiveInteger(raw.refreshMinutes, 30),
      showHourly: toBoolean(raw.showHourly, true),
      showDaily: toBoolean(raw.showDaily, true),
    } satisfies WeatherWidgetConfig;
  }

  if (widgetType === 'todo') {
    const raw = (value ?? {}) as Partial<TodoWidgetConfig>;
    const validViews = ['my-day', 'important', 'planned', 'all', 'completed'];
    const view = typeof raw.view === 'string' && raw.view.trim() ? raw.view.trim() : 'my-day';
    return {
      view: validViews.includes(view) || view.startsWith('list-') ? view : 'my-day',
      allowQuickAdd: toBoolean(raw.allowQuickAdd, true),
      showCompleted: toBoolean(raw.showCompleted, false),
    } satisfies TodoWidgetConfig;
  }

  return value;
}
