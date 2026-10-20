<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { UiButton, UiCard } from '@guyantools/ui-vue';

const count = ref(0);
const greeting = ref('点击按钮，向沙箱 Worker 发送命令。');
const errorMessage = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    count.value = Number((await window.pluginAPI.storage.get('greetingCount')) ?? 0);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
});

async function greet() {
  busy.value = true;
  errorMessage.value = '';
  try {
    const next = count.value + 1;
    const response = await window.pluginAPI.commands.execute(
      'guyantools.hello-plugin.greet',
      { count: next }
    );
    greeting.value = String((response.result as { message?: string } | undefined)?.message ?? '问候已完成');
    await window.pluginAPI.storage.set('greetingCount', next);
    count.value = next;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="hello-plugin">
    <UiCard class="hello-plugin__card">
      <p class="hello-plugin__eyebrow">GuYanTools · Plugin example</p>
      <h1>你好，插件开发者</h1>
      <p>这个页面使用 GuYanTools 组件库，状态保存在插件私有存储中。</p>
      <p class="hello-plugin__message" aria-live="polite">{{ greeting }}</p>
      <p v-if="errorMessage" class="hello-plugin__error" role="alert">{{ errorMessage }}</p>
      <UiButton variant="primary" :disabled="busy" @click="greet">
        {{ busy ? '执行中…' : `发送第 ${count + 1} 次问候` }}
      </UiButton>
    </UiCard>
  </main>
</template>

<style scoped>
.hello-plugin { min-height: 100vh; display: grid; place-items: center; padding: 32px; box-sizing: border-box; background: var(--gt-color-background); color: var(--gt-color-text); }
.hello-plugin__card { width: min(100%, 540px); padding: 32px; }
.hello-plugin__eyebrow { margin: 0 0 12px; color: var(--gt-color-primary); font-size: 12px; font-weight: 700; }
h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.25; }
p { line-height: 1.65; }
.hello-plugin__message { margin: 28px 0; font-weight: 650; }
.hello-plugin__error { color: var(--gt-color-danger); }
</style>
