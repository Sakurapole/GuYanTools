/** IPC contract types for the system tray feature */

export interface TrayApi {
  /** Send quit signal to main process */
  quit: () => void;
  /** Send show-window signal to main process */
  showWindow: () => void;
  /** Subscribe to context-menu events from the tray */
  onContextMenu: (listener: (x: number, y: number) => void) => () => void;
}

