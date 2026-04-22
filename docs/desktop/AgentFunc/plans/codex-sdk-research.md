# @openai/codex-sdk 技术调研报告

> **调研日期**：2026-03-19  
> **调研目标**：全面了解 `@openai/codex-sdk` 的 API 设计、核心概念和集成方式，为 GuYanTools 的 Codex Agent 模式提供技术基础。

---

## 1. 概述

`@openai/codex-sdk` 是 OpenAI 官方提供的 TypeScript SDK，用于将 Codex Agent 嵌入到应用程序和工作流中。

### 1.1 核心特点

| 特性         | 说明                                                        |
| ------------ | ----------------------------------------------------------- |
| **架构模式** | 封装 `@openai/codex` CLI，通过 stdin/stdout 交换 JSONL 事件 |
| **运行环境** | 需要 Node.js 18+，Codex CLI 作为子进程运行                  |
| **通信协议** | JSONL（JSON Lines）事件流                                   |
| **线程模型** | 基于 Thread 的会话管理，支持持续对话                        |

### 1.2 与直接调用 OpenAI API 的区别

| 对比项         | codex-sdk                                  | OpenAI Chat API          |
| -------------- | ------------------------------------------ | ------------------------ |
| **定位**       | 编码 Agent，具备代码理解和执行能力         | 通用聊天/补全 API        |
| **工具执行**   | SDK 内部自动完成沙箱内的文件操作、命令执行 | 开发者需自行实现工具执行 |
| **上下文**     | 自动感知工作目录中的代码库                 | 需手动构建上下文         |
| **安全模型**   | 内置沙箱机制，Git 仓库校验                 | 无内置安全机制           |
| **会话持久化** | 自动持久化至 `~/.codex/sessions`           | 需开发者自行管理         |

---

## 2. 核心 API 详解

### 2.1 Codex 类（入口）

```typescript
import { Codex } from "@openai/codex-sdk";

// 基础初始化
const codex = new Codex();

// 带配置初始化（适用于 Electron 等沙箱环境）
const codex = new Codex({
  // 控制子进程的环境变量（Electron 中必须显式设置）
  env: {
    PATH: "/usr/local/bin",
    HOME: "/Users/user",
  },
  // CLI 配置覆盖（传递为 --config key=value）
  config: {
    show_raw_agent_reasoning: true,
    sandbox_workspace_write: { network_access: true },
  },
  // 自定义 API 基础 URL（传递为 --config openai_base_url=...）
  baseUrl: "https://custom-api.example.com/v1",
});
```

**关键点**：
- SDK 会自动注入 `CODEX_API_KEY` 等必要变量
- 在 Electron 主进程中使用时，需显式传递 `env`，否则 CLI 可能拿不到环境变量
- `config` 选项会被展平成点号路径，序列化为 TOML 字面值

### 2.2 Thread（线程/会话）

```typescript
// 创建新线程
const thread = codex.startThread();

// 指定工作目录
const thread = codex.startThread({
  workingDirectory: "/path/to/project",
  skipGitRepoCheck: true, // 跳过 Git 仓库校验（Codex 默认要求目录是 Git 仓库）
});

// 恢复已有线程（线程持久化在 ~/.codex/sessions）
const thread = codex.resumeThread(savedThreadId);
```

### 2.3 run() — 同步运行

```typescript
// 基础用法
const turn = await thread.run("Diagnose the test failure and propose a fix");

// 访问结果
console.log(turn.finalResponse);  // 最终文本响应
console.log(turn.items);          // 所有中间事件项

// 多轮对话（复用同一 Thread）
const nextTurn = await thread.run("Implement the fix");
```

### 2.4 runStreamed() — 流式运行

```typescript
const { events } = await thread.runStreamed(
  "Diagnose the test failure and propose a fix"
);

for await (const event of events) {
  switch (event.type) {
    case "item.completed":
      console.log("item", event.item);
      break;
    case "turn.completed":
      console.log("usage", event.usage);
      break;
  }
}
```

**事件类型**：

| 事件类型         | 说明                                 |
| ---------------- | ------------------------------------ |
| `item.completed` | 一个项目完成（如工具调用、文本输出） |
| `turn.completed` | 整个轮次完成，包含 usage 统计        |

### 2.5 结构化输出

```typescript
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    status: { type: "string", enum: ["ok", "action_required"] },
  },
  required: ["summary", "status"],
  additionalProperties: false,
} as const;

const turn = await thread.run("Summarize repository status", {
  outputSchema: schema,
});
// turn.finalResponse 符合 schema 定义
```

### 2.6 图片输入

```typescript
const turn = await thread.run([
  { type: "text", text: "Describe these screenshots" },
  { type: "local_image", path: "./ui.png" },
  { type: "local_image", path: "./diagram.jpg" },
]);
```

---

## 3. 在 Electron 应用中集成 Codex SDK 的关键考量

### 3.1 进程模型

```
┌──────────────────┐     IPC      ┌──────────────────┐
│  Renderer Process │ ◄──────►    │   Main Process    │
│  (Vue 3 UI)      │             │   Codex 实例      │
│                  │             │   ├── startThread()│
│                  │             │   ├── run()        │
│                  │             │   └── runStreamed() │
│                  │             │        │           │
│                  │             │        ▼           │
│                  │             │   codex CLI        │
│                  │             │   (子进程)          │
└──────────────────┘             └──────────────────┘
```

**核心原则**：
- Codex SDK **只能在 Electron 主进程中运行**（因为它需要 spawn 子进程）
- 渲染进程通过 IPC 通信驱动 Codex 操作
- 流式事件通过 `webContents.send()` 推送到渲染进程

### 3.2 环境变量处理

Electron 应用打包后，子进程的环境变量可能丢失。必须显式传递：

```typescript
const codex = new Codex({
  env: {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || process.env.USERPROFILE || "",
    OPENAI_API_KEY: apiKeyFromConfig,
    // Electron 特有：确保 node_modules/.bin 在 PATH 中
  },
});
```

### 3.3 工作目录管理

- Codex 默认要求工作目录是 Git 仓库
- 可通过 `skipGitRepoCheck: true` 跳过校验
- 建议让用户选择项目目录，而非使用应用安装目录

### 3.4 UI 集成模式

Codex Agent 与普通聊天的核心区别在于 **UI 需要展示代码执行过程**：

| UI 元素          | 说明                        |
| ---------------- | --------------------------- |
| **终端输出面板** | 展示 Codex 执行的命令和输出 |
| **文件变更面板** | 展示 Codex 修改的文件 diff  |
| **代码预览**     | 展示当前工作目录代码上下文  |
| **操作确认**     | 危险操作前请求用户确认      |
| **进度指示器**   | 展示 Agent 当前正在做什么   |

---

## 4. 与 General Agent 的对比

| 特性         | Codex Agent (Code Agent)                 | General Agent (自定义 Agent)       |
| ------------ | ---------------------------------------- | ---------------------------------- |
| **核心 SDK** | `@openai/codex-sdk`                      | `openai`/`@anthropic-ai/sdk` 等    |
| **UI 风格**  | 类终端/IDE 风格，高度自定义              | 类聊天界面，对话风格               |
| **工具执行** | SDK 内置（文件读写、命令执行、代码分析） | 开发者自定义 Tool 实现             |
| **上下文**   | 自动感知项目代码                         | 手动构建上下文                     |
| **会话模型** | Thread（多轮对话，自动持久化）           | 自定义 Conversation 管理           |
| **安全模型** | 内置沙箱                                 | 需自行实现安全策略                 |
| **适用场景** | 代码调试、重构、生成、项目分析           | 问答、文档生成、数据分析等通用任务 |

---

## 5. 集成风险与缓解措施

| 风险                | 影响                 | 缓解措施                                 |
| ------------------- | -------------------- | ---------------------------------------- |
| Codex CLI 未安装    | 无法使用 Codex Agent | 启动前检测，提供安装引导                 |
| 环境变量丢失        | CLI 启动失败         | 显式传递 env                             |
| API Key 泄露        | 安全风险             | 仅主进程持有，不传入渲染进程             |
| 工作目录非 Git 仓库 | 默认报错             | 使用 `skipGitRepoCheck` 或提示用户初始化 |
| 子进程资源占用      | 性能问题             | 不使用时销毁 Codex 实例，单例管理        |
| 长时间未响应        | 用户体验差           | 设置超时机制，流式 UI 反馈               |

---

## 6. 推荐集成方案

### 6.1 Codex Agent 服务（主进程）

```typescript
class CodexAgentService {
  private codex: Codex | null = null;
  private activeThreads = new Map<string, Thread>();

  // 初始化 Codex 实例
  async initialize(apiKey: string, config?: CodexConfig): Promise<void> {
    this.codex = new Codex({
      env: {
        PATH: process.env.PATH || "",
        HOME: process.env.HOME || process.env.USERPROFILE || "",
        OPENAI_API_KEY: apiKey,
      },
      config: config?.cliConfig,
    });
  }

  // 创建新线程
  startThread(workingDirectory: string): string {
    if (!this.codex) throw new Error("Codex not initialized");
    const thread = this.codex.startThread({
      workingDirectory,
      skipGitRepoCheck: false,
    });
    const threadId = crypto.randomUUID();
    this.activeThreads.set(threadId, thread);
    return threadId;
  }

  // 流式执行（推送事件到渲染进程）
  async runStreamed(
    threadId: string,
    prompt: string,
    webContents: WebContents
  ): Promise<void> {
    const thread = this.activeThreads.get(threadId);
    if (!thread) throw new Error("Thread not found");

    const { events } = await thread.runStreamed(prompt);
    for await (const event of events) {
      webContents.send("codex:event", { threadId, event });
    }
  }

  // 销毁
  destroy(): void {
    this.activeThreads.clear();
    this.codex = null;
  }
}
```

### 6.2 生命周期管理

1. **应用启动** → 不立即创建 Codex 实例（懒初始化）
2. **用户打开 Codex Agent 页面** → 检测 Codex CLI、初始化实例
3. **用户创建代码会话** → `startThread()` 
4. **用户发送提示** → `runStreamed()` 推送事件
5. **用户关闭页面** → 销毁线程
6. **应用退出** → `destroy()` 清理资源

---

## 7. 结论

`@openai/codex-sdk` 的设计理念是 **"将 CLI 能力封装为编程接口"**，其核心价值在于：

1. **自动代码上下文感知** — 无需手动构建项目上下文
2. **内置安全沙箱** — 文件操作和命令执行有安全保障
3. **线程化会话管理** — 无需自行实现持久化
4. **流式事件驱动** — 天然适配实时 UI 更新

在 GuYanTools 的 Codex Agent 模式中，核心逻辑全部由 SDK 完成，应用层只需关注：
- **UI 渲染**：自定义终端/IDE 风格的代码 Agent 界面
- **事件转发**：主进程 ↔ 渲染进程的 IPC 转发
- **配置管理**：API Key、工作目录、CLI 配置
- **生命周期管理**：Codex 实例和线程的创建/销毁
