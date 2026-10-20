import type { ModelRuntimeDiagnostics } from '@/contracts/plugin_model';
import { runModelCommand, type ModelCommandExecutor } from './model_process';

type FrameworkReport = NonNullable<ModelRuntimeDiagnostics['framework']>;

/** Read package metadata without importing native libraries that can abort Python. */
export const FRAMEWORK_METADATA_PROBE = String.raw`
import json, sys, os, importlib.metadata as metadata
result = dict(python=sys.version.split()[0], cudaAvailable=False, kernelTest=False,
              devices=[], architectures=[], openmpLibraries=[])
for key, distribution in [("torch", "torch"), ("numpy", "numpy"),
                          ("onnxruntime", "onnxruntime"), ("onnxruntime", "onnxruntime-gpu"),
                          ("tensorrt", "tensorrt")]:
    try:
        result[key] = metadata.version(distribution)
    except metadata.PackageNotFoundError:
        pass
if sys.platform == "win32":
    candidates = [os.path.join(prefix, "Library", "bin", "libiomp5md.dll")
                  for prefix in (sys.prefix, sys.base_prefix)]
    try:
        candidates.append(str(metadata.distribution("torch").locate_file("torch/lib/libiomp5md.dll")))
    except metadata.PackageNotFoundError:
        pass
    result["openmpLibraries"] = sorted(set(os.path.realpath(file) for file in candidates if os.path.isfile(file)))
print(json.dumps(result))
`;

/** Native verification runs in a separate authorized subprocess. */
export const FRAMEWORK_PROBE = String.raw`
import json, sys
result = dict(python=sys.version.split()[0], cudaAvailable=False, kernelTest=False,
              devices=[], architectures=[])
try:
    import torch
    result.update(torch=torch.__version__, cudaRuntime=torch.version.cuda,
                  cudnn=torch.backends.cudnn.version(), cudaAvailable=torch.cuda.is_available())
    if result["cudaAvailable"]:
        result["devices"] = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
        result["architectures"] = torch.cuda.get_arch_list()
        torch.ones(1, device="cuda").add_(1).cpu().item()
        result["kernelTest"] = True
except Exception as error:
    result["error"] = str(error)
    result["cudaAvailable"] = False
print(json.dumps(result))
`;

function failedProbe(report: FrameworkReport, cause: unknown): FrameworkReport {
  const message = cause instanceof Error ? cause.message : String(cause);
  const openmpConflict = /OMP:\s*Error\s*#15|libiomp5md\.dll.*already initialized/i.test(message);
  return {
    ...report,
    probeStatus: 'failed',
    errorCode: openmpConflict ? 'OPENMP_RUNTIME_CONFLICT' : 'FRAMEWORK_PROBE_FAILED',
    cudaAvailable: false,
    kernelTest: false,
    devices: [],
    architectures: [],
    error: openmpConflict
      ? '所选环境存在 OpenMP 运行库冲突（libiomp5md.dll 重复初始化），PyTorch 无法加载。已保留已安装包的版本信息，CUDA 运算尚未验证。请创建干净的隔离环境并安装当前模型的依赖组合，避免混用 Conda 的 MKL/OpenMP 与另一来源的 PyTorch 运行库。'
      : message.slice(-1000),
  };
}

export async function inspectModelFramework(
  python: string,
  run: ModelCommandExecutor = runModelCommand
): Promise<FrameworkReport> {
  const metadata: FrameworkReport = JSON.parse(
    (await run(python, ['-I', '-c', FRAMEWORK_METADATA_PROBE], { timeoutMs: 8000 })).trim()
  );
  if (!metadata.torch) return { ...metadata, probeStatus: 'not-installed' };
  try {
    const native: FrameworkReport = JSON.parse(
      (await run(python, ['-I', '-c', FRAMEWORK_PROBE], { timeoutMs: 40_000 })).trim()
    );
    if (native.error) return failedProbe(metadata, native.error);
    return { ...metadata, ...native, probeStatus: 'ready' };
  } catch (error) {
    return failedProbe(metadata, error);
  }
}
