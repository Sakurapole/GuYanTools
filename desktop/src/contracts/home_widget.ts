import type { BackgroundStyleConfig } from './background';

export type WidgetActionType =
  | 'none'
  | 'external_app'
  | 'internal_route'
  | 'plugin_page'
  | 'plugin_command'
  | 'open_webpage';

export type WebpageOpenMode = 'main_window' | 'new_window';

export type HomeWidgetSourceType = 'builtin' | 'shortcut' | 'plugin';
export type HomeWidgetType =
  | 'shortcut'
  | 'pomodoro'
  | 'date'
  | 'weather'
  | 'todo'
  | 'ftp_profile_group'
  | 'ftp_profile'
  | 'terminal_profile_group'
  | 'terminal_profile'
  | 'connection_layout'
  | 'webview_keepalive'
  | 'plugin';
export type WidgetSizePreset = '2x2' | '4x2' | '4x3' | 'custom';

export type PomodoroWidgetConfig = {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  autoStartNext: boolean;
  enableNotification: boolean;
  enableSound: boolean;
};

export type DateWidgetConfig = {
  displayMode: 'today' | 'calendar';
  weekStartsOn: 'monday' | 'sunday';
  showWeekNumber: boolean;
};

export type WeatherWidgetConfig = {
  city: string;
  unit: 'celsius' | 'fahrenheit';
  refreshMinutes: number;
  showHourly: boolean;
  showDaily: boolean;
};

export type TodoWidgetConfig = {
  view: string;
  allowQuickAdd: boolean;
  showCompleted: boolean;
};

export type FtpProfileGroupWidgetConfig = {
  folderId: string;
};

export type FtpProfileWidgetConfig = {
  profileId: string;
};

export type TerminalProfileGroupWidgetConfig = {
  folderId: string;
};

export type TerminalProfileWidgetConfig = {
  profileKind: 'local' | 'ssh';
  profileId: string;
};

export type ConnectionLayoutWidgetConfig = {
  layoutId: string;
};

export type WidgetConfig =
  | PomodoroWidgetConfig
  | DateWidgetConfig
  | WeatherWidgetConfig
  | TodoWidgetConfig
  | FtpProfileGroupWidgetConfig
  | FtpProfileWidgetConfig
  | TerminalProfileGroupWidgetConfig
  | TerminalProfileWidgetConfig
  | ConnectionLayoutWidgetConfig
  | Record<string, unknown>;

export type WidgetAction = {
  type: WidgetActionType;
  target?: string;
  pluginId?: string;
  pageId?: string;
  commandId?: string;
  url?: string;
  openMode?: WebpageOpenMode;
};

export interface HomeWidgetSurface {
  id: string;
  label: string;
  icon?: string;
  action?: WidgetAction;
  sourceType: HomeWidgetSourceType;
  widgetType: HomeWidgetType;
  sizePreset?: WidgetSizePreset;
  widgetConfig?: WidgetConfig;
  color: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundStyle?: BackgroundStyleConfig;
  hidden: boolean;
}
