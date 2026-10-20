<script setup lang="ts">
import { useRuntimeEnvironmentContext } from '../../composables/runtime-environment-context';
const r = useRuntimeEnvironmentContext();
</script>

<template>
  <gt-card padding="sm" class="runtime-manager__card"
    ><h3>CUDA 与框架</h3>
    <details class="runtime-manager__diagnostics" :open="Boolean(r.diagnostics?.framework?.error)">
      <summary>查看设备与框架诊断</summary>
      <p class="field-hint">
        驱动上限、Toolkit 和 wheel runtime 是不同版本。选择依赖组合不会改系统驱动或 PATH。
      </p>
      <template v-if="r.diagnostics"
        ><dl>
          <dt>平台</dt>
          <dd>{{ r.diagnostics.platform }} / {{ r.diagnostics.architecture }}</dd>
          <dt>驱动支持 CUDA</dt>
          <dd>{{ r.diagnostics.driverCudaMax || '未检测到 NVIDIA 驱动' }}</dd>
          <dt>Toolkit</dt>
          <dd v-if="!r.diagnostics.toolkits.length">未检测到 nvcc</dd>
          <dd v-else>
            <p v-for="toolkit in r.diagnostics.toolkits" :key="toolkit.path">
              {{ toolkit.version }} <code>{{ toolkit.path }}</code>
            </p>
          </dd>
          <dt>PyTorch</dt>
          <dd>{{ r.diagnostics.framework?.torch || '所选环境未安装' }}</dd>
          <dt>NumPy</dt>
          <dd>{{ r.diagnostics.framework?.numpy || '所选环境未安装' }}</dd>
          <dt>wheel runtime</dt>
          <dd>
            {{
              r.diagnostics.framework?.probeStatus === 'failed'
                ? '未验证（原生库加载失败）'
                : r.diagnostics.framework?.cudaRuntime || 'CPU / 未安装'
            }}
          </dd>
          <dt>cuDNN</dt>
          <dd>
            {{
              r.diagnostics.framework?.probeStatus === 'failed'
                ? '未验证'
                : r.diagnostics.framework?.cudnn || '未安装'
            }}
          </dd>
          <dt>CUDA 运算检查</dt>
          <dd>{{ r.diagnostics.framework?.kernelTest ? '通过' : '未通过 / 未安装 CUDA 依赖' }}</dd>
          <dt>ONNX Runtime / TensorRT</dt>
          <dd>
            {{ r.diagnostics.framework?.onnxruntime || '未安装' }} /
            {{ r.diagnostics.framework?.tensorrt || '未安装' }}
          </dd>
          <dt>剩余磁盘</dt>
          <dd>
            {{
              r.diagnostics.freeBytes
                ? (r.diagnostics.freeBytes / 1024 ** 3).toFixed(1) + ' GiB'
                : '未知'
            }}
          </dd>
          <dt>环境目录</dt>
          <dd>
            <code>{{ r.diagnostics.environmentRoot }}</code>
          </dd>
          <dt>运行时缓存</dt>
          <dd>
            <code>{{ r.diagnostics.cacheRoot }}</code>
          </dd>
        </dl>
        <p v-for="gpu in r.diagnostics.gpus" :key="gpu.index" class="runtime-manager__gpu">
          GPU {{ gpu.index }} · {{ gpu.name }}<br />驱动 {{ gpu.driverVersion }} ·
          {{ gpu.memoryMiB }} MiB 显存
        </p>
        <p v-if="r.diagnostics.framework?.error" class="runtime-manager__error">
          {{ r.diagnostics.framework.error }}
        </p>
        <div
          v-if="r.diagnostics.framework?.errorCode === 'OPENMP_RUNTIME_CONFLICT'"
          class="runtime-manager__tools"
        >
          <strong>检测到的 OpenMP 运行库</strong>
          <code v-for="library in r.diagnostics.framework.openmpLibraries" :key="library">{{
            library
          }}</code>
          <p class="field-hint">
            当前 Real-CUGAN 请创建 Python 3.10
            隔离环境，安装所需依赖组合后重新检测。外部环境保持只读。
          </p>
        </div>
        <p v-for="warning in r.diagnostics.warnings" :key="warning" class="field-hint">
          {{ warning }}
        </p></template
      >
    </details>
    <label class="control-field"
      ><span>安装运行时版本组合</span
      ><gt-select
        aria-label="CUDA 版本组合"
        :value="r.profileId"
        :options="r.profileOptions"
        :disabled="r.locked"
        @gt-change="r.profileId = String($event.detail.value)"
    /></label>
    <p v-if="r.selectedProfile" class="field-hint">
      {{ r.selectedProfile.packages.join(' / ') }}<br />{{ r.selectedProfile.indexUrl }}
    </p>
    <gt-button
      variant="primary"
      size="sm"
      :disabled="
        r.locked ||
        !r.writable ||
        !r.selected?.active ||
        !r.selectedProfile ||
        r.profileOptions.find((item) => item.value === r.profileId)?.disabled
      "
      @gt-click="r.installProfile"
      >安装选定组合</gt-button
    >
    <p class="field-hint">先设为生效环境。安装后会刷新框架状态；检测成功前不宣称模型可以运行。</p>
  </gt-card>
</template>
