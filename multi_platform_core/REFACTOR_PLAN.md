# Rust 模块拆分方案

## 一、现状分析

### 1.1 当前结构

```
multi_platform_core/src/
├── lib.rs                          (21 行)    入口
├── db/
│   ├── mod.rs                      (8 行)
│   ├── connection.rs               (175 行)   数据库连接池
│   ├── error.rs                    (71 行)    错误类型
│   └── migration.rs                (113 行)   迁移管理
├── models/
│   ├── mod.rs                      (19 行)
│   ├── user.rs                     (33 行)
│   ├── project.rs                  (34 行)
│   ├── setting.rs                  (25 行)
│   ├── todo.rs                     (149 行)
│   └── home_layout.rs             (206 行)
├── services/
│   ├── mod.rs                      (11 行)
│   ├── user_service.rs             (224 行)
│   ├── project_service.rs          (245 行)
│   ├── setting_service.rs          (158 行)
│   ├── todo_service.rs             (970 行)
│   └── home_layout_service.rs      (699 行)
├── terminal/
│   └── mod.rs                      (769 行)   终端管理（含平台检测）
├── ssh/
│   └── mod.rs                      (2507 行)  SSH 全部逻辑
├── ftp/
│   └── mod.rs                      (5631 行)  FTP/SFTP 全部逻辑
└── bindings/
    ├── mod.rs                      (6 行)
    ├── napi.rs                     (1706 行)  Electron 绑定
    └── flutter.rs                  (~200 行)  Flutter 绑定
```

### 1.2 核心问题

| 问题 | 影响 |
|------|------|
| `ftp/mod.rs` 5631 行，`ssh/mod.rs` 2507 行 | 单文件过大，难以维护和阅读 |
| SSH 模块混合了 Profile CRUD、连接管理、端口转发引擎、SOCKS5 代理、Known Hosts、凭据加解密 | 职责不清，修改一处风险高 |
| FTP 模块混合了 Profile CRUD、FTP/FTPS/SFTP 三种协议、文件操作、传输队列 | 同上 |
| Terminal 模块混合了 Profile 检测（平台相关）和 Session 管理 | 平台检测逻辑与运行时管理耦合 |
| SSH/FTP/Terminal 三个模块各自实现了 EventSink（napi 线程安全回调） | 重复代码 |
| SSH/FTP 模块各自内嵌了凭据加解密逻辑 | 重复逻辑且无法统一安全策略 |

---

## 二、拆分方案

### 阶段一：单 crate 内子模块拆分（推荐先做）

不改变 crate 结构，仅将大文件拆分为子模块。改动最小、风险最低。

#### 2.1.1 `ssh/` 拆分

**目标结构：**

```
src/ssh/
├── mod.rs              (~80 行)   re-exports + SshConnectionManager 公共接口
├── models.rs           (~300 行)  所有数据结构（SshProfile, SshPortForward, SshEventEnvelope 等）
├── handler.rs          (~130 行)  SshClientHandler（russh Handler 实现 + 远程转发回调）
├── profile.rs          (~250 行)  Profile CRUD（list/get/create/update/delete）
├── connection.rs       (~350 行)  连接管理（connect/disconnect/write/resize + run_ssh_session）
├── port_forward.rs     (~700 行)  端口转发引擎（local/remote/dynamic/SOCKS5 + 流量统计）
├── forward_crud.rs     (~200 行)  端口转发规则 CRUD（list/get/create/update/delete + import/export）
├── known_hosts.rs      (~130 行)  Known Host 管理（list/verify/trust/delete）
├── credentials.rs      (~80 行)   凭据加解密（encrypt/decrypt/resolve helpers）
└── platform/
    ├── mod.rs          (~20 行)   平台分发
    ├── agent.rs        (~30 行)   SSH Agent 认证（stub）
    └── jump_host.rs    (~30 行)   Jump Host 连接（stub）
```

**拆分原则：**

| 子模块 | 职责 | 依赖 |
|--------|------|------|
| `models` | 纯数据结构 + Serialize/Deserialize | serde, napi(可选) |
| `handler` | russh Handler trait 实现 | russh, models |
| `profile` | SSH Profile 的数据库 CRUD | db, models, credentials |
| `connection` | 连接生命周期（connect/disconnect/write/resize） | handler, models, db, port_forward |
| `port_forward` | 端口转发运行时引擎 | handler, models, connection |
| `forward_crud` | 端口转发规则的数据库操作 | db, models |
| `known_hosts` | Known Host 指纹管理 | db, models |
| `credentials` | 凭据存储与加解密 | db |

#### 2.1.2 `ftp/` 拆分

**目标结构：**

```
src/ftp/
├── mod.rs              (~100 行)  re-exports + FtpConnectionManager 公共接口
├── models.rs           (~300 行)  所有数据结构（FtpProfile, FtpFileEntry, TransferItem 等）
├── profile.rs          (~300 行)  Profile CRUD + 文件夹 CRUD
├── connection.rs       (~500 行)  连接管理（FTP/FTPS/SFTP 三种协议的连接建立与断开）
├── operations.rs       (~800 行)  文件操作（list/download/upload/delete/rename/mkdir/chmod）
├── transfer.rs         (~600 行)  传输队列管理（队列调度、断点续传、进度回调）
├── watcher.rs          (~400 行)  远程目录监控
├── credentials.rs      (~80 行)   凭据处理（复用或引用通用凭据模块）
└── protocol/
    ├── mod.rs          (~30 行)   协议抽象
    ├── ftp_raw.rs      (~400 行)  原始 FTP/FTPS 协议操作（suppaftp 封装）
    └── sftp_raw.rs     (~400 行)  SFTP 协议操作（russh-sftp 封装）
```

> 进度备注（2026-04-03）：
> `models / profile / connection / operations / transfer / credentials / protocol` 已按阶段一拆出。
> `watcher.rs` 暂缓，不是因为拆分未完成，而是当前代码库中尚无现成的远程目录监控实现可供抽取；该项应作为后续新增能力处理。

**拆分原则：**

| 子模块 | 职责 | 依赖 |
|--------|------|------|
| `models` | 纯数据结构 | serde, napi(可选) |
| `profile` | FTP Profile + Folder 的数据库 CRUD | db, models |
| `connection` | 三种协议的连接建立/断开/保持 | protocol, models, credentials |
| `operations` | 文件/目录操作的业务逻辑 | connection, models |
| `transfer` | 传输队列、进度、断点续传 | operations, models |
| `watcher` | 远程目录变更监控 | connection, models |
| `protocol` | 底层协议适配（FTP/SFTP 的差异屏蔽） | suppaftp, russh-sftp |

#### 2.1.3 `terminal/` 拆分

**目标结构：**

```
src/terminal/
├── mod.rs              (~350 行)  re-exports + TerminalSessionManager
├── models.rs           (~80 行)   数据结构（TerminalProfile, SessionDescriptor 等）
└── profiles.rs         (~350 行)  平台终端 Profile 检测（Windows/Unix）
```

拆分较小，主要是将 `models` 和 `profiles` 抽离，`mod.rs` 只保留 `TerminalSessionManager`。

#### 2.1.4 `bindings/` 拆分

```
src/bindings/
├── mod.rs              (6 行，不变)
├── napi/
│   ├── mod.rs          (~100 行)  模块初始化 + JsDatabase + JsServiceHost
│   ├── terminal.rs     (~200 行)  JsTerminalHost
│   ├── ssh.rs          (~400 行)  JsSshHost
│   └── ftp.rs          (~1000 行) JsFtpHost
└── flutter.rs          (不变)
```

napi.rs 1706 行可按业务域拆分为独立文件，每个 napi wrapper 类一个文件。

---

### 阶段二：提取共享模块

#### 2.2.1 通用 Event Sink

SSH、FTP、Terminal 都实现了相同的 napi ThreadsafeFunction 事件推送模式。

```
src/event.rs            (~100 行)
```

提供统一的 `EventEmitter` trait 和 napi `EventSink` 封装，消除三个模块中的重复 emit_event 逻辑。

> 进度备注（2026-04-03）：
> `src/event.rs` 已落地，SSH / FTP / Terminal 已切换到共享事件发射底座，消除了重复的 `ThreadsafeFunction` 非阻塞发射逻辑。

#### 2.2.2 通用凭据加密

SSH 和 FTP 都有凭据存储/读取逻辑。

```
src/crypto.rs           (~80 行)
```

将 `encrypt_credential` / `decrypt_credential` 提取为共享模块，SSH 和 FTP 都引用它。未来替换为 AES-256-GCM 时只需改一处。

> 进度备注（2026-04-03）：
> 阶段二已启动，优先落地 `src/crypto.rs`，统一 SSH/FTP 的凭据加解密实现。

---

### 阶段三：Cargo Workspace 多 crate 拆分（可选，视后续需求）

当项目规模进一步增长时，可考虑拆分为 workspace：

```
multi_platform_core/
├── Cargo.toml                  workspace 根
├── crates/
│   ├── core-db/
│   │   └── src/                db 模块（connection, error, migration）
│   ├── core-models/
│   │   └── src/                models 模块
│   ├── core-services/
│   │   └── src/                services 模块
│   ├── core-terminal/
│   │   └── src/                terminal 模块
│   ├── core-ssh/
│   │   └── src/                ssh 模块
│   ├── core-ftp/
│   │   └── src/                ftp 模块
│   └── multi-platform-core/
│       └── src/                facade crate，依赖上述 crate + bindings
└── migrations/                 SQL 迁移文件（共享）
```

**workspace 依赖关系：**

```
multi-platform-core  →  core-ssh, core-ftp, core-terminal, core-services
core-ssh             →  core-db
core-ftp             →  core-db, core-ssh (SFTP 复用 SSH 连接)
core-terminal        →  (独立，无 db 依赖)
core-services        →  core-db, core-models
core-models          →  (纯数据结构，无依赖)
core-db              →  (rusqlite, r2d2)
```

**好处：**
- 各 crate 可独立编译测试，CI 增量编译更快
- 强制模块间依赖清晰化
- 各模块版本可独立发布

**代价：**
- 初期迁移成本较高
- workspace 配置维护
- crate 间 API 设计需要更多考虑

**建议：** 阶段一和阶段二完成并稳定运行后，再根据实际痛点决定是否进入阶段三。

---

## 三、执行计划

### 优先级排序

| 优先级 | 任务 | 预估改动量 | 理由 |
|--------|------|-----------|------|
| P0 | `ssh/` 子模块拆分 | 中 | 2507 行，是当前最大的维护痛点之一 |
| P0 | `ftp/` 子模块拆分 | 大 | 5631 行，最急需拆分的模块 |
| P1 | 提取 `crypto.rs` 共享凭据模块 | 小 | SSH/FTP 共用，消除重复 |
| P1 | 提取 `event.rs` 共享事件模块 | 小 | 三处重复代码统一 |
| P2 | `terminal/` 子模块拆分 | 小 | 769 行，拆分收益有限但结构更清晰 |
| P2 | `bindings/napi/` 子模块拆分 | 中 | 1706 行，按业务域拆更易维护 |
| P3 | Cargo Workspace 多 crate | 大 | 等阶段一二稳定后再评估 |

### 迁移步骤（以 ssh 为例）

1. 创建 `src/ssh/models.rs`，将所有 `struct`/`enum` 移入
2. 创建 `src/ssh/handler.rs`，将 `SshClientHandler` 移入
3. 创建 `src/ssh/credentials.rs`，将 `encrypt_credential`/`decrypt_credential` 移入
4. 创建 `src/ssh/profile.rs`，将 profile CRUD 方法从 `SshConnectionManager` 提取为独立函数或 struct
5. 创建 `src/ssh/known_hosts.rs`，将 known host 方法提取
6. 创建 `src/ssh/port_forward.rs`，将端口转发运行时逻辑提取
7. 创建 `src/ssh/forward_crud.rs`，将端口转发 CRUD 提取
8. 创建 `src/ssh/connection.rs`，保留 `SshConnectionManager` 核心和连接管理方法
9. 更新 `src/ssh/mod.rs` 为 re-exports
10. 运行 `cargo test` 确保所有测试通过
11. 更新 `bindings/napi.rs` 中的 import 路径（如有变化）

**每拆出一个子模块就跑一次 `cargo check` + `cargo test`，确保渐进式迁移不出错。**

---

## 四、拆分后的最终目录结构

```
src/
├── lib.rs
├── crypto.rs                   共享凭据加解密
├── event.rs                    共享事件发射器
├── db/
│   ├── mod.rs
│   ├── connection.rs
│   ├── error.rs
│   └── migration.rs
├── models/
│   ├── mod.rs
│   ├── user.rs
│   ├── project.rs
│   ├── setting.rs
│   ├── todo.rs
│   └── home_layout.rs
├── services/
│   ├── mod.rs
│   ├── user_service.rs
│   ├── project_service.rs
│   ├── setting_service.rs
│   ├── todo_service.rs
│   └── home_layout_service.rs
├── terminal/
│   ├── mod.rs
│   ├── models.rs
│   └── profiles.rs
├── ssh/
│   ├── mod.rs
│   ├── models.rs
│   ├── handler.rs
│   ├── profile.rs
│   ├── connection.rs
│   ├── port_forward.rs
│   ├── forward_crud.rs
│   ├── known_hosts.rs
│   ├── credentials.rs
│   └── platform/
│       ├── mod.rs
│       ├── agent.rs
│       └── jump_host.rs
├── ftp/
│   ├── mod.rs
│   ├── models.rs
│   ├── profile.rs
│   ├── connection.rs
│   ├── operations.rs
│   ├── transfer.rs
│   ├── watcher.rs
│   ├── credentials.rs
│   └── protocol/
│       ├── mod.rs
│       ├── ftp_raw.rs
│       └── sftp_raw.rs
└── bindings/
    ├── mod.rs
    ├── napi/
    │   ├── mod.rs
    │   ├── terminal.rs
    │   ├── ssh.rs
    │   └── ftp.rs
    └── flutter.rs
```
