# AI 图像处理：运行环境功能清单

日期：2026-10-04。对应需求 FR-16、FR-19～27、FR-49～60。

## 调研结论

Python `venv` 是依附已有解释器的隔离目录，不能用一个 Python 3.13 解释器创建 Python 3.10。Conda 可以按版本创建 prefix 环境；uv 可以管理/下载 Python 并创建 `.venv`，也提供显式 `--python` 的包管理。无需激活 shell，所有操作应明确指定解释器/prefix。

CUDA 需要区分驱动支持能力、Toolkit（nvcc）、框架 runtime（torch.version.cuda）和实际设备可用性。普通 PyTorch wheel 自带所需 runtime，运行通常不要求安装同版本全局 Toolkit；Toolkit 主要用于编译扩展。安装 cu121 不等于 GPU 可运行，尤其是新的 GPU 架构。

## 本轮实施范围与验收

| 编号   | 功能            | 行为与验收                                                                                               |
| ------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| ENV-01 | 发现解释器/工具 | Python、Conda、uv 的路径、版本、发现错误可查看                                                           |
| ENV-02 | 环境清单        | 自动发现 Conda 环境、插件 `.venv`、应用受管环境；可通过选择器导入其它环境目录                            |
| ENV-03 | 隔离创建        | venv / Conda prefix / uv 创建；名称与 Python 版本可配置，目录由宿主生成                                  |
| ENV-04 | 生效环境        | 选择与插件 Python 版本匹配的受管环境，持久化；旧单环境仍可运行                                           |
| ENV-05 | 删除/解绑       | 仅删除应用创建并带所有权标记的环境；导入环境只解除登记，不删除文件                                       |
| ENV-06 | 可视化包管理    | 按名称搜索已安装包；查看版本；pip/uv 安装、升级、卸载；Conda 环境可管理 Conda 包                         |
| ENV-07 | 依赖校验        | pip check / uv pip check 返回冲突原因；依赖安装与推理使用同一生效解释器                                  |
| ENV-08 | 依赖文本        | 显示可复制的 requirements 导出文本，导入只接受合法的包名/版本，拒绝 URL、路径、-r、-e 和命令行参数       |
| ENV-09 | 任务与取消      | 创建/包变更作为 Job 展示输出摘要，可取消；同插件写操作互斥，切换/删除不能破坏运行中的任务                |
| ENV-10 | GPU/驱动        | nvidia-smi 返回设备、显存、驱动和驱动支持 CUDA 上限；缺失工具显示原因                                    |
| ENV-11 | Toolkit         | 探测当前 nvcc 与已安装 CUDA 目录，不修改系统 PATH/驱动                                                   |
| ENV-12 | 框架检测        | 所选环境的 PyTorch/CUDA runtime/cuDNN/设备架构，执行最小 CUDA 张量运算验证                               |
| ENV-13 | 版本组合        | 只显示插件 manifest 声明的 CPU/cu118/cu121/cu124/cu128 组合；按驱动支持能力检查                          |
| ENV-14 | 缓存与空间      | 显示应用环境/缓存目录、剩余空间与平台信息，区分环境/权重/系统 Toolkit                                    |
| ENV-15 | 模型诊断        | 显示当前插件需要的 Python 版本、依赖组及已安装后端；ONNX Runtime/TensorRT 仅检测安装版本，不宣称适配完成 |
| ENV-16 | 权限与边界      | 所有能力受 models.execute 与内置来源校验；外部环境默认只读，renderer 不执行 Node/命令                    |

本轮不升级/安装系统显卡驱动，不提供任意 shell，不自动下载大型模型权重，不接入模型专用 TensorRT engine 构建、WebGPU pipeline 或 Docker/远程集群。uv 缺失时提供官方安装说明和刷新检测入口；已有 Miniforge 安装入口继续保留。

## 环境管理方式与页面组织（2026-10-06）

顶部“环境管理方式”选择 venv、Conda 或 uv，每次只展示该类型的环境、创建入口、工具信息和包操作。venv 使用 pip，uv 使用 uv pip；Conda 环境内可选择 Conda 包或 pip 包来源，uv 不再作为其它环境的包管理选项。

首次进入优先显示生效环境的类型；后续通过 `storage.self` 保存并恢复所选管理方式。各类型在本次页面会话中记住上次查看的环境，切换时清空包输入、导出和诊断数据，再使用新解释器查询。切换展示方式不会自动修改推理解释器，顶部始终显示图像处理当前所用环境，点击“用于图像处理”才调用受权限约束的生效环境 API。

系统 Python 仅作为 venv 的基础解释器来源，环境列表不混入系统 Python。只读外部环境保留列包、检查与导出；创建、包写入、删除和生效仍沿用宿主所有权和 Python 版本校验。管理器未安装时显示该类型的安装入口及不可创建状态，任务运行中锁定管理方式和包来源切换。

创建表单与工具路径可展开查看；CUDA/框架诊断明细默认折叠，错误时自动展开。运行环境前端拆成管理方式、Python 环境、包管理、诊断、任务和删除确认组件，通过页面实例提供的响应式上下文共享状态；页面壳仅编排组件，样式统一在 `styles/runtime-environment.css`，选择规则在 `composables/environment-manager.ts`。

## 原生框架加载失败与 OpenMP 冲突

进入运行环境页面只自动选择生效环境或应用受管环境；仅有系统/外部环境时，先展示硬件诊断，用户可显式选择需要检查的解释器。避免进入页面时直接加载外部 Conda base 中的原生框架。

框架诊断分两个独立子进程：先用 `importlib.metadata` 读取 PyTorch、NumPy、ONNX Runtime、TensorRT 的安装版本及 Windows 常见 OpenMP DLL 路径，再导入 PyTorch 验证运行能力。原生库异常退出时保留元数据，以 `probeStatus=failed` 和 `kernelTest=false` 显示“未验证”，不会将已安装包误报为未安装，也不会把失败当成 CUDA 通过。

Windows `OMP: Error #15` 会归类为 `OPENMP_RUNTIME_CONFLICT`，页面和应用通知给出环境修复提示，并展示找到的 `libiomp5md.dll` 路径。不会设置 `KMP_DUPLICATE_LIB_OK` 或修改/删除外部环境 DLL；当前 Real-CUGAN 应创建 Python 3.10 隔离环境，并通过插件声明的依赖组合安装框架。

2026-10-04 实测本机 Miniconda base：Python 3.13.11、PyTorch 2.14.0、NumPy 2.4.2。原诊断和单独 `import torch` 均以状态码 3 退出，Conda `Library/bin` 与 PyTorch `torch/lib` 各有一份不同大小的 OpenMP DLL。新诊断保留版本和两条 DLL 路径，明确报告冲突及未验证状态；未修改该环境，未据此宣称图像推理可运行。

## 官方依据

- [Python venv](https://docs.python.org/3/library/venv.html)：解释器绑定与无需激活的用法。
- [Conda 环境管理](https://docs.conda.io/projects/conda/en/latest/user-guide/tasks/manage-environments.html)：prefix、Python 版本、导出和环境发现。
- [uv 环境](https://docs.astral.sh/uv/pip/environments/)、[Python 安装](https://docs.astral.sh/uv/guides/install-python/)、[包管理](https://docs.astral.sh/uv/pip/packages/)；网页返回 403 时读取官方仓库对应 docs Markdown。
- [pip list](https://pip.pypa.io/en/stable/cli/pip_list/)、[pip check](https://pip.pypa.io/en/stable/cli/pip_check/)；网页返回 403 时读取 pypa/pip 官方仓库的 rst。
- [PyTorch 已发布组合](https://pytorch.org/get-started/previous-versions/)：2.5.1 CPU/cu118/cu121/cu124，2.7.1 cu128。
- [NVIDIA CUDA 兼容](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html)：驱动、runtime 和版本族兼容条件。

## 验证边界

本轮已实现上表中的管理能力，清单中的“后端检测”与真正的模型适配仍分开。CUDA 组合由插件 manifest 的 `dependencies.profiles` 提供；新增插件可声明 Python 3.9～3.14 的要求，当前 Real-CUGAN 仍为 3.10。

Windows 实测：

- venv：在临时目录创建 Python 3.13 环境，使用 pip 安装 `packaging==25.0`，列包、`pip check` 和 freeze 导出通过。因为当前插件要求 3.10，设为该插件生效环境被正确拒绝。
- uv：使用本机 uv 0.8.12 创建带 seed 的隔离环境，`uv pip list --python` 与删除通过。
- Conda：使用已有 Conda 创建临时 Python 3.10.22 prefix，列出 20 个 Conda 包；设为生效环境、服务重建后恢复、阻止删除生效环境、取消指定并通过 Conda 删除均通过。
- NVIDIA：检测到 RTX 5070、617.14 驱动，输出为 `CUDA UMD Version: 13.4`；Toolkit 实测为 13.3 和 11.8。受限子进程必须保留 `ProgramFiles`/`ProgramW6432`，否则此驱动的 NVML 初始化失败。
- 框架：测试环境没有安装 PyTorch，诊断正确返回未安装、`kernelTest=false`。未下载/安装大型 PyTorch CUDA wheel，未验证 Real-CUGAN GPU 推理或新组合的图像质量。
- 浏览器：模拟 Plugin API 验证包安装表单、requirements 导出、cu128 参数、外部只读、uv 创建、切换/解除生效、删除确认；390px 无横向溢出。此项不冒充 Electron 原生 IPC 或数据库验证。

创建与包变更可取消；文件删除及旧版 Miniforge 安装不能保证在每个阶段可回滚。系统 Python/Conda 环境不被改包或删除，所有实测创建目录已清理。Linux 分支尚未实机运行。

主要实现：`ModelEnvironmentService`、`model_process.ts`、共享契约/SDK/IPC 和插件 `RuntimeEnvironment.vue`。运行进程使用显式解释器或 prefix，选定环境会连接依赖安装与推理；Windows 取消终止自有进程树。包参数拒绝 URL、路径与 shell 参数；Conda 包安装固定环境现有 Python 大小版本，避免求解器将生效解释器隐式升级。
