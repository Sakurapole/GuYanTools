# 快速开始指南

> Electron 集成现已统一为 `pnpm workspace + @guyantools/core + napi build --features napi`。以下涉及 Electron 的命令以根目录 `pnpm` 脚本为准。

## 🎯 5 分钟上手

### 前置要求

- Rust 1.70+
- Node.js 18+ (Electron 项目)
- Flutter 3.0+ (Flutter 项目)

### 步骤 1: 构建核心库

```bash
cd multi_platform_core

# 测试核心功能
cargo test

# 构建 Electron 版本
pnpm build

# 或构建 Flutter 版本
cargo build --release --features flutter
```

### 步骤 2: Electron 快速集成

#### 2.1 在 Electron 项目中安装

```bash
cd ..
pnpm install
pnpm run desktop:start
```

#### 2.2 在主进程中使用

```typescript
// main.ts
import { app } from 'electron';
import { JsDatabase } from 'multi-platform-core';
import path from 'path';

let db: JsDatabase;

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'app.db');
  db = new JsDatabase(dbPath);
  
  // 测试
  const user = await db.createUser('Admin', 'admin@example.com', null);
  console.log('✓ 用户创建成功:', user);
  
  const users = await db.listUsers(0, 10);
  console.log('✓ 用户列表:', users);
});
```

### 步骤 3: Flutter 快速集成

#### 3.1 生成 Dart 绑定

```bash
# 安装代码生成工具
cargo install flutter_rust_bridge_codegen

# 生成绑定
cd multi_platform_core
flutter_rust_bridge_codegen \
  --rust-input src/bindings/flutter.rs \
  --dart-output ../mobile/lib/bridge/native.dart
```

#### 3.2 在 Flutter 中使用

```dart
// lib/main.dart
import 'package:path_provider/path_provider.dart';
import 'bridge/native.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  final appDir = await getApplicationDocumentsDirectory();
  final dbPath = '${appDir.path}/app.db';
  
  // 测试
  final user = await createUser(
    dbPath: dbPath,
    name: 'Admin',
    email: 'admin@example.com',
    avatar: null,
  );
  print('✓ 用户创建成功: $user');
  
  final users = await listUsers(dbPath: dbPath, offset: 0, limit: 10);
  print('✓ 用户列表: $users');
  
  runApp(MyApp());
}
```

## 🧪 验证安装

### 运行测试

```bash
cd multi_platform_core

# 运行所有测试
cargo test

# 运行特定测试
cargo test user_crud
cargo test project_crud
cargo test setting_operations
```

预期输出：
```
running 3 tests
test services::user_service::tests::test_user_crud ... ok
test services::project_service::tests::test_project_crud ... ok
test services::setting_service::tests::test_setting_operations ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured
```

### 检查构建产物

#### Electron (napi)
```bash
# Windows
ls target/release/multi_platform_core.dll

# macOS
ls target/release/libmulti_platform_core.dylib

# Linux
ls target/release/libmulti_platform_core.so
```

#### Flutter
```bash
# 检查生成的 Dart 文件
ls ../mobile/lib/bridge/native.dart
```

## 📝 常见问题

### Q: 编译失败怎么办？

**A:** 确保安装了所有依赖：

```bash
# 更新 Rust
rustup update

# 清理并重新构建
cargo clean
pnpm --dir multi_platform_core build
```

### Q: napi-rs 找不到模块？

**A:** 检查以下几点：

1. 确保已构建 release 版本
2. 确保构建命令带有 `--features napi`
3. 重新安装依赖：`pnpm install`

### Q: Flutter 绑定生成失败？

**A:** 确保版本兼容：

```bash
# 更新工具
cargo install flutter_rust_bridge_codegen --force

# 检查 Flutter 版本
flutter --version
```

### Q: 数据库迁移失败？

**A:** 检查迁移文件：

```bash
# 查看迁移文件
ls migrations/

# 应该包含：
# 001_init.sql
# 002_add_projects.sql
# 003_add_settings.sql
```

## 🚀 下一步

1. **阅读完整文档**
   - [README.md](./README.md) - API 文档
   - [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - 详细集成指南

2. **查看示例代码**
   - Electron 示例：`../desktop/src/main/`
   - Flutter 示例：`../mobile/lib/`

3. **自定义扩展**
   - 添加新的数据模型
   - 实现自定义业务逻辑
   - 扩展 API 接口

## 💡 最佳实践

### Electron

```typescript
// 使用单例模式管理数据库
class DatabaseManager {
  private static instance: JsDatabase;
  
  static getInstance(): JsDatabase {
    if (!this.instance) {
      const dbPath = path.join(app.getPath('userData'), 'app.db');
      this.instance = new JsDatabase(dbPath);
    }
    return this.instance;
  }
}

// 使用
const db = DatabaseManager.getInstance();
```

### Flutter

```dart
// 使用 Provider 管理数据库
class DatabaseProvider extends ChangeNotifier {
  late String dbPath;
  
  Future<void> init() async {
    final appDir = await getApplicationDocumentsDirectory();
    dbPath = '${appDir.path}/app.db';
  }
  
  Future<User> createUser(String name, String? email) async {
    final user = await createUser(
      dbPath: dbPath,
      name: name,
      email: email,
      avatar: null,
    );
    notifyListeners();
    return user;
  }
}
```

## 🎉 完成！

现在你已经成功集成了 multi-platform-core！

如有问题，请查看：
- [故障排查指南](./INTEGRATION_GUIDE.md#故障排查)
- [GitHub Issues](https://github.com/your-repo/issues)
