<script setup lang="ts">
import { useRuntimeEnvironmentContext } from '../../composables/runtime-environment-context';
const r = useRuntimeEnvironmentContext();
defineEmits<{ open: [url: string] }>();
</script>

<template>
  <gt-card padding="sm" class="runtime-manager__card">
    <div class="runtime-manager__heading">
      <h3>{{ r.managerLabel }} 环境</h3>
      <gt-badge tone="neutral">{{ r.managerEnvironments.length }} 个</gt-badge>
    </div>
    <p class="field-hint">
      选择要管理的环境。外部环境可查看，应用创建的环境可安装包并用于图像处理。
    </p>
    <gt-select
      aria-label="查看 Python 环境"
      :value="r.environmentId"
      :options="r.envOptions"
      :disabled="r.locked || !r.envOptions.length"
      :placeholder="r.envOptions.length ? '选择环境' : `暂无 ${r.managerLabel} 环境`"
      @gt-change="r.viewEnvironment(String($event.detail.value))"
    />
    <div v-if="r.selected" class="runtime-manager__facts">
      <gt-badge :tone="r.selected.active ? 'success' : r.writable ? 'info' : 'neutral'">{{
        r.selected.active ? '图像处理环境' : r.writable ? '受管环境' : '外部 · 只读'
      }}</gt-badge>
      <span>Python {{ r.selected.version }}</span
      ><code>{{ r.selected.pythonPath }}</code>
    </div>
    <div class="runtime-manager__actions">
      <gt-button size="sm" variant="secondary" :disabled="r.locked" @gt-click="r.importEnvironment"
        >导入 {{ r.managerLabel }} 环境</gt-button
      >
      <gt-button
        size="sm"
        variant="primary"
        :disabled="r.locked || !r.writable || Boolean(r.selected?.active)"
        @gt-click="r.useEnvironment"
        >用于图像处理</gt-button
      >
      <gt-button
        v-if="r.selected?.active"
        size="sm"
        variant="ghost"
        :disabled="r.locked"
        @gt-click="r.clearActive"
        >取消指定</gt-button
      >
      <gt-button
        v-if="r.selected && !r.selected.active"
        size="sm"
        variant="danger"
        :disabled="r.locked"
        @gt-click="r.pendingRemoval = true"
        >{{ r.writable ? '删除环境' : '解除登记' }}</gt-button
      >
    </div>
    <details
      class="runtime-manager__create"
      :open="!r.managerEnvironments.length"
      :key="r.environmentManager"
    >
      <summary>创建 {{ r.managerLabel }} 环境</summary>
      <label class="control-field"
        ><span>名称</span
        ><gt-input
          :value="r.createName"
          :disabled="r.locked"
          aria-label="新环境名称"
          @gt-input="r.createName = String($event.detail.value)"
      /></label>
      <label class="control-field"
        ><span>Python 版本</span
        ><gt-select
          aria-label="Python 版本"
          :value="r.pythonVersion"
          :options="r.pythonOptions"
          :disabled="r.locked"
          @gt-change="r.pythonVersion = String($event.detail.value)"
      /></label>
      <label v-if="r.environmentManager === 'venv'" class="control-field"
        ><span>基础解释器</span
        ><gt-select
          aria-label="基础解释器"
          :value="r.baseId"
          :options="r.baseOptions"
          :disabled="r.locked"
          @gt-change="r.baseId = String($event.detail.value)"
      /></label>
      <p class="field-hint">
        {{
          r.environmentManager === 'venv'
            ? '使用已有的同版本 Python 创建 .venv。'
            : '管理器会下载所选版本的 Python。'
        }}当前 Real-CUGAN 使用 Python 3.10。
      </p>
      <gt-button
        size="sm"
        variant="primary"
        :disabled="!r.canCreate"
        @gt-click="r.createEnvironment"
        >创建 {{ r.managerLabel }} 环境</gt-button
      >
    </details>
    <div v-if="!r.managerAvailable" class="runtime-manager__empty">
      <p>未检测到 {{ r.managerLabel }}，安装后刷新检测。</p>
      <gt-button
        v-if="r.environmentManager === 'uv'"
        variant="secondary"
        size="sm"
        @gt-click="$emit('open', 'https://docs.astral.sh/uv/getting-started/installation/')"
        >uv 安装说明</gt-button
      >
      <gt-button
        v-if="r.environmentManager === 'conda'"
        variant="secondary"
        size="sm"
        :disabled="r.locked"
        @gt-click="r.installMiniforge"
        >安装应用私有 Miniforge</gt-button
      >
    </div>
    <details v-if="r.managerTools.length" class="runtime-manager__tools">
      <summary>工具路径</summary>
      <p v-for="tool in r.managerTools" :key="tool.path">
        <strong>{{ tool.version }}</strong
        ><code>{{ tool.path }}</code>
      </p>
    </details>
    <p v-for="issue in r.snapshot.errors" :key="issue" class="field-hint">{{ issue }}</p>
  </gt-card>
</template>
