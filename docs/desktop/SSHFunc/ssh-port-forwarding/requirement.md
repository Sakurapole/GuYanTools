# SSH 端口转发功能 — 需求规格说明书

> 版本: v1.0  
> 日期: 2026-04-01  
> 状态: 已审批  

---

## 1. 背景概述

GuYanTools 桌面端已具备完整的 SSH 终端连接能力，基于 Rust `russh` (v0.49) 后端 + Electron 前端的架构。现需要在已有 SSH 会话之上，为用户提供 **SSH 端口转发（隧道）** 功能，使其可以通过加密 SSH 隧道安全地访问远程网络中的服务。

### 1.1 当前架构概览

```
Vue 前端 (SshSidebarTab / TerminalPage)
  ↓ IPC
Electron 主进程 (ssh/host.ts + ipc.ts)
  ↓ NAPI
Rust 后端 (SshConnectionManager)
  ↓ SSH 协议
远程主机
```

### 1.2 现有 SSH 能力

- SSH Profile CRUD（支持密码、密钥、Agent 认证）
- SSH 会话管理（连接、断开、终端 I/O、PTY 调整）
- 跳板机（Jump Host）配置（当前为桩实现）
- 已知主机指纹管理（信任/验证/删除）
- 事件总线（SSH 事件实时推送到前端）

### 1.3 技术约束

- `russh` v0.49 原生支持 `direct-tcpip`（本地转发）和 `forward-tcpip`（远程转发）通道
- 当前 `SshSession` 结构体仅保存了 `channel_tx`（命令发送器），端口转发需要共享 `client::Handle` 以在同一 SSH 连接上开启新通道
- 前端基于 Vue 3 + Pinia + SCSS，采用现有 UI 设计系统

---

## 2. 功能需求

### 2.1 端口转发类型支持

| 类型 | SSH 等效命令 | 描述 | 使用场景 | 版本计划 |
|------|-------------|------|----------|----------|
| **本地转发** | `ssh -L` | 本地端口 → SSH隧道 → 远程目标 | 访问远程数据库、内网 Web 服务 | **Phase 1 (MVP)** |
| **远程转发** | `ssh -R` | 远程端口 → SSH隧道 → 本地服务 | 将本地开发服务暴露给远程主机 | Phase 2 |
| **动态转发** | `ssh -D` | 本地 SOCKS5 代理 → SSH隧道 | 全局代理，通过远程主机访问任意地址 | Phase 3 |

### 2.2 Phase 1 功能范围（本地转发 MVP）

#### F1: 端口转发规则管理 (CRUD)

端口转发规则**独立于 SSH 会话**持久化存储，用户可以预先配置转发规则，连接时自动或手动启动。

- **F1.1 创建本地转发规则**
  - 本地监听地址（默认 `127.0.0.1`）
  - 本地监听端口
  - 远程目标地址
  - 远程目标端口
  - 规则标签（可选，便于识别，如 "MySQL数据库"、"Redis缓存"）
  - 关联到一个 SSH Profile
  - "自动启动" 开关

- **F1.2 编辑转发规则**

- **F1.3 删除转发规则**

- **F1.4 转发规则列表**
  - 按关联的 SSH Profile/Session 分组展示
  - 显示当前运行状态（运行中/已停止/错误）

#### F2: 转发运行控制

- **F2.1 启动单条转发**
  - 前提：关联的 SSH 会话已连接
  - 在已有 SSH 连接上打开 `direct-tcpip` 通道
  - 绑定本地 `TcpListener` 并代理流量

- **F2.2 停止单条转发**
  - 关闭本地 `TcpListener`
  - 关闭所有活跃的转发通道

- **F2.3 批量启停**
  - SSH 连接时自动启动标记了 "自动启动" 的规则
  - SSH 断开时自动清理所有转发
  - 一键启停某个 Session 的所有转发规则

- **F2.4 转发状态实时监控**
  - 活跃连接数显示
  - 错误信息实时报告

#### F3: UI 交互

> **决策记录：** 采用方案 C — 可折叠浮动面板嵌入终端底部，不占用终端原有空间。

- **F3.1 端口转发浮动面板**
  - 浮于终端视口底部，不改变终端内容区域大小
  - 可折叠/展开，折叠时仅显示一行摘要（活跃转发数）
  - 展开时显示转发规则列表及状态
  - 拖拽调整面板高度（可选）

- **F3.2 转发列表视图**
  - 每条规则一行：标签、类型图标、本地端口 → 远程目标、状态指示灯
  - 状态颜色：绿色=运行中，灰色=停止，红色=错误，黄色=启动中
  - 启停切换按钮
  - 操作按钮：编辑、删除、复制地址

- **F3.3 添加/编辑转发规则对话框**
  - 类型选择（Phase 1 仅本地转发）
  - 本地监听地址 + 端口
  - 远程目标地址 + 端口
  - 标签输入
  - "自动启动" 开关
  - 端口冲突预检测

- **F3.4 快捷操作**
  - 复制本地转发地址到剪贴板（如 `localhost:8080`）
  - 终端工具栏添加端口转发面板切换按钮

#### F4: 事件通知

- **F4.1 转发状态变更事件**
  - 通过现有 SSH 事件总线推送
  - 新增 eventType: `'forward-state'`、`'forward-error'`

- **F4.2 错误反馈**
  - 端口已被占用 → 明确提示并建议更换端口
  - 远程目标不可达 → 给出诊断信息
  - SSH 连接断开 → 自动停止所有转发并通知用户

---

## 3. 非功能需求

### 3.1 性能要求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 转发建立延迟 | < 500ms | 从点击 "启动" 到转发就绪 |
| 并发转发规则数 | ≥ 20 条/会话 | 单个 SSH 会话上的最大并发转发数 |
| 数据吞吐量 | ≥ 50 MB/s | 端口转发的数据传输速率 |
| 内存开销 | < 10 MB / 转发 | 单条转发规则的额外内存消耗 |
| 连接并发数 | ≥ 100 / 转发端口 | 单个转发端口能同时处理的 TCP 连接数 |

### 3.2 可靠性要求

- **R1** SSH 断线时自动清理所有关联的转发资源（listener、channel），防止端口泄漏
- **R2** 转发规则独立故障：单条转发的失败不应影响同一 SSH 会话上的其他转发或终端 PTY
- **R3** 端口冲突检测：启动前检查本地端口是否已被占用，给出可操作的错误提示
- **R4** 优雅关闭：停止转发时，等待活跃连接完成（最长等待 5s）或强制关闭

### 3.3 安全要求

- **S1** 所有转发流量必须经过 SSH 加密通道，不得出现明文回落
- **S2** 本地监听地址默认绑定 `127.0.0.1`（仅本机访问），用户可选 `0.0.0.0`（需安全警告）
- **S3** 端口号范围限制：不允许用户监听 < 1024 的特权端口（除非有管理员权限）

### 3.4 可用性要求

- **U1** 技术术语提供 Tooltip 说明
- **U2** 转发地址一键复制到剪贴板
- **U3** 表单输入验证实时反馈（端口范围 1-65535、地址格式校验）
- **U4** 保持与现有 SSH 侧栏一致的视觉风格
- **U5** 浮动面板视觉层次清晰，不遮挡终端关键信息

### 3.5 可维护性要求

- **M1** 转发规则持久化在 SQLite 数据库中（新增 migration）
- **M2** Rust 后端与 NAPI 绑定、TypeScript 合约、IPC 处理器遵循现有分层架构
- **M3** 转发管理器在 `SshConnectionManager` 内部管理，复用现有 SSH Handle
- **M4** 通过现有事件总线推送转发状态，不引入新的通信机制

### 3.6 兼容性要求

- **C1** 支持 Windows、macOS、Linux 三平台
- **C2** 与 OpenSSH 服务端的 `AllowTcpForwarding` 配置兼容

---

## 4. 技术设计要点

### 4.1 russh API 支持

| 功能 | API | 状态 |
|------|-----|------|
| 本地转发 (direct-tcpip) | `session.channel_open_direct_tcpip()` | ✅ 完全支持 |
| Channel 多路复用 | 单连接多通道 | ✅ 内建支持 |

### 4.2 核心架构变更

当前 `SshSession` 结构需扩展以保留 `client::Handle`：

```rust
// Phase 1 SshSession (conceptual)
struct SshSession {
    descriptor: Mutex<SshSessionDescriptor>,
    channel_tx: tokio::sync::mpsc::Sender<SshChannelCommand>,
    ssh_handle: Arc<Mutex<client::Handle<SshClientHandler>>>,
    active_forwards: Arc<RwLock<HashMap<String, PortForwardHandle>>>,
}
```

### 4.3 数据模型

```sql
CREATE TABLE IF NOT EXISTS ssh_port_forwards (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES ssh_profiles(id) ON DELETE CASCADE,
    label TEXT,
    forward_type TEXT NOT NULL DEFAULT 'local',
    local_host TEXT NOT NULL DEFAULT '127.0.0.1',
    local_port INTEGER NOT NULL,
    remote_host TEXT NOT NULL,
    remote_port INTEGER NOT NULL,
    auto_start INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssh_port_forwards_profile 
    ON ssh_port_forwards(profile_id);
```

### 4.4 全链路文件改动清单

| 层次 | 文件 | 变更 |
|------|------|------|
| 数据库 | `migrations/012_add_ssh_port_forwards.sql` | [NEW] |
| 数据库注册 | `multi_platform_core/src/db/migration.rs` | [MODIFY] 添加新 migration |
| Rust 模型+逻辑 | `multi_platform_core/src/ssh/mod.rs` | [MODIFY] 扩展 SshSession、新增转发逻辑 |
| NAPI 绑定 | `multi_platform_core/src/bindings/napi.rs` | [MODIFY] JsSshHost 新增方法 |
| TS 合约 | `desktop/src/contracts/ssh.ts` | [MODIFY] 新增类型定义 |
| 主进程 Host | `desktop/src/main/ssh/host.ts` | [MODIFY] 透传方法 |
| 主进程 IPC | `desktop/src/main/ssh/ipc.ts` | [MODIFY] 新增 IPC 句柄 |
| Preload | `desktop/src/preload.ts` | [MODIFY] 暴露 API |
| Pinia Store | `desktop/src/windows/main/stores/ssh_store.ts` | [MODIFY] 新增 state |
| 浮动面板 | `desktop/src/windows/main/pages/Terminal/PortForwardPanel.vue` | [NEW] |
| 添加对话框 | `desktop/src/windows/main/pages/Terminal/PortForwardDialog.vue` | [NEW] |
| 终端页面 | `desktop/src/windows/main/pages/Terminal/TerminalPage.vue` | [MODIFY] 集成浮动面板 |
| 工具栏 | `desktop/src/windows/main/pages/Terminal/TerminalToolbar.vue` | [MODIFY] 添加切换按钮 |

---

## 5. 迭代路线

### Phase 1: 本地转发 MVP（当前实施）
- 修改 SshSession 保留 SSH Handle
- 数据库 migration + 模型
- Rust 本地转发引擎（direct-tcpip + TcpListener）
- 全链路 NAPI → IPC → Store → UI
- 浮动管理面板 + 添加对话框

### Phase 2: 远程转发 + 增强（后续）
- 远程转发（tcpip_forward + Handler 回调）
- 批量启停、自动启动增强
- 转发模板/预设

### Phase 3: 动态转发 + 高级特性（后续）
- SOCKS5 代理实现
- 独立连接模式（首页小卡片）
- 流量统计
- 规则导入/导出
