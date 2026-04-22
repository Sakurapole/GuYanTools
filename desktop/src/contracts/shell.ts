export interface SelectFileOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

export interface SaveFileOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
  buttonLabel?: string;
}

export interface ShellApi {
  openPath: (path: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  selectFile: (options?: SelectFileOptions) => Promise<string | null>;
  saveFile: (options?: SaveFileOptions) => Promise<string | null>;
  selectDirectory: (title?: string) => Promise<string | null>;
  writeTextFile: (path: string, content: string) => Promise<void>;
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  readClipboardPaths: () => Promise<string[]>;
}

declare global {
  interface Window {
    shellApi: ShellApi;
  }
}
