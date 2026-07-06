# GuYanTools 项目改进报告（2026-06-15）

> 范围：全仓库（desktop / multi_platform_core / mobile / docs / 工程化）
> 形态：体检报告 + 分级行动清单。本文只做诊断与方向，不写逐行实现方案；具体落地由后续 spec → plan 流程承接。
> 数据来源：基于 2026-06-15 的 `codex/0.0.4-dev` 分支快照，行数与计数口径见[附录 A](#附录-a数据来源与口径)。

---

## 1. 概览

### 1.1 体检方法

按子系统通读结构、统计文件规模与重复模式、核对文档与现状一致性、检查工程化基线（CI / 测试 / lint / 文件编码），重点关注影响**安全、可维护性、迭代速度**的项。产品方向与设计语言以 `PRODUCT.md` / `DESIGN.md` 为基准，工程约束以 `AGENTS.md` 为基准。

### 1.2 总体健康度

| 子系统 | 评级 | 一句话结论 |
|---|---|---|
| 凭据与数据安全 | 🔴 红 | 密码以可逆编码存盘，无真正加密 |
| 工程化 / CI / 测试 | 🔴 红 | 无 PR 级质量门，renderer 零测试 |
| Rust core 结构 | 🟡 黄 | ssh/ftp 已按 REFACTOR_PLAN 拆分，但新模块再次膨胀 |
| 桌面端 renderer 结构 | 🟡 黄 | 巨型页面文件集中，store/components 治理可改善 |
| 源码完整性 | 🟡 黄 | 存在编码损坏的源文件（error.rs） |
| i18n | 🟡 黄 | 框架已搭好但 key 库基本为空，等于未启用 |
| 设计系统治理 | 🟡 黄 | token 规则在，但白名单在持续打洞 |
| 移动端 | 🟡 黄 | 框架就位，核心能力（剪贴板同步等）未落地 |
| IPC 契约一致性 | 🟡 黄 | 表面巨大（367 入口），靠人工同步 |
| 文档体系 | 🟢 绿 | 结构清晰、版本归一，少量陈旧 |

**总体判断**：架构方向是对的（模块边界、契约、设计系统、迁移机制都到位），主要风险集中在**安全基线缺失**和**工程化护栏不足**两点——前者是数据风险，后者会让上面这些结构债务持续再生。

### 1.3 分级原则

- **P0**：安全 / 数据完整性 / 阻塞发版的风险。必须优先处理。
- **P1**：当前正在阻碍迭代、放大每次改动风险的结构债。
- **P2**：体验 / 一致性 / 长线健康度。不紧急但值得排期。
- **P3**：可选优化，等前两级稳定后再评估。

---

## 2. 安全 · 凭据加密（P0）

### 2.1 现状证据

`multi_platform_core/src/crypto.rs`：

```rust
// encrypt_credential 实际实现
let encoded = plaintext.bytes().fold(String::new(), |mut acc, value| {
    let _ = write!(acc, "{:02x}", value);   // 仅 hex 编码
    acc
});
Ok(format!("b64:{}", encoded))              // 前缀名为 b64 实为 hex
```

- 函数名与 `b64:` 前缀暗示 base64/加密，实际是**十六进制编码**，完全可逆、无密钥。
- 代码内已有注释 `TODO: replace with AES-256-GCM using a machine-derived key`，说明这是已知占位实现，但一直未落地。
- SSH 与 FTP 的密码、私钥 passphrase 等均经此路径写入 SQLite（`ssh/credentials.rs`、`ftp/credentials.rs` 引用），即**用户凭据以可逆明文形态落盘**。

### 2.2 影响

- 本机任意能读到 db 文件的进程都可还原全部 SSH/FTP 密码。
- 多设备剪贴板（mDNS）若将来同步含凭据的配置，风险会外溢到局域网。
- 与 `PRODUCT.md` 「可信、可靠」的产品人格直接冲突。

### 2.3 行动清单

- [x] **P0-A** 引入真正的凭据加密：AES-256-GCM，密钥由机器级派生（Windows DPAPI / macOS Keychain / Linux Secret Service，已有 `keyring` 依赖可选启用），或落回 OS keyring 存储。
- [ ] **P0-B** 兼容性迁移：识别旧 `b64:`(hex) 记录，按需懒解密、写入新格式，保证升级不丢配置。
- [x] **P0-C** 明确前缀语义（重命名 `b64:` 为真实方案标识，如 `aes-gcm:`），避免前缀误导后续维护。
- [x] **P0-D** 在 `crypto.rs` 补加密/解密往返单测与错误路径测试（当前该模块无 `#[cfg(test)]`）。

> P0-B 当前已完成旧 `b64:`(hex) 记录的兼容解密，保证升级后仍可读取；尚未实现对已落库旧记录的批量或懒重写，因此仍保留未完成。

**涉及范围**：`multi_platform_core/src/crypto.rs`、`ssh/credentials.rs`、`ftp/credentials.rs`、迁移文件、bindings 层（无需改 TS 契约形状，仅存储格式）。

---

## 3. 工程化 · CI 与测试体系（P0 / P1）

### 3.1 现状证据

- `.github/workflows/` 只有 1 个 `desktop-release.yml`，**仅由 tag / 手动触发**用于发版打包。
- **没有 PR 级流水线**：lint、tsc、cargo test、design-system lint 均无自动化执行。
- 桌面端 renderer **0 个单元测试**（`*.spec.ts` / `*.test.ts` 全仓为 0）。
- Rust 侧有 13 处 `#[cfg(test)]`，覆盖 db / 部分 service，但 `ftp/transfer.rs`(3553 行)、`knowledge_service.rs`(3812 行)、`napi.rs`(2840 行) 等核心重灾区无测试。
- `mobile/test/` 仅 2 个 dart 测试文件。
- 已有一批质量脚本（`verify-*.cjs`、`check-design-system.mjs`），但都依赖本地手动执行。

### 3.2 影响

- 任何改动都没有自动化兜底，回归全靠人眼与发版后用户反馈。
- 巨型文件 + 无测试，每次重构风险极高，间接让结构债固化。
- 新贡献者无法靠 CI 验证自己的改动是否合规。

### 3.3 行动清单

- [x] **P0-E** 新增 PR 级 CI（如 `.github/workflows/ci.yml`），至少跑：
  - `pnpm install --frozen-lockfile`
  - `pnpm --dir desktop run lint`
  - `desktop` 侧 tsc 类型检查（当前 `tsconfig.json` 设 `noEmit`，需补一个 `tsc --noEmit` 入口）
  - `cargo test --manifest-path multi_platform_core/Cargo.toml`（带 `desktop-native` feature）
  - `pnpm --dir desktop run lint:design-system`
- [x] **P0-F** 给 CI 加上 `pnpm install` 与 Rust build 缓存（actions cache），避免每次全量编译。
- [ ] **P1-G** 为 Rust 重灾区（transfer / knowledge_service / napi 绑定层）补关键路径单测，目标先覆盖「写入→读取→序列化」往返与错误分支。
- [ ] **P1-H** renderer 引入测试基线：先从纯函数工具（`utils/`、`composables/` 中的纯逻辑）入手，建立 vitest 配置与一个示范用例，再逐步覆盖 store。
- [x] **P1-I** 把现有 `verify-*.cjs` 脚本接入 CI（quick-launch / shortcuts / workspace-window / ai-chat / knowledge-editor），让「特性验收脚本」成为合并门槛而不是文档。

### 3.4 已落地记录（2026-06-16）

- 新增 `.github/workflows/ci.yml`，在 `pull_request` 与 `main` / `develop` push 上运行桌面 lint、typecheck、设计系统检查、特性 verify 聚合和 Rust `desktop-native` 测试。
- `desktop/package.json` 新增 `typecheck`、`verify:ci`、`verify:features`，其中 `verify:features` 聚合 knowledge-editor、ai-chat、quick-launch、shortcuts、workspace-window、sync-center、sync-mappers、sync-webdav、sync-server、ci-baseline。
- 新增 `desktop/scripts/verify-ci-baseline.cjs`，防止 CI workflow 或关键脚本入口被后续改动漏删。
- 新增 `desktop/scripts/verify-source-encoding.cjs` 与 `verify:encoding`，扫描 desktop / core / sync_server / mobile / docs 的源码与文档文本文件，排除构建产物、依赖、vendor 和临时目录。
- 为让 typecheck 成为真实质量门，修复 quick-launch provider/filter 推断与 service 隐式返回类型问题。
- 本地验证通过：`pnpm --dir desktop run lint`、`pnpm --dir desktop run typecheck`、`pnpm --dir desktop run lint:design-system`、`pnpm --dir desktop run verify:features`、`cargo test --manifest-path multi_platform_core/Cargo.toml --features desktop-native`。

### 3.5 安全与源码完整性落地记录（2026-06-16）

- `multi_platform_core/src/crypto.rs` 的新写入凭据格式改为 `aes-gcm:v1:<nonce_hex>:<cipher_hex>`，使用 AES-256-GCM 加密，不再写入误导性的 `b64:` hex 占位格式。
- 旧 `b64:` hex 凭据仍可解密，避免升级后 SSH / FTP 已保存凭据立刻不可读；旧记录批量重写或懒重写仍作为 P0-B 后续项保留。
- `crypto.rs` 新增加密/解密往返、旧格式兼容和错误路径测试。验证通过：`cargo test --manifest-path multi_platform_core/Cargo.toml crypto::tests --features desktop-native`、`cargo check --manifest-path multi_platform_core/Cargo.toml --features desktop-native`、`cargo test --manifest-path multi_platform_core/Cargo.toml --features desktop-native`。
- `multi_platform_core/src/db/error.rs` 当前已能按 UTF-8 正常读取；新增源码编码守护后，后续非 UTF-8 源文件会在 `verify:features` 中失败。

**涉及范围**：`.github/workflows/`、`desktop/package.json`（补 `typecheck` script）、可选新增 `vitest` 依赖、`mobile/` analysis。

---

## 4. Rust core · 巨型模块与结构债（P1）

### 4.1 现状证据

`REFACTOR_PLAN.md` 记录的 ssh / ftp / terminal 拆分**已基本落地**（`ssh/` 已有 models/handler/profile/connection/port_forward 等子模块，`ftp/` 已拆出 models/profile/connection/operations/transfer/credentials/protocol）。但**新膨胀的模块没有跟进**：

| 文件 | 行数 | 说明 |
|---|---|---|
| `services/knowledge_service.rs` | 3812 | 知识库全量业务，单文件最大 |
| `ftp/transfer.rs` | 3553 | 传输队列 + 断点续传 + 树形进度 |
| `bindings/napi.rs` | 2840 | 单文件承载全部 napi 绑定 |
| `frb_generated.rs` | 2306 | 自动生成，无需手工拆，但需在 .gitignore 评估 |
| `services/home_layout_service.rs` | 1238 | 首页布局 + 多端布局 |
| `services/ai_service.rs` | 1178 | AI 对话 / canvas / research |

- `REFACTOR_PLAN.md` 阶段一里**明确列了 `bindings/napi/` 拆分**（terminal.rs / ssh.rs / ftp.rs），但 `bindings/` 下仍只有 `napi.rs`、`flutter.rs`、`mod.rs`，未拆。
- `knowledge_service.rs` 在 REFACTOR_PLAN 中根本未出现——它是计划之后新增的债务。
- 迁移机制：`db/migration.rs` 把 28 条迁移写死成一条 `Vec`，且测试里含一个「024 已应用则补建 025 canvas 表」的 repair hack（`test_repair_ai_canvas_tables_when_024_was_already_applied`），说明历史上迁移之间已出现兼容修补需求。

### 4.2 影响

- 单文件 3000+ 行的 service / transfer，修改一处需通读全文，code review 与回归成本高。
- `napi.rs` 2840 行未拆，新增 IPC 能力时容易在巨型文件里随意堆叠，与 `AGENTS.md`「按领域拆分」的约束背离。
- 迁移写死 Vec + 手工补 repair，迁移增多后容易错编号、漏注册。

### 4.3 行动清单

- [ ] **P1-J** 拆分 `services/knowledge_service.rs`：按「libraries / spaces / notes / quick_notes / search(fts) / import」切分子模块，参照已完成的 ftp 拆分模式。
- [ ] **P1-K** 拆分 `ftp/transfer.rs`：队列调度 / 进度回调 / 断点续传 / 树形历史分离。
- [ ] **P1-L** 执行 REFACTOR_PLAN 阶段一遗留项 `bindings/napi/` 拆分（terminal.rs / ssh.rs / ftp.rs / 新增 knowledge.rs / ai.rs），与新增能力同步。
- [ ] **P2-M** 评估迁移机制升级：用目录扫描 + 数字前缀排序自动发现迁移，去掉手工 Vec；把 repair 逻辑显式化（独立的 forward-only fixup 或迁移内 `IF NOT EXISTS`）。
- [ ] **P2-N** 评估 `frb_generated.rs` 是否应作为生成产物纳入版本控制（当前在 src 下，2306 行），或在 CI 中按需生成。

**涉及范围**：`multi_platform_core/src/services/`、`ftp/`、`bindings/`、`db/migration.rs`。

---

## 5. 桌面端 renderer · 巨型组件与状态管理（P1）

### 5.1 现状证据

| 文件 | 行数 |
|---|---|
| `pages/Settings.vue` | 5595 |
| `pages/Knowledge/KnowledgePage.vue` | 5052 |
| `pages/Ftp/FtpPage.vue` | 4868 |
| `pages/Terminal/TerminalPage.vue` | 3380 |
| `Knowledge/components/KnowledgeMarkdownEditor.vue` | 1796 |
| `components/ui/UiPersonalizationConfig.vue` | 1602 |
| `Knowledge/components/block/KnowledgeBlockRenderer.vue` | 1544 |
| `Knowledge/components/KnowledgeBlockEditor.vue` | 1530 |
| `stores/knowledge_store.ts` | 1494 |
| `stores/ssh_store.ts` | 1179 |
| `pages/Ftp/components/FtpBrowserPanel.vue` | 1173 |

- `Settings.vue` 单文件 5595 行，把所有设置 tab 揉在一起，与 `ISSUES.md`「每个 tab 支持个性化」的演进方向冲突。
- stores 数量已多（19 个），但 `knowledge_store.ts` 1494 行表明部分 store 内聚过重。
- 已有健全的 `components/ui/`（~45 个通用组件）和 `assets/*.scss` token 体系，重构的脚手架是现成的。

### 5.2 影响

- 巨型 `.vue` 文件导致 diff 噪声大、scoped 样式与逻辑纠缠、热更新与编译变慢。
- 页面级状态与组件级状态边界模糊，store 易膨胀。
- 新人难以接手单个页面。

### 5.3 行动清单

- [ ] **P1-O** 按子工作流拆分三个巨型页面：`Settings.vue`（每个 tab 一个子组件 + 路由级懒加载）、`KnowledgePage.vue`（列表/编辑/搜索/快编分离）、`FtpPage.vue`（浏览器 / 队列 / 同步面板分离）。Terminal 次之。
- [ ] **P1-P** 拆分 `knowledge_store.ts`：把 notes / spaces / quick_notes / search 拆为独立 store 或 composable，参照已成熟的 ai_*_store 分文件模式。
- [ ] **P2-Q** 明确「页面级临时态用 composable / ref，跨页持久态用 store」的边界，写进 `AGENTS.md` 的 Vue 章节。
- [ ] **P2-R** 复盘 `ISSUES.md`（desktop）：条目几乎全部 `[X]` 完成，转为「历史 changelog」归档，避免与现行需求混淆；真正未完成的（如「首页视频背景自动循环」）单独提为 issue。

**涉及范围**：`desktop/src/windows/main/pages/`、`stores/`、`composables/`。

---

## 6. 源码完整性（P1）

### 6.1 现状证据

- `multi_platform_core/src/db/error.rs` 的中文注释在以 UTF-8 读取时**显示为乱码**（疑似以 GBK 编码保存）。这是源码里的真实编码问题，不是读取工具问题——其他 Rust 文件的中文注释显示正常，唯独此文件损坏。
- 该文件定义了全部 `DbError` 枚举，是错误链路的根，编码异常会在某些工具链下（如跨平台 CI、部分编辑器）触发告警或显示问题。

### 6.2 影响

- 跨平台 / CI 环境下可能触发 `non-utf8` 类告警，影响可读性与协作。
- 与 `AGENTS.md`「代码中已大量使用中文业务注释」的可读性预期不符。

### 6.3 行动清单

- [x] **P1-S** 修复 `error.rs` 编码：以 UTF-8 重新保存，恢复中文错误文案（对照错误枚举语义重写，不要从乱码反推）。
- [x] **P2-T** 在仓库根加一个轻量的编码守护（editorconfig 已有则校验，或 lint 钩子），避免再次出现非 UTF-8 源文件。

**涉及范围**：`multi_platform_core/src/db/error.rs`、仓库级 `.editorconfig`。

---

## 7. i18n · 框架空转（P2）

### 7.1 现状证据

- `desktop/src/windows/main/i18n/` 存在，`main.ts` 已 `createI18n` / `useI18n` 初始化。
- 但 `zh.ts` 仅 8 行、`en.ts` 仅 9 行，key 库基本为空（只有 `tab.home/settings/about` 三个）。
- 实际 UI 文案以中文硬编码在 `.vue` 模板里遍布全仓。
- `PRODUCT.md` 定位「中文优先」，所以这不是要立刻英文化，但意味着 **i18n 框架目前是死代码**，后续做多语言或移动端文案复用时无从复用。

### 7.2 影响

- i18n 机制等于未启用，未来任何多语言需求都要从零扫文案。
- `en.ts` 形同虚设，给人「已支持英文」的错觉。

### 7.3 行动清单

- [ ] **P2-U** 决策：要么真做 i18n（先抽公共 / 导航 / 设置文案，建立 key 命名规范），要么暂时移除空 i18n 框架以免误导。建议保留框架，但**立一个最小可用范围**（顶栏 tab、设置页标题、通用按钮）作为样板，再渐进迁移。
- [ ] **P2-V** 若保留，补一个 lint / 脚本检测「i18n 已配置但页面出现裸中文」的优先区域，辅助渐进迁移。

**涉及范围**：`desktop/src/windows/main/i18n/`、各页面文案。

---

## 8. 设计系统治理（P2）

### 8.1 现状证据

- `desktop/scripts/check-design-system.mjs` 是好东西——它会扫描 `--*` 变量并拦截未定义 token。
- 但脚本维护着一个 **46 项的 `allowedUndefinedVars` 白名单**（如 `--ftp-col-*`、`--todo-item-*`、`--knowledge-block-*`、`--widget-text-*`、`--term-bg-color` 等）。每个白名单项本质都是「这块业务绕过了设计系统」的打洞。

### 8.2 影响

- 白名单只增不减，token 治理在持续弱化。
- 业务私有 token（`--ftp-*` / `--todo-*` / `--knowledge-block-*`）形成若干「页面私有色板」，与 `DESIGN.md`「除迁移桥接外不新增页面局部 `--color-*` 体系」的 Named Rule 冲突。

### 8.3 行动清单

- [ ] **P2-W** 逐域消化白名单：评估每个私有 token 是否能收敛为语义 token（`--ui-surface-*` / `--ui-text-*` / `--ui-state-*`）的参数化使用，把白名单项数压下去。
- [ ] **P2-X** 给 design-system lint 加趋势守护：白名单只允许减少不允许增加（diff 检查），新需求必须先扩语义 token。
- [ ] **P3-Y** 把「为什么这里允许私有 token」以注释形式固化在脚本里，避免后续维护者只看到名单而不知道原因。

**涉及范围**：`desktop/scripts/check-design-system.mjs`、`assets/*.scss`、相关业务页面样式。

---

## 9. 移动端 · 进度与 core 复用（P2）

### 9.1 现状证据

- `mobile/lib/` 结构齐全（core / state / ui / features / design_system / bridge），features 目前只有 `clipboard / grid / home`。
- `docs/mobile/ISSUES.md` 几乎全空，核心待办（复用桌面端 sqlite/剪贴板、mDNS 同步、剪贴板多格式支持）均未开始。
- Rust 侧 `multi_device_clipboard/`（service 661 行、discovery 447 行）已有桌面端实现，`bindings/flutter.rs` 644 行也已铺好桥——复用的原料在，移动端消费侧未跟上。

### 9.2 影响

- 跨端剪贴板这一核心卖点目前只有桌面半边。
- Rust core 的「跨平台核心」定位缺少第二个端来验证抽象是否真的可复用。

### 9.3 行动清单

- [ ] **P2-Z** 把 `docs/mobile/ISSUES.md` 落为真实 backlog：剪贴板多格式、mDNS 同步、sqlite 复用，逐项标注「依赖哪个 Rust 模块 / 哪个 binding」。
- [ ] **P2-AA** 验证 `flutter_rust_bridge` 链路：用剪贴板读写作第一个跨端贯通用例，暴露 core 复用的真实摩擦点。
- [ ] **P3-BB** 评估移动端测试基线（widget test / 单元测试），目前仅 2 个 dart 测试。

**涉及范围**：`mobile/lib/features/`、`mobile/test/`、`multi_platform_core/src/bindings/flutter.rs`。

---

## 10. IPC 契约一致性（P2）

### 10.1 现状证据

- `desktop/src/contracts/` 已有 23 个领域契约文件（结构很好），`preload.ts` 单文件 629 行。
- preload 暴露 **367 个 IPC 入口**，main 进程 **377 个 handler**——表面极大。
- 367 ≠ 377，差 10 个，说明 preload 暴露与 main 注册之间**已经存在不一致**（可能有注册了未暴露的，或暴露了未注册的 dead channel）。
- 一致性目前完全靠 `AGENTS.md` 里列的「四步顺序」人工维护，无机器校验。

### 10.2 影响

- 任何一步漏改，运行时才发现（preload 调用未注册的 channel，或契约形状漂移）。
- 表面越大，漂移概率越高。

### 10.3 行动清单

- [ ] **P2-CC** 排查 367 vs 377 的 10 个差异，确认是 dead channel 还是漏暴露，清理到一致。
- [ ] **P2-DD** 加一个契约一致性校验脚本（可作为 lint 或 CI 步骤）：扫描 preload 暴露的 channel 名集合 ⊆ main 注册的 channel 名集合，且每个 channel 在 `contracts/` 有对应类型。
- [ ] **P3-EE** 评估 preload 是否按领域拆分（与 contracts 一一对应），降低 629 行单文件的维护成本。

**涉及范围**：`desktop/src/preload.ts`、`desktop/src/main/**/ipc.ts`、`desktop/src/contracts/`。

---

## 11. 长生命周期资源与多窗口隔离（P2）

### 11.1 现状证据

- `AGENTS.md` Restrictions 明确警告「终端、SSH、FTP、插件 runtime 要处理释放、取消订阅和窗口关闭路径」，`docs/desktop/MEMORY_LEAK_FIXES.md` 记录过 `useGridDrag` / `GridItem` 的监听器泄漏修复——说明这类问题真实发生过。
- 多窗口入口已很多（main / terminal / notification / tray-menu / splash / func / clipboard / quick-launch / quick-note / workspace-window / ai_canvas 等十几个 html 入口），每个都是独立渲染进程，状态隔离风险随窗口数上升。

### 11.2 影响

- 长时间运行的工作台应用最怕隐性泄漏与僵尸会话，且最难复现。
- 多窗口一旦共享了本该隔离的 store / composable，行为会跨窗口串扰。

### 11.3 行动清单

- [ ] **P2-FF** 梳理 SSH / FTP / Terminal / 多设备剪贴板的生命周期：连接断开、窗口关闭、应用退出的三条路径都要有显式清理，写进各领域的开发文档。
- [ ] **P2-GG** 多窗口代码做一次隔离审计：确认 main 窗口专用 store/composable 没有被 detached window 引用（与 `AGENTS.md` 约束对齐）。
- [ ] **P3-HH** 评估引入轻量运行时健康监控（会话数、活跃连接数、事件监听计数）作为 DevTools 页面（`pages/DevTools.vue` 已存在）的能力。

**涉及范围**：`desktop/src/main/{terminal,ssh,ftp,multi-device-clipboard}/`、各独立窗口入口。

---

## 12. 横向行动清单（按优先级汇总）

### P0（先做）

| 编号 | 项 | 子系统 | 量级 | 依赖 |
|---|---|---|---|---|
| P0-A/B/C | 凭据真加密 + 迁移 + 前缀重命名 | 安全 / core | 中 | 无 |
| P0-D | crypto 单测 | 安全 / core | 小 | P0-A |
| P0-E/F | PR 级 CI + 缓存 | 工程化 | 中 | 已完成 |
| P0-G | Rust 重灾区单测基线 | 工程化 / core | 中 | P0-E |
| P0-H | renderer 测试基线（vitest） | 工程化 / desktop | 中 | P0-E |
| P0-I | verify-*.cjs 接入 CI | 工程化 | 小 | 已完成 |

> 说明：P0-G/H/I 三项原是 P1 级（测试基线），但它们都依赖 P0-E 的 CI 先就位才有意义，故建议与 CI 同批推进。编号不变，仅执行批次靠前。下表 P1/P2/P3 保留原始编号，不重新排序。

### P1

| 编号 | 项 | 子系统 | 量级 |
|---|---|---|---|
| P1-J | 拆 `knowledge_service.rs` | core | 中-大 |
| P1-K | 拆 `ftp/transfer.rs` | core | 中 |
| P1-L | 拆 `bindings/napi.rs` | core | 中 |
| P1-O | 拆 Settings / Knowledge / Ftp 页面 | desktop | 中-大 |
| P1-P | 拆 `knowledge_store.ts` | desktop | 中 |
| P1-S | 修复 `error.rs` 编码 | core | 小 |

### P2

| 编号 | 项 | 子系统 |
|---|---|---|
| P2-M/N | 迁移机制升级 / frb 产物策略 | core |
| P2-Q/R | store 边界规范 / ISSUES 归档 | desktop |
| P2-T | 编码守护钩子 | 工程化 |
| P2-U/V | i18n 最小可用范围 | desktop |
| P2-W/X/Y | design-system 白名单消化 + 趋势守护 | desktop |
| P2-Z/AA | 移动端 backlog + 跨端贯通用例 | mobile |
| P2-CC/DD | IPC 一致性排查 + 校验脚本 | desktop |
| P2-FF/GG | 资源生命周期 + 多窗口隔离审计 | desktop |

### P3

| 编号 | 项 |
|---|---|
| P3-BB | 移动端测试基线 |
| P3-EE | preload 按领域拆分 |
| P3-HH | 运行时健康监控 |

---

## 13. 建议执行顺序

1. **第一批（解锁后续一切）**：P0-E（CI）+ P0-F（缓存）。先有护栏，后面所有重构才安全。可与 P0-A/B/C（凭据加密）并行，因为两者无依赖。
2. **第二批（安全收口）**：P0-D 加密单测 + P1-S 编码修复 + P2-T 编码守护。把「安全 / 完整性」这一类一次性清干净。
3. **第三批（结构债主攻）**：P1-J/K/L（core 拆分）与 P1-O/P（renderer 拆分）可两条线并行，互不阻塞。每拆一项补测试（呼应 P0-G/H）。
4. **第四批（治理与一致性）**：P2-CC/DD（IPC）、P2-W/X（design-system）、P2-U/V（i18n）可并行，属于「把已有机制做实」。
5. **第五批（移动端与长线）**：P2-Z/AA（移动端贯通）依赖 core 拆分稳定后再大规模推进，避免在动荡的 core 上建移动端。

**可并行原则**：安全线（P0-A~D）、工程化线（P0-E~I）、结构线（P1-J~P）三条主线相互独立，资源足够时可同时推进；唯一硬依赖是「测试 / CI 先于大规模拆分」。

---

## 14. 不在本次范围

以下刻意未纳入，避免报告失焦：

- 具体功能的增删（终端 / FTP / 知识库 / AI 的产品需求）——属于功能 roadmap，不是改进项。
- 性能调优的具体指标——本次未做运行时 profiling，不臆测数据。
- 第三方依赖版本升级——仅建议在必要时随相关改动顺手升级，不单列。
- `vendor/` 内第三方补丁——`AGENTS.md` 明确不要动，除非任务明确要求。

---

## 附录 A：数据来源与口径

- **分支**：`codex/0.0.4-dev`，快照时间 2026-06-15。
- **行数统计**：`Get-Content | Measure-Object -Line`，统计逻辑行（不含末尾空行偏差）。
- **TODO 计数**：全仓 `TODO|FIXME|HACK` 大小写敏感匹配，**排除** `node_modules / dist / out / target / frb_generated / vendor`。注意：大小写不敏感匹配会命中 ~1541 处，其中绝大多数是 `todo` 业务名词（Todo 功能、`TODO_BACKGROUND_*` 常量、checkbox 标签等）误匹配，真实待办仅约 13 处。
- **IPC 计数**：preload 侧 `ipcRenderer.invoke|on|send` 出现次数（367），main 侧 `ipcMain.handle|on` 出现次数（377）。该计数含同一 channel 多次出现的可能，精确差集需以 channel 名集合为准（行动项 P2-CC 的排查内容）。
- **i18n key**：`zh.ts` 8 行 / `en.ts` 9 行，实际可用 key 仅 `tab.home/settings/about`。
- **design-system 白名单**：`check-design-system.mjs` 中 `allowedUndefinedVars`，含 `--*` 形态条目共 46 项。
- **Rust 测试分布**：13 处 `#[cfg(test)]`，覆盖 `db/connection`、`db/migration`、`ftp/profile`、`multi_device_clipboard/{service,discovery}`、`services/{ai,home_layout,knowledge,project,setting,todo,user}`、`bindings/flutter`。
- **CI 现状**：`.github/workflows/` 仅 `desktop-release.yml`，触发条件 `workflow_dispatch` + `push: tags v*`。

---

*本报告仅为诊断与方向建议，不构成已承诺的执行计划。每项 P0/P1 落地前应另立 spec 与实施 plan。*
