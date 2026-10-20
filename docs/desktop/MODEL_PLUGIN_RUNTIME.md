# AI 图像处理工具插件运行（当前推理适配：Real-CUGAN）

页面“模型库”现提供 20 个真实模型/权重变体，支持按任务筛选、查看来源与下载入口、保存任务范围/后端/默认资产，以及设为工作台当前模型。配置使用新增的 `storage.self` 权限；已有安装需要在插件权限界面重新批准。详见 [本地模型清单与配置说明](AIImageProcessing/local-model-library.md)。

目录条目可配置与已安装权重、已接入推理是不同状态。当前只有 Real-CUGAN 使用现有运行时，其它模型不会被发送到 Real-CUGAN 脚本。以下操作流程描述 Real-CUGAN。

## 使用流程

1. 在“插件”页找到内置的 AI 图像处理工具，确认 `models.execute`、`jobs.manage`、`ui.contribute`、`navigation.open` 和 `storage.self` 权限并启用。`models.execute` 会在本机安装 Python 包和执行模型代码。
2. 打开左侧“运行环境”，检测 Python、Conda 和 uv。可导入已有目录（默认只读），或用 venv、Conda prefix、uv 创建应用管理的环境。当前 Real-CUGAN 要求 Python 3.10；venv 必须已有同版本解释器，Conda/uv 可获取目标版本。没有 Conda 时可安装应用私有 Miniforge，安装器固定为 conda-forge Miniforge `26.7.2-0`，支持 Windows/Linux x64 并校验 SHA-256，不修改系统 PATH。
3. 将受管 Python 3.10 环境设为生效环境，再选择并安装插件声明的 CPU/cu118/cu121/cu124/cu128 组合。通用依赖保持 `numpy==1.26.4`、`opencv-python-headless==4.10.0.84`；CPU/cu118/cu121/cu124 为 PyTorch `2.5.1`，cu128 为 `2.7.1`。创建与包变更任务可取消。页面区分 NVIDIA 驱动支持能力、已安装 Toolkit 和所选环境的 PyTorch runtime，并执行最小 CUDA 运算检查；未通过检查不代表模型就绪。
4. 在 [Real-CUGAN 官方发布页](https://github.com/bilibili/ailab/releases/tag/Real-CUGAN) 下载所需 `.pth` 权重，或使用已有的本地权重。页面选择权重、输入图片和输出目录，配置倍率、tile、设备与半精度。倍率必须与权重一致，半精度只用于 CUDA。
5. 点击“开始超分”。结果以 PNG 写入所选目录，文件名带倍率与时间戳。任务状态通过插件 JobService 展示；离开页面后可在插件任务列表查看记录。

首期只处理单张 PNG/JPEG/WebP/BMP 图片，不处理视频、批量队列、透明通道、其他 GPU 后端或模型自动下载。CUDA 是否可用由插件环境中的 PyTorch 和 NVIDIA 驱动共同决定；安装 CUDA wheel 不代表设备一定可用。

## 宿主与插件边界

`PluginManifest.modelRuntime` 声明插件要求的 Python 版本（当前 Real-CUGAN 为 `3.10`）、相对路径 `entry`、`common/cpu/cuda` 依赖组、可选 HTTPS 包索引和声明式 `profiles`。模型链接、参数和推理脚本在插件中；宿主只接受固定的结构化请求，自己选择安装的插件根目录、生效解释器和受用户选择的文件句柄。插件 UI 仍在 Electron 沙箱中运行，不能直接访问 Node、文件系统或进程 API。

Python 包安装和推理脚本具有当前操作系统用户的权限。首期宿主额外检查安装记录的 `installSource.type === 'builtin'`；本地、Git、npm、普通 Marketplace 插件即使声明并获批 `models.execute`，也无法调用模型运行服务。现有签名校验仅证明包与自带公钥匹配，尚无官方发布者公钥信任根，因此不能把任意 `signatureVerified` 当作官方插件。接入官方签名模型插件之前，需要配置固定信任根和发布流程。

文件选择接口返回临时不透明句柄，不向插件 UI 返回本机路径。任务取消和插件停用会终止对应子进程。宿主对脚本路径、参数形状、文件归属和安装器哈希做校验；Python 进程本身不是操作系统级沙箱。

## 上游与验证

内置模型实现来自 `wuzerun-888/Real-CUGAN` 提交 `a5814b68a484b140d127ff2d400479a292f27859` 的 `upcunet_v3.py`，保留原 MIT 许可。GuYanTools 对上游文件的唯一运行时改动是以 `torch.load(..., weights_only=True)` 读取权重，避免加载任意 pickle 对象。包装脚本通过官方 `RealWaifuUpScaler` 完成单图推理。

仓库测试覆盖 manifest、权限、路径和句柄校验，以及 Python 请求参数。桌面类型检查与构建可验证接线和资源打包配置。真实模型输出需要在目标 Windows/Linux 机器上准备相应 PyTorch、官方权重及可用设备后运行；没有这组条件时不能把构建成功当成推理成功。
