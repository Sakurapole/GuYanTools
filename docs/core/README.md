# Multi-Platform Core

一个基于 Rust + SQLite 的多平台核心库，支持 Electron 和 Flutter。

## 📋 特性

- **统一核心逻辑**：一套 Rust 代码，多端复用
- **SQLite 数据库**：使用 rusqlite + r2d2 连接池
- **自动迁移**：内置数据库迁移机制
- **类型安全**：完整的类型定义和错误处理
- **多平台绑定**：
  - **Electron**: 通过 napi-rs 提供 Node.js 模块
  - **Flutter**: 通过 flutter_rust_bridge 提供 Dart 接口

## 🏗️ 项目结构

```
multi_platform_core/
├── src/
│   ├── lib.rs                  # 库入口
│   ├── db/                     # 数据库核心层
│   │   ├── connection.rs       # 连接池
│   │   ├── error.rs            # 错误类型
│   │   └── migration.rs        # 迁移机制
│   ├── models/                 # 数据模型
│   │   ├── user.rs
│   │   ├── project.rs
│   │   └── setting.rs
│   ├── services/               # 业务逻辑
│   │   ├── user_service.rs
│   │   ├── project_service.rs
│   │   └── setting_service.rs
│   └── bindings/               # 平台绑定
│       ├── napi.rs             # Electron 绑定
│       └── flutter.rs          # Flutter 绑定
├── migrations/                 # SQL 迁移文件
│   ├── 001_init.sql
│   ├── 002_add_projects.sql
│   └── 003_add_settings.sql
└── Cargo.toml
```

## 🚀 快速开始

### 1. 构建 Rust 核心库

```bash
cd multi_platform_core

# 仅构建核心库
cargo build --release

# 构建 Electron 版本
cargo build --release --features napi

# 构建 Flutter 版本
cargo build --release --features flutter
```

### 2. Electron 集成

#### 安装依赖

在 Electron 项目中安装生成的 `.node` 模块：

```bash
npm install ./multi_platform_core
```

#### 使用示例

```typescript
import { JsDatabase } from 'multi-platform-core';

// 创建数据库实例
const db = new JsDatabase('./data.db');

// 创建用户
const user = await db.createUser('Alice', 'alice@example.com', null);
console.log('Created user:', user);

// 列出用户
const users = await db.listUsers(0, 10);
console.log('Users:', users);

// 创建项目
const project = await db.createProject(
  'My Project',
  'A test project',
  user.id
);

// 获取设置
const theme = await db.getSettingValue('theme');
console.log('Theme:', theme);
```

### 3. Flutter 集成

#### 配置 flutter_rust_bridge

1. 安装 flutter_rust_bridge_codegen：

```bash
cargo install flutter_rust_bridge_codegen
```

2. 生成 Dart 绑定：

```bash
flutter_rust_bridge_codegen \
  --rust-input src/bindings/flutter.rs \
  --dart-output ../mobile/lib/bridge/generated.dart
```

#### 使用示例

```dart
import 'package:multi_platform_core/bridge/generated.dart';

// 创建用户
final user = await createUser(
  dbPath: './data.db',
  name: 'Alice',
  email: 'alice@example.com',
  avatar: null,
);
print('Created user: $user');

// 列出用户
final users = await listUsers(
  dbPath: './data.db',
  offset: 0,
  limit: 10,
);
print('Users: $users');

// 获取设置
final theme = await getSettingValue(
  dbPath: './data.db',
  key: 'theme',
);
print('Theme: $theme');
```

## 📚 API 文档

### 用户管理

- `createUser(name, email?, avatar?)` - 创建用户
- `getUser(id)` - 根据 ID 获取用户
- `getUserByEmail(email)` - 根据邮箱获取用户
- `listUsers(offset, limit)` - 列出用户（分页）
- `updateUser(id, name?, email?, avatar?)` - 更新用户
- `deleteUser(id)` - 删除用户
- `countUsers()` - 统计用户总数

### 项目管理

- `createProject(name, description?, ownerId)` - 创建项目
- `getProject(id)` - 根据 ID 获取项目
- `listProjects(offset, limit)` - 列出所有项目
- `listProjectsByOwner(ownerId, offset, limit)` - 列出用户的项目
- `updateProject(id, name?, description?, status?)` - 更新项目
- `deleteProject(id)` - 删除项目

### 设置管理

- `getSetting(key)` - 获取设置对象
- `getSettingValue(key)` - 获取设置值
- `listSettings()` - 列出所有设置
- `upsertSetting(key, value, description?)` - 创建或更新设置
- `deleteSetting(key)` - 删除设置

## 🧪 测试

```bash
# 运行所有测试
cargo test

# 运行特定模块测试
cargo test --lib db
cargo test --lib services
```

## 📝 数据库迁移

迁移文件位于 `migrations/` 目录，按文件名顺序自动执行。

添加新迁移：

1. 创建新的 SQL 文件（如 `004_add_new_table.sql`）
2. 在 `src/db/migration.rs` 中添加迁移条目
3. 重启应用，迁移会自动执行

## 🔧 开发指南

### 添加新功能

1. **定义模型**：在 `src/models/` 中创建新的数据模型
2. **创建迁移**：在 `migrations/` 中添加 SQL 迁移文件
3. **实现服务**：在 `src/services/` 中实现业务逻辑
4. **更新绑定**：在 `src/bindings/` 中暴露新的 API

### 错误处理

所有数据库操作返回 `DbResult<T>`，包含以下错误类型：

- `ConnectionFailed` - 数据库连接失败
- `QueryFailed` - 查询执行失败
- `NotFound` - 记录未找到
- `UniqueConstraintViolation` - 唯一约束冲突
- `ForeignKeyViolation` - 外键约束冲突
- `MigrationFailed` - 迁移失败
- `SerializationError` - 序列化错误
- `InvalidParameter` - 无效参数
- `InternalError` - 内部错误

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
