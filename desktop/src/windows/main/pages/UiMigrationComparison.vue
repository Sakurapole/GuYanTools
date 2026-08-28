<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { defineCustomElements } from '@guyantools/ui-core';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiCheckbox from '../components/ui/UiCheckbox.vue';
import UiDialog from '../components/ui/UiDialog.vue';
import UiDatePicker from '../components/ui/UiDatePicker.vue';
import UiDateTimePicker from '../components/ui/UiDateTimePicker.vue';
import UiEmptyState from '../components/ui/UiEmptyState.vue';
import UiField from '../components/ui/UiField.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiInput from '../components/ui/UiInput.vue';
import UiRadio from '../components/ui/UiRadio.vue';
import UiSelect, { type UiSelectOption } from '../components/ui/UiSelect.vue';
import UiStateCard from '../components/ui/UiStateCard.vue';
import UiSwitch from '../components/ui/UiSwitch.vue';
import UiTabs, { type UiTabItem } from '../components/ui/UiTabs.vue';
import UiTextarea from '../components/ui/UiTextarea.vue';
import UiTimePicker from '../components/ui/UiTimePicker.vue';

type ComponentStatus = 'aligned' | 'review';

type ComparisonComponent = {
  id: string;
  label: string;
  group: '基础' | '表单' | '反馈';
  status: ComponentStatus;
  description: string;
};

const componentCatalog: ComparisonComponent[] = [
  { id: 'button', label: 'Button', group: '基础', status: 'aligned', description: '主要操作、次要操作和禁用状态。' },
  { id: 'icon-button', label: 'IconButton', group: '基础', status: 'aligned', description: '紧凑图标入口与可访问标签。' },
  { id: 'card', label: 'Card', group: '基础', status: 'aligned', description: '标题、内容与页脚分区。' },
  { id: 'field', label: 'Field', group: '表单', status: 'aligned', description: '标签、必填标记、提示与错误信息。' },
  { id: 'input', label: 'Input', group: '表单', status: 'aligned', description: '文本输入、前后缀和数字步进器。' },
  { id: 'textarea', label: 'Textarea', group: '表单', status: 'aligned', description: '多行输入、焦点态和调整尺寸。' },
  { id: 'checkbox', label: 'Checkbox', group: '表单', status: 'aligned', description: '复选、半选、禁用状态与说明文本。' },
  { id: 'radio', label: 'Radio', group: '表单', status: 'aligned', description: '单选组的选中状态。' },
  { id: 'select', label: 'Select', group: '表单', status: 'aligned', description: '下拉选项、禁用项、键盘导航与 body 浮层。' },
  { id: 'date-picker', label: 'DatePicker', group: '表单', status: 'aligned', description: '日期触发器、日历浮层、边缘翻转与清除。' },
  { id: 'time-picker', label: 'TimePicker', group: '表单', status: 'aligned', description: '小时分钟选择、步长、快捷现在与浮层定位。' },
  { id: 'date-time-picker', label: 'DateTimePicker', group: '表单', status: 'aligned', description: '日期时间组合、SQL/时间戳格式与双控件同步。' },
  { id: 'switch', label: 'Switch', group: '表单', status: 'aligned', description: '二元开关和尺寸。' },
  { id: 'tabs', label: 'Tabs', group: '基础', status: 'aligned', description: '标签项、激活指示器与切换行为。' },
  { id: 'empty-state', label: 'EmptyState', group: '反馈', status: 'aligned', description: '空内容提示与操作入口。' },
  { id: 'state-card', label: 'StateCard', group: '反馈', status: 'aligned', description: '首页加载、空态和错误态的共同样式契约。' },
  { id: 'dialog', label: 'Dialog', group: '基础', status: 'aligned', description: '遮罩、标题区、内容区、底部操作与关闭行为。' },
];

const selectedId = ref('state-card');
const selectedComponent = computed(() => componentCatalog.find(component => component.id === selectedId.value) ?? componentCatalog[0]);
const groupedComponents = computed(() => ['基础', '表单', '反馈'].map(group => ({
  group,
  items: componentCatalog.filter(component => component.group === group),
})));

const legacyInput = ref('对齐输入值');
const stencilInput = ref('对齐输入值');
const legacyTextarea = ref('对齐多行输入。');
const stencilTextarea = ref('对齐多行输入。');
const legacyChecked = ref(true);
const stencilChecked = ref(true);
const legacyRadio = ref('standard');
const stencilRadio = ref('standard');
const legacySelect = ref<string | number>('standard');
const stencilSelect = ref<string | number>('standard');
const legacyDate = ref('2026-08-15');
const stencilDate = ref('2026-08-15');
const legacyTime = ref('09:30');
const stencilTime = ref('09:30');
const legacyDateTime = ref<string | number>('2026-08-15T09:30');
const stencilDateTime = ref<string | number>('2026-08-15T09:30');
const legacySwitch = ref(true);
const stencilSwitch = ref(true);
const legacyTab = ref('overview');
const stencilTab = ref('overview');
const stateCardState = ref<'loading' | 'empty' | 'error'>('loading');
const legacyDialogOpen = ref(false);
const stencilDialogOpen = ref(false);

const tabs: UiTabItem[] = [
  { key: 'overview', label: '概览' },
  { key: 'details', label: '详情' },
  { key: 'settings', label: '设置' },
];
const stencilTabs = tabs.map(({ key, label, disabled }) => ({ value: key, label, disabled }));
const selectOptions: UiSelectOption[] = [
  { label: '标准', value: 'standard' },
  { label: '紧凑（禁用）', value: 'compact', disabled: true },
  { label: '高级', value: 'advanced' },
];

function updateStencilText(target: 'input' | 'textarea', event: Event) {
  const value = (event as CustomEvent<{ value: string }>).detail.value;
  if (target === 'input') stencilInput.value = value;
  else stencilTextarea.value = value;
}

function updateStencilChecked(target: 'checkbox' | 'switch', event: Event) {
  const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked;
  if (target === 'checkbox') stencilChecked.value = checked;
  else stencilSwitch.value = checked;
}

function updateStencilRadio(event: Event) {
  stencilRadio.value = (event as CustomEvent<{ value: string }>).detail.value;
}

function updateStencilSelect(event: Event) {
  stencilSelect.value = (event as CustomEvent<{ value: string | number }>).detail.value;
}

function updateStencilDate(event: Event) {
  stencilDate.value = (event as CustomEvent<{ value: string }>).detail.value;
}

function updateStencilTime(event: Event) {
  stencilTime.value = (event as CustomEvent<{ value: string }>).detail.value;
}

function updateStencilDateTime(event: Event) {
  stencilDateTime.value = (event as CustomEvent<{ value: string | number | undefined }>).detail.value ?? '';
}

function updateStencilTab(event: Event) {
  stencilTab.value = (event as CustomEvent<{ value: string }>).detail.value;
}

function openComparisonDialog(version: 'legacy' | 'stencil') {
  legacyDialogOpen.value = version === 'legacy';
  stencilDialogOpen.value = version === 'stencil';
}

function handleStencilDialogChange(event: Event) {
  stencilDialogOpen.value = (event as CustomEvent<{ open: boolean }>).detail.open;
}

onMounted(() => {
  defineCustomElements();
});
</script>

<template>
  <main class="ui-migration-page">
    <aside class="ui-migration-page__sidebar" aria-label="组件目录">
      <div class="ui-migration-page__sidebar-head">
        <span class="ui-migration-page__eyebrow">DEV ONLY</span>
        <h1>组件迁移对比</h1>
        <p>同一组 props 与内容，核对 Vue legacy 和 Stencil 的真实渲染差异。</p>
      </div>

      <nav class="ui-migration-page__catalog">
        <section v-for="group in groupedComponents" :key="group.group" class="ui-migration-page__catalog-group">
          <h2>{{ group.group }}</h2>
          <button
            v-for="component in group.items"
            :key="component.id"
            class="ui-migration-page__catalog-item"
            :class="{ 'ui-migration-page__catalog-item--active': selectedComponent.id === component.id }"
            type="button"
            @click="selectedId = component.id"
          >
            <span>{{ component.label }}</span>
            <small :class="`ui-migration-page__status ui-migration-page__status--${component.status}`">
              {{ component.status === 'aligned' ? '已对齐' : '待核对' }}
            </small>
          </button>
        </section>
      </nav>
    </aside>

    <section class="ui-migration-page__workspace">
      <header class="ui-migration-page__workspace-head">
        <div>
          <span class="ui-migration-page__eyebrow">{{ selectedComponent.group }}</span>
          <h2>{{ selectedComponent.label }}</h2>
          <p>{{ selectedComponent.description }}</p>
        </div>
        <span :class="`ui-migration-page__status ui-migration-page__status--${selectedComponent.status}`">
          {{ selectedComponent.status === 'aligned' ? '样式已对齐' : '等待视觉核对' }}
        </span>
      </header>

      <div v-if="selectedComponent.id === 'state-card'" class="ui-migration-page__state-picker" role="group" aria-label="StateCard 状态">
        <button v-for="state in ['loading', 'empty', 'error']" :key="state" type="button" :class="{ active: stateCardState === state }" @click="stateCardState = state as typeof stateCardState">{{ state }}</button>
      </div>

      <div class="ui-migration-page__comparison-grid">
        <article class="ui-migration-page__comparison">
          <header><span>Vue Legacy</span><code>desktop/Ui*.vue</code></header>
          <div class="ui-migration-page__stage">
            <template v-if="selectedComponent.id === 'button'">
              <UiButton variant="primary"><template #prefix>+</template>保存更改</UiButton>
            </template>
            <template v-else-if="selectedComponent.id === 'icon-button'">
              <UiIconButton label="添加项目" title="添加项目">+</UiIconButton>
            </template>
            <template v-else-if="selectedComponent.id === 'card'">
              <UiCard class="ui-migration-page__sample-card" padding="md" radius="md">
                <template #header><strong>连接状态</strong></template>
                <span>配置在本地保存。</span>
                <template #footer><small>刚刚更新</small></template>
              </UiCard>
            </template>
            <template v-else-if="selectedComponent.id === 'field'">
              <UiField label="显示名称" required hint="用于组件区域的标题。"><UiInput model-value="工作台" /></UiField>
            </template>
            <template v-else-if="selectedComponent.id === 'input'">
              <UiInput v-model="legacyInput" placeholder="输入内容" />
            </template>
            <template v-else-if="selectedComponent.id === 'textarea'">
              <UiTextarea v-model="legacyTextarea" :rows="4" placeholder="输入说明" />
            </template>
            <template v-else-if="selectedComponent.id === 'checkbox'">
              <UiCheckbox v-model="legacyChecked">启用桌面通知</UiCheckbox>
            </template>
            <template v-else-if="selectedComponent.id === 'radio'">
              <div class="ui-migration-page__choice-row"><UiRadio v-model="legacyRadio" value="standard" name="legacy-radio">标准</UiRadio><UiRadio v-model="legacyRadio" value="compact" name="legacy-radio">紧凑</UiRadio></div>
            </template>
            <template v-else-if="selectedComponent.id === 'select'">
              <UiSelect v-model="legacySelect" :options="selectOptions" placeholder="请选择模式" />
            </template>
            <template v-else-if="selectedComponent.id === 'date-picker'">
              <UiDatePicker v-model="legacyDate" />
            </template>
            <template v-else-if="selectedComponent.id === 'time-picker'">
              <UiTimePicker v-model="legacyTime" :minute-step="5" />
            </template>
            <template v-else-if="selectedComponent.id === 'date-time-picker'">
              <UiDateTimePicker v-model="legacyDateTime" value-format="datetime-local" />
            </template>
            <template v-else-if="selectedComponent.id === 'switch'">
              <UiSwitch v-model="legacySwitch" aria-label="启用自动同步" />
            </template>
            <template v-else-if="selectedComponent.id === 'tabs'">
              <UiTabs v-model="legacyTab" :items="tabs" />
            </template>
            <template v-else-if="selectedComponent.id === 'empty-state'">
              <UiEmptyState title="暂无组件" description="从左侧选择一个组件开始对比。"><UiButton size="sm">创建组件</UiButton></UiEmptyState>
            </template>
            <template v-else-if="selectedComponent.id === 'dialog'">
              <div class="ui-migration-page__dialog-trigger">
                <span>Legacy 弹窗</span>
                <UiButton variant="secondary" @click="openComparisonDialog('legacy')">打开弹窗</UiButton>
              </div>
            </template>
            <template v-else>
              <UiStateCard class="ui-migration-page__state-card" :state="stateCardState" title="首页布局加载中" description="正在恢复桌面工作台布局。" />
            </template>
          </div>
        </article>

        <article class="ui-migration-page__comparison">
          <header><span>Stencil</span><code>packages/ui-core/gt-*</code></header>
          <div class="ui-migration-page__stage">
            <template v-if="selectedComponent.id === 'button'">
              <gt-button variant="primary"><span slot="prefix">+</span>保存更改</gt-button>
            </template>
            <template v-else-if="selectedComponent.id === 'icon-button'">
              <gt-icon-button label="添加项目" title="添加项目">+</gt-icon-button>
            </template>
            <template v-else-if="selectedComponent.id === 'card'">
              <gt-card class="ui-migration-page__sample-card" padding="md" radius="md"><strong slot="header">连接状态</strong><span>配置在本地保存。</span><small slot="footer">刚刚更新</small></gt-card>
            </template>
            <template v-else-if="selectedComponent.id === 'field'">
              <gt-field label="显示名称" required hint="用于组件区域的标题。"><gt-input value="工作台" /></gt-field>
            </template>
            <template v-else-if="selectedComponent.id === 'input'">
              <gt-input :value="stencilInput" placeholder="输入内容" @gt-input="updateStencilText('input', $event)" />
            </template>
            <template v-else-if="selectedComponent.id === 'textarea'">
              <gt-textarea :value="stencilTextarea" :rows="4" placeholder="输入说明" @gt-input="updateStencilText('textarea', $event)" />
            </template>
            <template v-else-if="selectedComponent.id === 'checkbox'">
              <gt-checkbox :checked="stencilChecked" @gt-change="updateStencilChecked('checkbox', $event)">启用桌面通知</gt-checkbox>
            </template>
            <template v-else-if="selectedComponent.id === 'radio'">
              <div class="ui-migration-page__choice-row"><gt-radio value="standard" :checked="stencilRadio === 'standard'" name="stencil-radio" @gt-change="updateStencilRadio">标准</gt-radio><gt-radio value="compact" :checked="stencilRadio === 'compact'" name="stencil-radio" @gt-change="updateStencilRadio">紧凑</gt-radio></div>
            </template>
            <template v-else-if="selectedComponent.id === 'select'">
              <gt-select :value="stencilSelect" :options="selectOptions" placeholder="请选择模式" @gt-change="updateStencilSelect" />
            </template>
            <template v-else-if="selectedComponent.id === 'date-picker'">
              <gt-date-picker :value="stencilDate" @gt-change="updateStencilDate" />
            </template>
            <template v-else-if="selectedComponent.id === 'time-picker'">
              <gt-time-picker :value="stencilTime" :minute-step="5" @gt-change="updateStencilTime" />
            </template>
            <template v-else-if="selectedComponent.id === 'date-time-picker'">
              <gt-date-time-picker :value="stencilDateTime" value-format="datetime-local" @gt-change="updateStencilDateTime" />
            </template>
            <template v-else-if="selectedComponent.id === 'switch'">
              <gt-switch :checked="stencilSwitch" aria-label="启用自动同步" @gt-change="updateStencilChecked('switch', $event)" />
            </template>
            <template v-else-if="selectedComponent.id === 'tabs'">
              <gt-tabs :value="stencilTab" :items="stencilTabs" @gt-change="updateStencilTab" />
            </template>
            <template v-else-if="selectedComponent.id === 'empty-state'">
              <gt-empty-state title="暂无组件" description="从左侧选择一个组件开始对比。"><gt-button size="sm">创建组件</gt-button></gt-empty-state>
            </template>
            <template v-else-if="selectedComponent.id === 'dialog'">
              <div class="ui-migration-page__dialog-trigger">
                <span>Stencil 弹窗</span>
                <gt-button variant="secondary" @gt-click="openComparisonDialog('stencil')">打开弹窗</gt-button>
              </div>
            </template>
            <template v-else>
              <gt-state-card class="ui-migration-page__state-card" :state="stateCardState" title="首页布局加载中" description="正在恢复桌面工作台布局。" />
            </template>
          </div>
        </article>
      </div>
    </section>

    <UiDialog
      v-model="legacyDialogOpen"
      class="ui-migration-dialog"
      width="420px"
      max-width="420px"
      aria-label="Legacy Dialog 对比"
    >
      <template #header>
        <div class="ui-migration-dialog__header">
          <h3>Dialog 对比</h3>
          <UiIconButton title="关闭" size="md" variant="ghost" @click="legacyDialogOpen = false">✕</UiIconButton>
        </div>
      </template>
      <div class="ui-migration-dialog__body">
        <UiField label="弹窗内容" for="legacy-dialog-input">
          <UiInput id="legacy-dialog-input" model-value="Legacy Dialog" />
        </UiField>
        <p>检查标题、内容区间距、遮罩和关闭行为。</p>
      </div>
      <template #footer>
        <div class="ui-migration-dialog__footer">
          <UiButton variant="secondary" @click="legacyDialogOpen = false">取消</UiButton>
          <UiButton variant="primary" @click="legacyDialogOpen = false">确认</UiButton>
        </div>
      </template>
    </UiDialog>

    <gt-dialog
      :open="stencilDialogOpen"
      class="ui-migration-dialog"
      style="--gt-dialog-width: 420px;"
      aria-label="Stencil Dialog 对比"
      @gt-open-change="handleStencilDialogChange"
    >
      <div slot="header" class="ui-migration-dialog__header">
        <h3>Dialog 对比</h3>
        <gt-icon-button title="关闭" size="md" variant="ghost" @gt-click="stencilDialogOpen = false">✕</gt-icon-button>
      </div>
      <div class="ui-migration-dialog__body">
        <gt-field label="弹窗内容" for="stencil-dialog-input">
          <gt-input id="stencil-dialog-input" value="Stencil Dialog" />
        </gt-field>
        <p>检查标题、内容区间距、遮罩和关闭行为。</p>
      </div>
      <div slot="footer" class="ui-migration-dialog__footer">
        <gt-button variant="secondary" @gt-click="stencilDialogOpen = false">取消</gt-button>
        <gt-button variant="primary" @gt-click="stencilDialogOpen = false">确认</gt-button>
      </div>
    </gt-dialog>
  </main>
</template>

<style lang="scss" scoped>
.ui-migration-page { display: grid; flex: 1; min-height: 0; grid-template-columns: 236px minmax(0, 1fr); background: var(--ui-surface-base); color: var(--ui-text-primary); }
.ui-migration-page__sidebar { display: flex; min-height: 0; flex-direction: column; border-right: var(--ui-border-width-thin) solid var(--ui-border-subtle); background: var(--ui-surface-panel); }
.ui-migration-page__sidebar-head { padding: 24px 20px 18px; border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle); }
.ui-migration-page__eyebrow { display: block; color: var(--ui-text-subtle); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; }
.ui-migration-page h1, .ui-migration-page h2, .ui-migration-page p { margin: 0; }
.ui-migration-page h1 { margin-top: 8px; font-size: 1.05rem; }
.ui-migration-page__sidebar-head p, .ui-migration-page__workspace-head p { margin-top: 8px; color: var(--ui-text-muted); font-size: 0.8rem; line-height: 1.55; }
.ui-migration-page__catalog { overflow-y: auto; padding: 14px 10px 20px; }
.ui-migration-page__catalog-group + .ui-migration-page__catalog-group { margin-top: 18px; }
.ui-migration-page__catalog-group h2 { margin: 0 8px 6px; color: var(--ui-text-subtle); font-size: 0.72rem; font-weight: 700; }
.ui-migration-page__catalog-item { display: flex; width: 100%; min-height: 34px; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 0; border-radius: var(--ui-radius-sm); background: transparent; color: var(--ui-text-muted); cursor: pointer; font: inherit; font-size: 0.82rem; text-align: left; }
.ui-migration-page__catalog-item:hover { background: var(--ui-surface-panel-muted); color: var(--ui-text-primary); }
.ui-migration-page__catalog-item--active { background: color-mix(in srgb, var(--gt-color-primary) 13%, transparent); color: var(--ui-text-primary); }
.ui-migration-page__status { display: inline-flex; flex: 0 0 auto; align-items: center; padding: 2px 6px; border-radius: var(--ui-radius-full); font-size: 0.67rem; font-weight: 700; white-space: nowrap; }
.ui-migration-page__status--aligned { background: rgba(16, 185, 129, 0.14); color: #047857; }
.ui-migration-page__status--review { background: color-mix(in srgb, var(--gt-color-primary) 13%, transparent); color: var(--ui-text-muted); }
.ui-migration-page__workspace { min-width: 0; overflow: auto; padding: 28px 32px 32px; }
.ui-migration-page__workspace-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 20px; border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle); }
.ui-migration-page__workspace-head h2 { margin-top: 5px; font-size: 1.35rem; }
.ui-migration-page__state-picker { display: flex; gap: 6px; margin-top: 18px; }
.ui-migration-page__state-picker button { min-height: 30px; padding: 0 10px; border: var(--ui-border-width-thin) solid var(--ui-border-subtle); border-radius: var(--ui-radius-sm); background: var(--ui-surface-panel); color: var(--ui-text-muted); cursor: pointer; font: inherit; font-size: 0.76rem; }
.ui-migration-page__state-picker button.active { border-color: var(--gt-color-primary); background: color-mix(in srgb, var(--gt-color-primary) 12%, transparent); color: var(--ui-text-primary); }
.ui-migration-page__comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 22px; }
.ui-migration-page__comparison { min-width: 0; border: var(--ui-border-width-thin) solid var(--ui-border-subtle); border-radius: var(--ui-radius-md); background: var(--ui-surface-panel); overflow: hidden; }
.ui-migration-page__comparison > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle); background: var(--ui-surface-panel-muted); }
.ui-migration-page__comparison > header span { font-size: 0.84rem; font-weight: 700; }
.ui-migration-page__comparison code { color: var(--ui-text-subtle); font-size: 0.68rem; }
.ui-migration-page__stage { display: flex; min-height: 280px; align-items: center; justify-content: center; padding: 28px; box-sizing: border-box; }
.ui-migration-page__stage > :deep(.ui-input), .ui-migration-page__stage > gt-input, .ui-migration-page__stage > :deep(.ui-textarea), .ui-migration-page__stage > gt-textarea, .ui-migration-page__stage > :deep(.ui-tabs), .ui-migration-page__stage > gt-tabs, .ui-migration-page__sample-card { width: min(100%, 380px); }
.ui-migration-page__stage > :deep(.ui-field), .ui-migration-page__stage > gt-field, .ui-migration-page__stage > :deep(.ui-select-wrap), .ui-migration-page__stage > gt-select { width: min(100%, 380px); }
.ui-migration-page__choice-row { display: flex; flex-wrap: wrap; gap: 14px; }
.ui-migration-page__state-card { --gt-state-card-padding: 24px; --gt-state-card-radius: var(--ui-radius-md); --gt-state-card-shadow: var(--ui-card-shadow); width: min(100%, 360px); }
.ui-migration-page__dialog-trigger { display: flex; width: min(100%, 260px); flex-direction: column; align-items: center; gap: 12px; color: var(--ui-text-muted); font-size: 0.82rem; }
.ui-migration-page__dialog-trigger > .ui-button, .ui-migration-page__dialog-trigger > gt-button { width: 100%; }
.ui-migration-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; border-bottom: var(--ui-border-width-thin) solid var(--ui-dialog-header-border); }
.ui-migration-dialog__header h3 { margin: 0; color: var(--ui-text-primary); font-size: 1.05rem; font-weight: 700; }
.ui-migration-dialog__body { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.ui-migration-dialog__body p { margin: 0; color: var(--ui-text-muted); font-size: 0.82rem; line-height: 1.5; }
.ui-migration-dialog__footer { display: flex; gap: 12px; justify-content: flex-end; padding: 16px 24px; border-top: var(--ui-border-width-thin) solid var(--ui-dialog-footer-border); }
.ui-migration-dialog__footer > .ui-button, .ui-migration-dialog__footer > gt-button { min-width: 96px; }
:global([data-gt-overlay="dialog"] [part="header"]:not(:empty)), :global([data-gt-overlay="dialog"] [part="footer"]:not(:empty)) { padding: 0; }
@media (max-width: 920px) { .ui-migration-page { grid-template-columns: 190px minmax(0, 1fr); } .ui-migration-page__workspace { padding: 22px; } .ui-migration-page__comparison-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .ui-migration-page { display: block; overflow: auto; } .ui-migration-page__sidebar { border-right: 0; border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle); } .ui-migration-page__catalog { display: flex; gap: 12px; padding: 10px; overflow-x: auto; } .ui-migration-page__catalog-group { min-width: 134px; } .ui-migration-page__catalog-group + .ui-migration-page__catalog-group { margin-top: 0; } .ui-migration-page__workspace { padding: 18px; overflow: visible; } .ui-migration-page__workspace-head { align-items: flex-start; flex-direction: column; } }
</style>
