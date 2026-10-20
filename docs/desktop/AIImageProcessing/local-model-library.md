# 本地图像模型库：调研清单与配置说明

日期：2026-10-04。清单来自本轮读取的官方 README、权重发布页、Hugging Face 模型卡/API 及许可证。选取近期开放权重模型和任务明确、部署生态成熟的基线；不宣称全球排名或统一最优。

## 已接入页面的能力

模型库包含 20 个模型/权重变体、56 个下载入口，其中 38 个文件资产保存了发布者公布的 SHA-256。所有入口完成 HEAD 可访问性检查；目录/Google Drive 页的 HTTP 200 仅代表页面可访问，不代表权重下载、登录授权或推理成功。未下载大型权重，未测量生成质量、显存或吞吐。

- 在左侧“模型库”中浏览，用模型库工具区搜索模型/作者/任务关键词，通过下拉筛选 11 类任务。
- 每条目录记录都有名称、版本、作者、来源、许可、任务列表、输入要求、后端候选、资源说明和资产列表。
- 配置可设置名称别名、启用状态、上游能力内的任务子集、默认后端和默认下载资产；至少保留一个任务。配置通过 `pluginAPI.storage` 与 `storage.self` 持久化。
- “打开权重下载链接”/“打开完整下载目录”通过 `system.openExternal` 打开浏览器。目录不触发静默下载或运行第三方代码。
- “使用已保存配置”同步工作台模型、兼容任务与后端；切换模型时撤销当前 UI 对旧权重句柄的引用。
- 已有安装记录需要在插件权限界面批准新增 `storage.self`；没有存储授权时保存显示错误，不降级到未经授权的文件或宿主存储。

## 模型与具体任务

| 模型/权重                    | 任务                | 许可（含限制）                                                                       | 下载入口                                                                                                                                                 | 官方资料                                                                       |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Real-CUGAN                   | 超分辨率            | MIT（当前插件包装）；当前插件保留上游 MIT 许可；资产包及第三方内容请按上游说明核对。 | [下载/目录](https://github.com/bilibili/ailab/releases/download/Real-CUGAN/updated_weights.zip)                                                          | [来源/模型卡](https://github.com/bilibili/ailab/tree/main/Real-CUGAN)          |
| Real-ESRGAN x4plus           | 超分辨率            | BSD-3-Clause                                                                         | [下载/目录](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth)                                                       | [来源/模型卡](https://github.com/xinntao/Real-ESRGAN)                          |
| Real-ESRGAN Anime 6B         | 超分辨率            | BSD-3-Clause                                                                         | [下载/目录](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth)                                            | [来源/模型卡](https://github.com/xinntao/Real-ESRGAN)                          |
| SwinIR Real SR               | 超分辨率            | Apache-2.0                                                                           | [下载/目录](https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth)                               | [来源/模型卡](https://github.com/JingyunLiang/SwinIR)                          |
| SwinIR 彩色去噪              | 去噪                | Apache-2.0                                                                           | [下载/目录](https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/005_colorDN_DFWB_s128w8_SwinIR-M_noise25.pth)                                  | [来源/模型卡](https://github.com/JingyunLiang/SwinIR)                          |
| SwinIR 彩色 JPEG 修复        | 压缩修复            | Apache-2.0                                                                           | [下载/目录](https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/006_colorCAR_DFWB_s126w7_SwinIR-M_jpeg20.pth)                                  | [来源/模型卡](https://github.com/JingyunLiang/SwinIR)                          |
| Restormer 真实图像去噪       | 去噪                | MIT                                                                                  | [下载/目录](https://drive.google.com/file/d/1FF_4NTboTWQ7sHCq4xhyLZsSl0U0JfjH/view?usp=sharing)                                                          | [来源/模型卡](https://github.com/swz30/Restormer/tree/main/Denoising)          |
| Restormer 运动去模糊         | 去模糊              | MIT                                                                                  | [下载/目录](https://drive.google.com/drive/folders/1czMyfRTQDX3j3ErByYeZ1PM4GVLbJeGK?usp=sharing)                                                        | [来源/模型卡](https://github.com/swz30/Restormer/tree/main/Motion_Deblurring)  |
| HAT Real SR                  | 超分辨率            | Apache-2.0                                                                           | [下载/目录](https://drive.google.com/drive/folders/1HpmReFfoUqUbnAOQ7rvOeNU3uf_m69w0?usp=sharing)                                                        | [来源/模型卡](https://github.com/XPixelGroup/HAT)                              |
| GFPGAN                       | 人脸修复            | Apache-2.0 + 第三方许可                                                              | [下载/目录](https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth)                                                                | [来源/模型卡](https://github.com/TencentARC/GFPGAN)                            |
| CodeFormer                   | 人脸修复            | S-Lab License 1.0；仅允许非商业使用；商用需另行取得授权。                            | [下载/目录](https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth)                                                                | [来源/模型卡](https://github.com/sczhou/CodeFormer)                            |
| LaMa Big-LaMa                | 局部修复            | Apache-2.0；镜像由社区维护，不等同于官方发布者；优先使用作者目录。                   | [下载/目录](https://drive.google.com/drive/folders/1B2x7eQDgecTL0oh3LSIBDGj0fTxs6Ips?usp=sharing)                                                        | [来源/模型卡](https://github.com/advimman/lama)                                |
| SUPIR                        | 图像还原 / 超分辨率 | SUPIR Software License Agreement；非商业限制；组合依赖还要遵守各自权重许可。         | [下载/目录](https://drive.google.com/drive/folders/1yELzm5SvAi9e7kPcO_jPp2XkTs4vK6aR?usp=sharing)                                                        | [来源/模型卡](https://github.com/Fanghua-Yu/SUPIR)                             |
| BiRefNet                     | 移除背景 / 图像分割 | mit                                                                                  | [下载/目录](https://huggingface.co/ZhengPeng7/BiRefNet/resolve/e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4/model.safetensors)                               | [来源/模型卡](https://huggingface.co/ZhengPeng7/BiRefNet)                      |
| sam2.1-hiera-small           | 图像分割            | apache-2.0                                                                           | [下载/目录](https://huggingface.co/facebook/sam2.1-hiera-small/resolve/ee5bba1d82bb8749febdf90f45e84b687142ba03/sam2.1_hiera_small.pt)                   | [来源/模型卡](https://huggingface.co/facebook/sam2.1-hiera-small)              |
| FLUX.2-klein-4B              | AI 生成 / 指令编辑  | apache-2.0                                                                           | [下载/目录](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/tree/e7b7dc27f91deacad38e78976d1f2b499d76a294)                                      | [来源/模型卡](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)        |
| Z-Image-Turbo                | AI 生成             | apache-2.0                                                                           | [下载/目录](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/tree/f332072aa78be7aecdf3ee76d5c247082da564a6)                                               | [来源/模型卡](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)                 |
| Qwen-Image-2512              | AI 生成             | apache-2.0                                                                           | [下载/目录](https://huggingface.co/Qwen/Qwen-Image-2512/tree/25468b98e3276ca6700de15c6628e51b7de54a26)                                                   | [来源/模型卡](https://huggingface.co/Qwen/Qwen-Image-2512)                     |
| Qwen-Image-Edit-2511         | 指令编辑            | apache-2.0                                                                           | [下载/目录](https://huggingface.co/Qwen/Qwen-Image-Edit-2511/tree/6f3ccc0b56e431dc6a0c2b2039706d7d26f22cb9)                                              | [来源/模型卡](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)                |
| stable-diffusion-xl-base-1.0 | AI 生成 / 指令编辑  | openrail++；Open RAIL++ 使用限制，不能等同于无条件 Apache/MIT 许可。                 | [下载/目录](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/462165984030d82259a11f4367a4eed129e94a7b/sd_xl_base_1.0.safetensors) | [来源/模型卡](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) |

## 新模型选择依据和排除项

- Qwen-Image-2512：近期文生图版本。Qwen-Image-Edit-2511：具体的指令编辑 pipeline；不能用生成版权重冒充编辑版。
- FLUX.2-klein-4B：官方模型卡声明文生图、多参考图编辑与 Apache-2.0。上游约 13GB 显存是其资料中的参考值，未在本机复制。
- Z-Image-Turbo：官方公开生成 checkpoint；README 中未发布的编辑/Omni 变体没有加入。上游 8 NFEs 和 16GB 级设备说明不构成本应用速度承诺。
- SUPIR：扩散先验还原路线，含上游非商业限制，并且需要 SDXL/CLIP 等额外资产，不能视为单权重即可运行。
- HAT 的发布权重用于超分；上游列为待办的多还原任务未配置。SwinIR 的 SR、noise25 和 jpeg20 三种权重分开，禁止跨任务乱用。
- SeedVR2-3B/7B 的官方模型卡与权重元数据已读取，但上游主要协议是 video-to-video，本轮未把它标成可直接运行的单图模型。后续应评估单帧输入和时间维度适配，再做独立插件。[官方模型卡](https://huggingface.co/ByteDance-Seed/SeedVR2-3B)。
- RMBG-2.0、FLUX.1-schnell 和最初候选 LaMa 地址曾返回 401；没有用猜测的直链绕过授权。背景移除采用可核验的 BiRefNet；LaMa 使用作者目录和 README 明确引用的社区镜像（界面标注来源差异）。
- GitHub REST API 受到请求限流，因此通过官方 raw README、发布页 expanded_assets 和 HEAD 验证获得资产；Real-ESRGAN 的正确权重 tag 分别是 `v0.1.0` 和 `v0.2.2.4`，不是最初猜测的 `v0.2.5.0`。

## 下载与校验数据

目录数据位于 `desktop/resources/model-plugins/image-enhancement/ui/src/model_catalog.json`，它属于图像处理插件，不向通用宿主写入模型业务逻辑。

- `tasks`：此条具体权重的上游任务能力；用户配置 `tasks` 只能取其子集。
- `nativeBackends`：模型上游框架部署候选；不是本机探测结果或本应用已接入证明。
- `conversionBackends`：本轮没有验证 TensorRT、ONNX、WebGPU 转换产物，因此保持空数组。
- `runtimeAdapter`：当前仅 Real-CUGAN 为 `real-cugan`；新模型为 `null`，后续以独立可信模型插件接入。
- `assets[].kind`：`file` 是具体文件，`archive` 需要解压，`directory` 是手动下载页，`snapshot` 是完整 pipeline 仓库目录。
- `assets[].sha256`：仅保存服务端公布的 LFS SHA-256；没有公开证据时为 `null`，不编造哈希。
- `assets[].verification`：记录 HEAD 验证而不是完整文件校验；安装前还必须计算下载文件的实际 SHA-256。
- Hugging Face URL 固定到具体 revision，分片记录文件名/大小/哈希；完整模型还需要配置、scheduler、分词器、文本编码器与 VAE，不能把单个分片当作完整模型。
- 多个可选资产不意味着全部必须重复下载。例如 LaMa 的作者下载目录与社区镜像是替代来源。

## 运行与安全边界

目录可配置不等于已安装或可推理。新条目不能调用当前 Real-CUGAN Python 包装器；“开始处理”保持禁用。现有适配仅接受 `{scale, tile, device, half}`，CPU 自动关闭半精度，禁止新增目录字段直接穿透 Python schema。

新模型的 loading、参数表单、pipeline、预处理和后处理应放进对应插件，宿主仍只提供通用环境、句柄、任务和受控执行。本文没有新增模型代码执行权、远程 provider、自动 engine 转换或权重安装能力。

## 检查与后续接入

目录测试覆盖任务筛选、配置能力约束、失效资产/后端清理、删除模型配置丢弃以及未适配模型拒绝推理；浏览器检查覆盖模型浏览、任务过滤、配置保存与重载、固定 revision 下载入口和 Real-CUGAN 原有请求形状。实际模型推理应在权重、可信插件、依赖和目标硬件齐备后单独验收。

本轮验证：目标页面 `vue-tsc --noEmit` 通过，目标插件 Vite 构建通过，目录/布局测试 5 项通过，内置插件与 manifest 测试 23 项通过。浏览器使用模拟 Plugin API 检查保存/重载和 IPC 请求形状，未把它当作 Electron 原生存储或真实推理验证；390px 页面无横向溢出，无 pageerror。
