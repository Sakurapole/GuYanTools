# 图像运行环境实施计划

目标：按 runtime-environment-checklist.md 实现通用宿主服务和插件运行环境页面，不改变可信执行边界。

- [x] 环境/包/GPU/profile 的共享 typed contract、SDK 和 IPC 同步。
- [x] 回归测试：包输入校验、外部只读、环境路径归属、版本选择和 job 取消。
- [x] 通用 ModelEnvironmentService：发现/导入/创建/切换/删除、包管理/导出/校验、GPU/Toolkit/框架诊断。
- [x] ModelRuntimeService 连接生效解释器、声明式安装组合和生命周期清理。
- [x] 独立 RuntimeEnvironment.vue，复用 gt-* 组件，显示真实数据、任务和错误。
- [x] 目标构建/类型/测试、Windows 真实临时环境/轻量包检查、浏览器交互和限制记录。
