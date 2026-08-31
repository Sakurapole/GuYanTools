<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import IconRenderer from '../../../components/ui/IconRenderer.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import type { AndroidInputConfig, AndroidInputState, AndroidInputStatus } from '@/contracts/android-tools';

const props = defineProps<{ deviceSerial: string; deviceReady: boolean }>();
const config = ref<AndroidInputConfig | null>(null);
const status = ref<AndroidInputStatus>({ state: 'windows', deviceSerial: '', virtualCursor: { x: 0, y: 0 } });
const error = ref('');
let removeStatus: (() => void) | undefined;

const api = computed(() => window.androidApi?.input);
const running = computed(() => status.value.state !== 'windows' && status.value.state !== 'suspended');
const stateLabel: Record<AndroidInputState, string> = { windows: 'Windows', entering: '进入中', android: 'Android', returning: '返回中', suspended: '已暂停' };

async function load() {
  if (!api.value) return;
  try { config.value = await api.value.getConfig(); status.value = await api.value.getStatus(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法读取键鼠共享配置'; }
}
async function update(patch: Partial<AndroidInputConfig>) {
  if (!api.value) return;
  try { config.value = await api.value.updateConfig(patch); error.value = ''; } catch (cause) { error.value = cause instanceof Error ? cause.message : '配置保存失败'; }
}
async function startOrStop() {
  if (!api.value) return;
  try { if (running.value) await api.value.stop(); else await api.value.start(); status.value = await api.value.getStatus(); error.value = ''; } catch (cause) { error.value = cause instanceof Error ? cause.message : '键鼠共享启动失败'; }
}
async function toggle() { try { status.value = await api.value?.toggle() ?? status.value; } catch (cause) { error.value = cause instanceof Error ? cause.message : '切换失败'; } }

onMounted(() => { void load(); removeStatus = api.value?.onStatus(next => { status.value = next; }); });
onUnmounted(() => removeStatus?.());
</script>

<template>
  <UiCard class="android-input-sharing-panel" padding="lg" radius="md" data-testid="android-input-sharing-panel">
    <div class="android-tools-panel__heading"><div><h2>无缝键鼠共享</h2><p>将鼠标从屏幕边缘移入 Android，使用快捷键或反向边缘返回。</p></div><span class="android-tools-status" :class="{ 'android-tools-status--ok': running, 'android-tools-status--error': status.state === 'suspended' }"><span class="android-tools-status__dot" />{{ stateLabel[status.state] }}</span></div>
    <div v-if="config" class="android-input-sharing-form">
      <label>Android 位置<select :value="config.placement" @change="update({ placement: ($event.target as HTMLSelectElement).value as AndroidInputConfig['placement'] })"><option value="left">左侧</option><option value="right">右侧</option><option value="top">上方</option><option value="bottom">下方</option></select></label>
      <label>Android 宽度（像素）<input type="number" min="320" max="16384" :value="config.androidWidth" @change="update({ androidWidth: Number(($event.target as HTMLInputElement).value) })" /></label>
      <label>Android 高度（像素）<input type="number" min="320" max="16384" :value="config.androidHeight" @change="update({ androidHeight: Number(($event.target as HTMLInputElement).value) })" /></label>
      <label>边缘延迟（毫秒）<input type="number" min="0" max="5000" :value="config.edgeDelayMs" @change="update({ edgeDelayMs: Number(($event.target as HTMLInputElement).value) })" /></label>
      <label>边缘阻力（像素）<input type="number" min="1" max="100" :value="config.edgeThresholdPx" @change="update({ edgeThresholdPx: Number(($event.target as HTMLInputElement).value) })" /></label>
      <label>切换快捷键<input :value="config.toggleShortcut" @change="update({ toggleShortcut: ($event.target as HTMLInputElement).value })" /></label>
      <label class="android-input-sharing-check"><input type="checkbox" :checked="config.preserveWinKey" @change="update({ preserveWinKey: ($event.target as HTMLInputElement).checked })" />保留 Win 键</label>
      <label class="android-input-sharing-check"><input type="checkbox" :checked="config.preserveAltTab" @change="update({ preserveAltTab: ($event.target as HTMLInputElement).checked })" />保留 Alt+Tab</label>
      <label class="android-input-sharing-check"><input type="checkbox" :checked="config.preserveVolumeKeys" @change="update({ preserveVolumeKeys: ($event.target as HTMLInputElement).checked })" />保留音量键</label>
    </div>
    <div v-if="config" class="android-input-sharing-preview" :data-placement="config.placement" aria-label="Android 屏幕位置预览"><span>Windows</span><strong>Android</strong></div>
    <div class="android-tools-actions"><UiButton variant="primary" size="sm" :disabled="!deviceReady || !props.deviceSerial || !config" @click="startOrStop"><template #prefix><IconRenderer :icon="running ? 'iconify:lucide:square' : 'iconify:lucide:play'" :size="15" /></template>{{ running ? '停止共享' : '开始共享' }}</UiButton><UiButton variant="secondary" size="sm" :disabled="!running" @click="toggle">切换目标</UiButton><UiButton variant="ghost" size="sm" :disabled="!running" @click="api?.stop('emergency')">紧急释放</UiButton></div>
    <p v-if="!deviceReady" class="android-tools-help">请先选择一台已授权的 Android 设备。</p><p v-if="error || status.errorCode" class="android-tools-alert android-tools-alert--error" role="alert">{{ error || status.errorMessage || status.errorCode }}</p>
  </UiCard>
</template>
