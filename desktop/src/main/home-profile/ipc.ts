import { ipcMain } from 'electron';
import { dbManager } from '../../core/database';
import type { DeleteHomeProfileResult, HomeProfileDto } from '@/contracts/home_profile';

let registered = false;

export async function getActiveHomeWorkspaceKey(): Promise<string> {
  return dbManager.getDatabase().getActiveHomeWorkspaceKey();
}

function serializeProfile(profile: any): HomeProfileDto {
  return {
    id: profile.id,
    key: profile.key,
    name: profile.name,
    isDefault: Boolean(profile.isDefault),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function listProfiles(): Promise<HomeProfileDto[]> {
  const profiles = await dbManager.getDatabase().listHomeWorkspaces();
  return profiles.map(serializeProfile);
}

export function registerHomeProfileIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('home-profile:list', async () => {
    return listProfiles();
  });

  ipcMain.handle('home-profile:get-active', async () => {
    return getActiveHomeWorkspaceKey();
  });

  ipcMain.handle('home-profile:set-active', async (_event, key: string) => {
    const profile = await dbManager.getDatabase().setActiveHomeWorkspaceKey(key);
    return serializeProfile(profile);
  });

  ipcMain.handle('home-profile:create', async (_event, input: { name: string }) => {
    const profile = await dbManager.getDatabase().createHomeWorkspace(input.name);
    return serializeProfile(profile);
  });

  ipcMain.handle('home-profile:rename', async (_event, key: string, name: string) => {
    const profile = await dbManager.getDatabase().renameHomeWorkspace(key, name);
    return serializeProfile(profile);
  });

  ipcMain.handle('home-profile:delete', async (_event, key: string) => {
    const activeProfileKey = await dbManager.getDatabase().deleteHomeWorkspace(key);
    const profiles = await listProfiles();
    return { activeProfileKey, profiles } satisfies DeleteHomeProfileResult;
  });

  registered = true;
}
