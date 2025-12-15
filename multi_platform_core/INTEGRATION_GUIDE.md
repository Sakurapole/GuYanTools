# 集成指南

本文档详细说明如何在 Electron 和 Flutter 项目中集成 multi-platform-core。

## Electron 集成详细步骤

### 1. 构建 Rust 库

```bash
cd multi_platform_core
cargo build --release --features napi
```

这会在 `target/release/` 目录生成 `.node` 文件。

### 2. 配置 package.json

在 Electron 项目的 `package.json` 中添加：

```json
{
  "name": "your-electron-app",
  "dependencies": {
    "multi-platform-core": "file:../multi_platform_core"
  },
  "napi": {
    "name": "multi-platform-core",
    "triples": {
      "defaults": true,
      "additional": [
        "x86_64-pc-windows-msvc",
        "x86_64-apple-darwin",
        "aarch64-apple-darwin",
        "x86_64-unknown-linux-gnu"
      ]
    }
  }
}
```

### 3. TypeScript 类型定义

创建 `types/multi-platform-core.d.ts`：

```typescript
declare module 'multi-platform-core' {
  export interface User {
    id: number;
    name: string;
    email: string | null;
    avatar: string | null;
    created_at: string;
    updated_at: string;
  }

  export interface Project {
    id: number;
    name: string;
    description: string | null;
    owner_id: number;
    status: string;
    created_at: string;
    updated_at: string;
  }

  export interface Setting {
    id: number;
    key: string;
    value: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }

  export class JsDatabase {
    constructor(path: string);
    static newInMemory(): JsDatabase;

    // 用户方法
    createUser(
      name: string,
      email?: string | null,
      avatar?: string | null
    ): Promise<User>;
    getUser(id: number): Promise<User>;
    getUserByEmail(email: string): Promise<User>;
    listUsers(offset: number, limit: number): Promise<User[]>;
    updateUser(
      id: number,
      name?: string | null,
      email?: string | null,
      avatar?: string | null
    ): Promise<User>;
    deleteUser(id: number): Promise<void>;
    countUsers(): Promise<number>;

    // 项目方法
    createProject(
      name: string,
      description: string | null,
      ownerId: number
    ): Promise<Project>;
    getProject(id: number): Promise<Project>;
    listProjects(offset: number, limit: number): Promise<Project[]>;
    listProjectsByOwner(
      ownerId: number,
      offset: number,
      limit: number
    ): Promise<Project[]>;
    updateProject(
      id: number,
      name?: string | null,
      description?: string | null,
      status?: string | null
    ): Promise<Project>;
    deleteProject(id: number): Promise<void>;

    // 设置方法
    getSetting(key: string): Promise<Setting>;
    getSettingValue(key: string): Promise<string>;
    listSettings(): Promise<Setting[]>;
    upsertSetting(
      key: string,
      value: string,
      description?: string | null
    ): Promise<Setting>;
    deleteSetting(key: string): Promise<void>;
  }
}
```

### 4. 在主进程中使用

```typescript
// main.ts
import { app } from 'electron';
import { JsDatabase } from 'multi-platform-core';
import path from 'path';

let db: JsDatabase;

app.whenReady().then(async () => {
  // 初始化数据库
  const dbPath = path.join(app.getPath('userData'), 'app.db');
  db = new JsDatabase(dbPath);

  console.log('Database initialized');

  // 测试创建用户
  const user = await db.createUser('Admin', 'admin@example.com', null);
  console.log('Created user:', user);
});
```

### 5. 通过 IPC 暴露给渲染进程

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('db', {
  // 用户
  createUser: (name: string, email?: string, avatar?: string) =>
    ipcRenderer.invoke('db:createUser', name, email, avatar),
  getUser: (id: number) => ipcRenderer.invoke('db:getUser', id),
  listUsers: (offset: number, limit: number) =>
    ipcRenderer.invoke('db:listUsers', offset, limit),

  // 项目
  createProject: (name: string, description: string, ownerId: number) =>
    ipcRenderer.invoke('db:createProject', name, description, ownerId),
  listProjects: (offset: number, limit: number) =>
    ipcRenderer.invoke('db:listProjects', offset, limit),

  // 设置
  getSetting: (key: string) => ipcRenderer.invoke('db:getSetting', key),
  upsertSetting: (key: string, value: string, description?: string) =>
    ipcRenderer.invoke('db:upsertSetting', key, value, description),
});
```

```typescript
// main.ts IPC handlers
import { ipcMain } from 'electron';

ipcMain.handle('db:createUser', async (_, name, email, avatar) => {
  return await db.createUser(name, email, avatar);
});

ipcMain.handle('db:getUser', async (_, id) => {
  return await db.getUser(id);
});

ipcMain.handle('db:listUsers', async (_, offset, limit) => {
  return await db.listUsers(offset, limit);
});

// ... 其他 handlers
```

### 6. 在渲染进程中使用

```typescript
// renderer.ts
declare global {
  interface Window {
    db: {
      createUser: (name: string, email?: string, avatar?: string) => Promise<any>;
      getUser: (id: number) => Promise<any>;
      listUsers: (offset: number, limit: number) => Promise<any[]>;
      // ... 其他方法
    };
  }
}

// 使用
async function loadUsers() {
  const users = await window.db.listUsers(0, 10);
  console.log('Users:', users);
}

async function createNewUser() {
  const user = await window.db.createUser('John Doe', 'john@example.com');
  console.log('Created:', user);
}
```

## Flutter 集成详细步骤

### 1. 安装 flutter_rust_bridge

```bash
cargo install flutter_rust_bridge_codegen
flutter pub add flutter_rust_bridge
flutter pub add ffi
```

### 2. 生成 Dart 绑定

```bash
cd multi_platform_core

flutter_rust_bridge_codegen \
  --rust-input src/bindings/flutter.rs \
  --dart-output ../mobile/lib/bridge/native.dart \
  --dart-decl-output ../mobile/lib/bridge/native.freezed.dart
```

### 3. 配置 Flutter 项目

在 `pubspec.yaml` 中：

```yaml
dependencies:
  flutter:
    sdk: flutter
  ffi: ^2.0.0
  flutter_rust_bridge: ^2.0.0
  freezed_annotation: ^2.0.0

dev_dependencies:
  build_runner: ^2.0.0
  freezed: ^2.0.0
```

### 4. 创建 Rust 库加载器

```dart
// lib/bridge/loader.dart
import 'dart:ffi';
import 'dart:io';
import 'package:flutter_rust_bridge/flutter_rust_bridge.dart';

const base = 'multi_platform_core';

final path = Platform.isWindows
    ? '$base.dll'
    : Platform.isMacOS
        ? 'lib$base.dylib'
        : 'lib$base.so';

late final dylib = Platform.isIOS
    ? DynamicLibrary.process()
    : Platform.isMacOS
        ? DynamicLibrary.executable()
        : DynamicLibrary.open(path);
```

### 5. 创建数据库服务

```dart
// lib/services/database_service.dart
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import '../bridge/native.dart';

class DatabaseService {
  late final String dbPath;

  Future<void> init() async {
    final appDir = await getApplicationDocumentsDirectory();
    dbPath = path.join(appDir.path, 'app.db');
  }

  // 用户方法
  Future<User> createUser({
    required String name,
    String? email,
    String? avatar,
  }) async {
    return await createUser(
      dbPath: dbPath,
      name: name,
      email: email,
      avatar: avatar,
    );
  }

  Future<User> getUser(int id) async {
    return await getUser(dbPath: dbPath, id: id);
  }

  Future<List<User>> listUsers({
    required int offset,
    required int limit,
  }) async {
    return await listUsers(
      dbPath: dbPath,
      offset: offset,
      limit: limit,
    );
  }

  // 项目方法
  Future<Project> createProject({
    required String name,
    String? description,
    required int ownerId,
  }) async {
    return await createProject(
      dbPath: dbPath,
      name: name,
      description: description,
      ownerId: ownerId,
    );
  }

  Future<List<Project>> listProjects({
    required int offset,
    required int limit,
  }) async {
    return await listProjects(
      dbPath: dbPath,
      offset: offset,
      limit: limit,
    );
  }

  // 设置方法
  Future<String> getSettingValue(String key) async {
    return await getSettingValue(dbPath: dbPath, key: key);
  }

  Future<Setting> upsertSetting({
    required String key,
    required String value,
    String? description,
  }) async {
    return await upsertSetting(
      dbPath: dbPath,
      key: key,
      value: value,
      description: description,
    );
  }
}
```

### 6. 在 Flutter 应用中使用

```dart
// lib/main.dart
import 'package:flutter/material.dart';
import 'services/database_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  final db = DatabaseService();
  await db.init();
  
  runApp(MyApp(db: db));
}

class MyApp extends StatelessWidget {
  final DatabaseService db;
  
  const MyApp({required this.db});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: HomePage(db: db),
    );
  }
}

class HomePage extends StatefulWidget {
  final DatabaseService db;
  
  const HomePage({required this.db});

  @override
  _HomePageState createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<User> users = [];

  @override
  void initState() {
    super.initState();
    loadUsers();
  }

  Future<void> loadUsers() async {
    final result = await widget.db.listUsers(offset: 0, limit: 10);
    setState(() {
      users = result;
    });
  }

  Future<void> createUser() async {
    await widget.db.createUser(
      name: 'New User',
      email: 'user@example.com',
    );
    await loadUsers();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Users')),
      body: ListView.builder(
        itemCount: users.length,
        itemBuilder: (context, index) {
          final user = users[index];
          return ListTile(
            title: Text(user.name),
            subtitle: Text(user.email ?? 'No email'),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: createUser,
        child: Icon(Icons.add),
      ),
    );
  }
}
```

## 性能优化建议

### Electron

1. **连接池复用**：在主进程中创建单个数据库实例，避免重复创建
2. **批量操作**：使用事务处理批量插入/更新
3. **异步处理**：所有数据库操作都是异步的，避免阻塞 UI

### Flutter

1. **路径缓存**：缓存数据库路径，避免重复获取
2. **状态管理**：使用 Provider/Riverpod 管理数据库服务
3. **错误处理**：使用 try-catch 包装所有数据库调用

## 故障排查

### Electron

**问题**：找不到 `.node` 模块
- 确保已运行 `cargo build --release --features napi`
- 检查 `package.json` 中的路径配置

**问题**：类型定义不匹配
- 重新生成类型定义文件
- 确保 Rust 和 TypeScript 类型一致

### Flutter

**问题**：无法加载动态库
- 确保已将编译的库文件复制到正确位置
- Android: `android/app/src/main/jniLibs/`
- iOS: 需要配置 Xcode 项目

**问题**：生成的 Dart 代码有错误
- 更新 flutter_rust_bridge 到最新版本
- 重新运行代码生成命令

## 下一步

- 查看 [README.md](./README.md) 了解 API 文档
- 查看 `examples/` 目录获取完整示例
- 阅读源码了解实现细节
