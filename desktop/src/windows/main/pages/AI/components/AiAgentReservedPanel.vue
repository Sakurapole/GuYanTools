<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { AiAgentMode } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import { useAiConfigStore } from '@/windows/main/stores/ai_config_store';

const aiConfigStore = useAiConfigStore();
const maxStepsInput = ref('5');
const defaultAgentMode = ref<AiAgentMode>('general-agent');
const codexWorkingDirectory = ref('');
const codexConfigJson = ref('');

const agentConfig = computed(() => aiConfigStore.config.agent);
const modeOptions: { label: string; value: AiAgentMode }[] = [
  { label: '通用 Agent', value: 'general-agent' },
  { label: 'Code Agent', value: 'code-agent' },
];

watch(
  agentConfig,
  (agent) => {
    maxStepsInput.value = String(agent.maxSteps);
    defaultAgentMode.value = agent.defaultAgentMode;
    codexWorkingDirectory.value = agent.codex.lastWorkingDirectory ?? '';
    codexConfigJson.value = agent.codex.cliConfigJson ?? '';
  },
  { immediate: true },
);

async function updateAgent(patch: Partial<typeof agentConfig.value>) {
  await aiConfigStore.updateConfig({
    agent: {
      ...agentConfig.value,
      ...patch,
      codex: {
        ...agentConfig.value.codex,
        ...(patch.codex ?? {}),
      },
      general: {
        ...agentConfig.value.general,
        ...(patch.general ?? {}),
      },
    },
  });
}

async function toggleFeature(enabled: boolean) {
  await aiConfigStore.updateConfig({
    enabled,
    defaultMode: enabled ? aiConfigStore.config.defaultMode : 'chat',
  });
}

async function commitDefaultMode() {
  await updateAgent({ defaultAgentMode: defaultAgentMode.value });
  await aiConfigStore.updateConfig({ defaultMode: defaultAgentMode.value });
}

async function commitMaxSteps() {
  const value = Math.max(1, Math.min(32, Math.round(Number(maxStepsInput.value) || 5)));
  maxStepsInput.value = String(value);
  await updateAgent({ maxSteps: value });
}

async function commitCodexReservedFields() {
  await updateAgent({
    codex: {
      ...agentConfig.value.codex,
      lastWorkingDirectory: codexWorkingDirectory.value.trim(),
      cliConfigJson: codexConfigJson.value.trim(),
    },
  });
}
</script>

<template>
  <section class="ai-agent-panel">
    <header class="ai-agent-panel__header">
      <div>
        <h3>Agent 工作区</h3>
        <p>V2.0 先保留执行边界，真实 Code Agent / 通用 Agent 运行时后续接入。</p>
      </div>
      <label class="ai-agent-panel__switch">
        <input
          type="checkbox"
          :checked="aiConfigStore.config.enabled"
          :disabled="aiConfigStore.saving"
          @change="toggleFeature(($event.target as HTMLInputElement).checked)"
        >
        <span>启用 AI 功能</span>
      </label>
    </header>

    <div class="ai-agent-panel__controls">
      <label class="ai-agent-panel__field">
        <span>默认 Agent</span>
        <UiSelect
          v-model="defaultAgentMode"
          size="sm"
          :options="modeOptions"
          :disabled="aiConfigStore.saving"
          @update:modelValue="commitDefaultMode"
        />
      </label>
      <label class="ai-agent-panel__field">
        <span>最大步骤</span>
        <UiInput
          v-model="maxStepsInput"
          size="sm"
          type="number"
          :min="1"
          :max="32"
          :disabled="aiConfigStore.saving"
          @blur="commitMaxSteps"
          @keydown.enter.prevent="commitMaxSteps"
        />
      </label>
      <label class="ai-agent-panel__check">
        <input
          type="checkbox"
          :checked="agentConfig.enabled"
          :disabled="aiConfigStore.saving"
          @change="updateAgent({ enabled: ($event.target as HTMLInputElement).checked })"
        >
        <span>开放 Agent 入口</span>
      </label>
      <label class="ai-agent-panel__check">
        <input
          type="checkbox"
          :checked="agentConfig.requireApprovalForWriteTools"
          :disabled="aiConfigStore.saving"
          @change="updateAgent({ requireApprovalForWriteTools: ($event.target as HTMLInputElement).checked })"
        >
        <span>写入类工具需要确认</span>
      </label>
    </div>

    <div class="ai-agent-panel__modes">
      <article class="ai-agent-mode" :class="{ 'ai-agent-mode--active': agentConfig.defaultAgentMode === 'general-agent' }">
        <div class="ai-agent-mode__head">
          <div>
            <h4>通用 Agent</h4>
            <p>面向资料整理、跨工具任务和后续自定义工具编排。</p>
          </div>
          <label class="ai-agent-panel__check">
            <input
              type="checkbox"
              :checked="agentConfig.general.enabled"
              :disabled="aiConfigStore.saving"
              @change="updateAgent({ general: { ...agentConfig.general, enabled: ($event.target as HTMLInputElement).checked } })"
            >
            <span>预留</span>
          </label>
        </div>
        <dl class="ai-agent-mode__meta">
          <div>
            <dt>模板数量</dt>
            <dd>{{ agentConfig.general.agents.length }}</dd>
          </div>
          <div>
            <dt>默认模板</dt>
            <dd>{{ agentConfig.general.defaultAgentId || '未设置' }}</dd>
          </div>
          <div>
            <dt>工具策略</dt>
            <dd>仅保存配置，不执行工具</dd>
          </div>
        </dl>
        <UiButton size="sm" variant="secondary" disabled>等待执行层接入</UiButton>
      </article>

      <article class="ai-agent-mode" :class="{ 'ai-agent-mode--active': agentConfig.defaultAgentMode === 'code-agent' }">
        <div class="ai-agent-mode__head">
          <div>
            <h4>Code Agent</h4>
            <p>预留给后续 Codex SDK，本版本不启动命令、不读写项目文件。</p>
          </div>
          <label class="ai-agent-panel__check">
            <input
              type="checkbox"
              :checked="agentConfig.codex.enabled"
              :disabled="aiConfigStore.saving"
              @change="updateAgent({ codex: { ...agentConfig.codex, enabled: ($event.target as HTMLInputElement).checked } })"
            >
            <span>预留</span>
          </label>
        </div>
        <div class="ai-agent-mode__form">
          <label class="ai-agent-panel__field">
            <span>默认工作目录</span>
            <UiInput
              v-model="codexWorkingDirectory"
              size="sm"
              :disabled="aiConfigStore.saving"
              placeholder="后续运行时使用"
              @blur="commitCodexReservedFields"
              @keydown.enter.prevent="commitCodexReservedFields"
            />
          </label>
          <label class="ai-agent-panel__check">
            <input
              type="checkbox"
              :checked="agentConfig.codex.skipGitRepoCheck"
              :disabled="aiConfigStore.saving"
              @change="updateAgent({ codex: { ...agentConfig.codex, skipGitRepoCheck: ($event.target as HTMLInputElement).checked } })"
            >
            <span>允许跳过 Git 仓库检查</span>
          </label>
          <label class="ai-agent-panel__field ai-agent-panel__field--wide">
            <span>Codex 配置 JSON</span>
            <textarea
              v-model="codexConfigJson"
              :disabled="aiConfigStore.saving"
              spellcheck="false"
              placeholder="{ }"
              @blur="commitCodexReservedFields"
            />
          </label>
        </div>
        <UiButton size="sm" variant="secondary" disabled>等待 Codex SDK 接入</UiButton>
      </article>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.ai-agent-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
  padding: 18px;
  background: var(--ui-surface-base);
}

.ai-agent-panel__header,
.ai-agent-mode__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.ai-agent-panel__header h3,
.ai-agent-mode h4 {
  margin: 0;
  color: var(--ui-text-primary);
  font-size: 1rem;
  font-weight: 760;
}

.ai-agent-panel__header p,
.ai-agent-mode p {
  margin: 4px 0 0;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.ai-agent-panel__controls {
  display: grid;
  grid-template-columns: minmax(160px, 220px) 110px auto auto;
  align-items: end;
  gap: 10px;
  padding: 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.ai-agent-panel__field {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 0.78rem;

  &--wide {
    grid-column: 1 / -1;
  }

  textarea {
    min-height: 74px;
    resize: vertical;
    border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
    border-radius: var(--ui-radius-sm);
    padding: 8px 10px;
    color: var(--ui-text-primary);
    background: var(--ui-surface-base);
    font: 12px/1.5 var(--ui-font-mono, monospace);
  }
}

.ai-agent-panel__switch,
.ai-agent-panel__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  white-space: nowrap;
}

.ai-agent-panel__modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  min-height: 0;
}

.ai-agent-mode {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  padding: 14px;
  background: var(--ui-surface-base);

  &--active {
    border-color: var(--ui-accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-accent) 32%, transparent);
  }
}

.ai-agent-mode__meta {
  display: grid;
  gap: 8px;
  margin: 0;

  div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    color: var(--ui-text-muted);
    font-size: 0.8rem;
  }

  dt,
  dd {
    margin: 0;
  }

  dd {
    color: var(--ui-text-primary);
    overflow-wrap: anywhere;
  }
}

.ai-agent-mode__form {
  display: grid;
  gap: 10px;
}

@media (max-width: 1180px) {
  .ai-agent-panel__controls,
  .ai-agent-panel__modes {
    grid-template-columns: 1fr;
  }
}
</style>
