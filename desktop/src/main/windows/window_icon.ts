import { app } from 'electron';
import path from 'path';

export function resolveWindowIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons', 'app_icon.ico');
  }

  return path.join(app.getAppPath(), 'src', 'assets', 'icons', 'app_icon.ico');
}
