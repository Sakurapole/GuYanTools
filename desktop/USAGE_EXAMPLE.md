# Rust 核心模块使用指南

## 安装依赖

在 `desktop` 目录下运行：

```bash
pnpm install
```

这会自动链接 `../multi_platform_core` 模块。

## 在主进程中使用

### 1. 初始化数据库

```typescript
// src/main/index.ts
import { dbManager } from '@/core/database';

app.whenReady().then(async () => {
  // 使用默认路径（应用数据目录）
  await dbManager.initialize();
  
  // 或指定自定义路径
  // await dbManager.initialize('/path/to/database.db');
  
  // 或使用内存数据库（测试用）
  // await dbManager.initializeInMemory();
  
  createWindow();
});
```

### 2. 用户操作示例

```typescript
import { dbManager } from '@/core/database';

// 创建用户
const user = await dbManager.getDatabase().createUser(
  'LaityH',
  'laityh@example.com',
  'https://avatar.url'
);

// 获取用户
const user = await dbManager.getDatabase().getUser(1);

// 列出用户
const users = await dbManager.getDatabase().listUsers(0, 10);

// 更新用户
const updated = await dbManager.getDatabase().updateUser(
  1,
  'New Name',
  'new@email.com'
);

// 删除用户
await dbManager.getDatabase().deleteUser(1);

// 统计用户数
const count = await dbManager.getDatabase().countUsers();
```

### 3. 项目操作示例

```typescript
// 创建项目
const project = await dbManager.getDatabase().createProject(
  'My Project',
  1, // ownerId
  'Project description'
);

// 获取项目
const project = await dbManager.getDatabase().getProject(1);

// 列出所有项目
const projects = await dbManager.getDatabase().listProjects(0, 10);

// 列出用户的项目
const userProjects = await dbManager.getDatabase().listProjectsByOwner(1, 0, 10);

// 更新项目
const updated = await dbManager.getDatabase().updateProject(
  1,
  'New Name',
  'New description',
  'active'
);

// 删除项目
await dbManager.getDatabase().deleteProject(1);
```

### 4. 设置操作示例

```typescript
// 保存设置
const setting = await dbManager.getDatabase().upsertSetting(
  'theme',
  'dark',
  'UI theme preference'
);

// 获取设置
const setting = await dbManager.getDatabase().getSetting('theme');

// 获取设置值
const value = await dbManager.getDatabase().getSettingValue('theme');

// 列出所有设置
const settings = await dbManager.getDatabase().listSettings();

// 删除设置
await dbManager.getDatabase().deleteSetting('theme');
```

## 在 IPC 中暴露给渲染进程

### 主进程 (main/index.ts)

```typescript
import { ipcMain } from 'electron';
import { dbManager } from '@/core/database';

// 用户相关 IPC
ipcMain.handle('db:createUser', async (_, name: string, email?: string, avatar?: string) => {
  return await dbManager.getDatabase().createUser(name, email, avatar);
});

ipcMain.handle('db:getUser', async (_, id: number) => {
  return await dbManager.getDatabase().getUser(id);
});

ipcMain.handle('db:listUsers', async (_, offset: number, limit: number) => {
  return await dbManager.getDatabase().listUsers(offset, limit);
});

// 项目相关 IPC
ipcMain.handle('db:createProject', async (_, name: string, ownerId: number, description?: string) => {
  return await dbManager.getDatabase().createProject(name, ownerId, description);
});

ipcMain.handle('db:listProjects', async (_, offset: number, limit: number) => {
  return await dbManager.getDatabase().listProjects(offset, limit);
});

// 设置相关 IPC
ipcMain.handle('db:getSetting', async (_, key: string) => {
  return await dbManager.getDatabase().getSetting(key);
});

ipcMain.handle('db:upsertSetting', async (_, key: string, value: string, description?: string) => {
  return await dbManager.getDatabase().upsertSetting(key, value, description);
});
```

### Preload 脚本

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 用户 API
  createUser: (name: string, email?: string, avatar?: string) => 
    ipcRenderer.invoke('db:createUser', name, email, avatar),
  getUser: (id: number) => 
    ipcRenderer.invoke('db:getUser', id),
  listUsers: (offset: number, limit: number) => 
    ipcRenderer.invoke('db:listUsers', offset, limit),
  
  // 项目 API
  createProject: (name: string, ownerId: number, description?: string) => 
    ipcRenderer.invoke('db:createProject', name, ownerId, description),
  listProjects: (offset: number, limit: number) => 
    ipcRenderer.invoke('db:listProjects', offset, limit),
  
  // 设置 API
  getSetting: (key: string) => 
    ipcRenderer.invoke('db:getSetting', key),
  upsertSetting: (key: string, value: string, description?: string) => 
    ipcRenderer.invoke('db:upsertSetting', key, value, description),
});
```

### 渲染进程 (Vue 组件)

```typescript
// 在 Vue 组件中使用
declare global {
  interface Window {
    electronAPI: {
      createUser: (name: string, email?: string, avatar?: string) => Promise<any>;
      getUser: (id: number) => Promise<any>;
      listUsers: (offset: number, limit: number) => Promise<any[]>;
      createProject: (name: string, ownerId: number, description?: string) => Promise<any>;
      listProjects: (offset: number, limit: number) => Promise<any[]>;
      getSetting: (key: string) => Promise<any>;
      upsertSetting: (key: string, value: string, description?: string) => Promise<any>;
    };
  }
}

// 使用示例
const users = await window.electronAPI.listUsers(0, 10);
const user = await window.electronAPI.createUser('LaityH', 'email@example.com');
```

## 重新编译 Rust 模块

当修改 Rust 代码后，需要重新编译：

```bash
cd multi_platform_core
pnpm napi build --platform --release
```

或者在开发模式下（更快）：

```bash
pnpm napi build --platform
```

## 注意事项

1. **路径问题**：`.node` 文件必须能被 Electron 找到，已通过 `index.js` 自动处理平台检测
2. **异步操作**：所有数据库操作都是异步的，返回 Promise
3. **错误处理**：建议使用 try-catch 包裹数据库操作
4. **线程安全**：Rust 模块内部使用 `Arc` 和 `tokio::spawn_blocking` 确保线程安全

## TypeScript 类型支持

已提供完整的 TypeScript 类型定义 (`index.d.ts`)，IDE 会自动提供代码补全和类型检查。
