import { describe, expect, it, vi } from 'vitest';
import type { ModelRuntimeDiagnostics } from '@/contracts/plugin_model';
import {
  inspectModelFramework,
  FRAMEWORK_METADATA_PROBE,
  FRAMEWORK_PROBE,
} from './model_framework_probe';

const metadata: NonNullable<ModelRuntimeDiagnostics['framework']> = {
  python: '3.13.11',
  torch: '2.14.0',
  numpy: '2.4.2',
  onnxruntime: '1.23.0',
  cudaAvailable: false,
  kernelTest: false,
  devices: [],
  architectures: [],
  openmpLibraries: [
    'C:/conda/Library/bin/libiomp5md.dll',
    'C:/conda/Lib/site-packages/torch/lib/libiomp5md.dll',
  ],
};

describe('isolated model framework diagnostics', () => {
  it('keeps installed package versions when OpenMP aborts the native probe', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(metadata))
      .mockRejectedValueOnce(
        new Error(
          'OMP: Error #15: Initializing libiomp5md.dll, but found libiomp5md.dll already initialized. KMP_DUPLICATE_LIB_OK=TRUE'
        )
      );
    const result = await inspectModelFramework('python.exe', run);
    expect(result).toMatchObject({
      ...metadata,
      probeStatus: 'failed',
      errorCode: 'OPENMP_RUNTIME_CONFLICT',
    });
    expect(result.error).toContain('OpenMP');
    expect(result.error).toContain('隔离环境');
    expect(result.error).not.toContain('KMP_DUPLICATE_LIB_OK');
    expect(run.mock.calls.map((call) => call[1])).toEqual([
      ['-I', '-c', FRAMEWORK_METADATA_PROBE],
      ['-I', '-c', FRAMEWORK_PROBE],
    ]);
    expect(run.mock.calls.every((call) => !call[2]?.env)).toBe(true);
  });

  it('only reports native availability after the runtime and kernel probe succeeds', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(metadata))
      .mockResolvedValueOnce(
        JSON.stringify({
          python: '3.10.14',
          torch: '2.5.1+cu121',
          cudaRuntime: '12.1',
          cudaAvailable: true,
          kernelTest: true,
          devices: ['NVIDIA GPU'],
          architectures: ['sm_89'],
        })
      );
    expect(await inspectModelFramework('python.exe', run)).toMatchObject({
      torch: '2.5.1+cu121',
      numpy: '2.4.2',
      probeStatus: 'ready',
      kernelTest: true,
    });
  });

  it('does not import native libraries if PyTorch is absent', async () => {
    const run = vi.fn().mockResolvedValue(
      JSON.stringify({
        python: '3.10.14',
        cudaAvailable: false,
        kernelTest: false,
        devices: [],
        architectures: [],
      })
    );
    expect(await inspectModelFramework('python.exe', run)).toMatchObject({
      probeStatus: 'not-installed',
      kernelTest: false,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('preserves a normal Python import failure as an unverified runtime', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(metadata))
      .mockResolvedValueOnce(
        JSON.stringify({
          python: '3.13.11',
          cudaAvailable: false,
          kernelTest: false,
          devices: [],
          architectures: [],
          error: 'DLL load failed',
        })
      );
    expect(await inspectModelFramework('python.exe', run)).toMatchObject({
      torch: '2.14.0',
      probeStatus: 'failed',
      error: 'DLL load failed',
    });
  });
});
