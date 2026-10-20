<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { searchQuestions } from '@/shared/cheat_sheet_search';
import type { CheatSheetQuestion, CheatSheetState, SaveCheatSheetQuestion } from '@/contracts/cheat_sheet';

const state = ref<CheatSheetState | null>(null);
const query = ref('');
const selectedId = ref<string | null>(null);
const current = ref<(CheatSheetQuestion & { html: string }) | null>(null);
const mode = ref<'read' | 'edit'>('read');
const draft = ref<SaveCheatSheetQuestion>({ title: '', markdown: '' });
const dirty = ref(false);
const message = ref('');
const searchRef = ref<HTMLInputElement | null>(null);
let removeCommand: (() => void) | undefined;
let removeState: (() => void) | undefined;
const results = computed(() => state.value ? searchQuestions(state.value.questions, query.value) : []);
const shellStyle = computed(() => ({
  '--cheat-sheet-background-color': '#000',
  '--cheat-sheet-background-opacity': String(state.value?.settings.opacity ?? 0.9),
}));
let removeConfigListener: (() => void) | undefined;

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme !== 'dark');
  document.body.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('light', theme !== 'dark');
}

async function refresh(preserveCurrent = false) {
  state.value = await window.cheatSheetApi.getState();
  selectedId.value ??= state.value.questions[0]?.id ?? null;
  if (!preserveCurrent && selectedId.value) await select(selectedId.value);
}
async function select(id: string) { selectedId.value = id; current.value = await window.cheatSheetApi.getQuestion(id); mode.value = 'read'; await nextTick(); document.querySelector('.cheat-sheet-reader')?.scrollTo({ top: 0 }); }
function startNew() { current.value = null; draft.value = { title: '', markdown: '# 新题目\n\n' }; mode.value = 'edit'; dirty.value = true; void window.cheatSheetApi.setDirty(true).catch((error) => { message.value = error instanceof Error ? error.message : '无法进入编辑状态'; }); }
function startEdit() { if (!current.value) return; draft.value = { id: current.value.id, title: current.value.title, markdown: current.value.markdown }; mode.value = 'edit'; dirty.value = true; void window.cheatSheetApi.setDirty(true); }
async function save() { try { const saved = await window.cheatSheetApi.saveQuestion({ ...draft.value }); dirty.value = false; await window.cheatSheetApi.setDirty(false); mode.value = 'read'; await refresh(); await select(saved.id); message.value = '已保存'; } catch (error) { message.value = error instanceof Error ? error.message : '保存失败'; } }
async function remove() { if (!current.value || !confirm(`删除「${current.value.title}」？`)) return; await window.cheatSheetApi.deleteQuestion(current.value.id); selectedId.value = null; await refresh(); message.value = '已删除'; }
async function importMarkdown() { try { const count = await window.cheatSheetApi.importMarkdown(); await refresh(); message.value = count ? `已导入 ${count} 道题目` : '已取消导入'; } catch (error) { message.value = error instanceof Error ? error.message : '导入失败'; } }
async function command(command: string) {
  if (command === 'search') { searchRef.value?.focus(); searchRef.value?.select(); return; }
  if (command === 'scroll-up' || command === 'page-up' || command === 'scroll-down' || command === 'page-down') { const reader = document.querySelector('.cheat-sheet-reader'); if (reader) reader.scrollBy({ top: (command.includes('up') ? -1 : 1) * (command.includes('page') ? reader.clientHeight * 0.85 : 80), behavior: 'auto' }); return; }
  if (command === 'new') return startNew(); if (command === 'edit') return startEdit(); if (command === 'save') return save(); if (command === 'delete') return remove(); if (command === 'import') return importMarkdown();
  if (command === 'next' || command === 'previous') { const index = results.value.findIndex((item) => item.id === selectedId.value); const next = command === 'next' ? index + 1 : index - 1; if (results.value[next]) await select(results.value[next].id); return; }
  if (command === 'close' || command === 'hide') { if (dirty.value) { const saveDraft = window.confirm('当前修改尚未保存。选择“确定”保存，选择“取消”放弃本次修改。'); if (saveDraft) { await save(); if (mode.value === 'edit') return; } else { dirty.value = false; await window.cheatSheetApi.setDirty(false); } if (command === 'close') { await window.cheatSheetApi.command('close'); return; } } await window.cheatSheetApi.command('hide'); }
}
function keydown(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); void command('search'); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && mode.value === 'edit') { event.preventDefault(); void save(); } }
onMounted(async () => {
  const config = await window.appConfigApi?.getConfig();
  applyTheme(config?.appearance.theme ?? 'light');
  removeConfigListener = window.appConfigApi?.onDidChange((next) => applyTheme(next.appearance.theme));
  await refresh();
  await window.cheatSheetApi.ready();
  removeCommand = window.cheatSheetApi.onCommand((received) => void command(received));
  removeState = window.cheatSheetApi.onStateChanged(() => void refresh(true));
  window.addEventListener('keydown', keydown);
});
onBeforeUnmount(() => { removeCommand?.(); removeState?.(); removeConfigListener?.(); window.removeEventListener('keydown', keydown); });
</script>

<template>
  <main class="cheat-sheet-shell" :style="shellStyle">
    <header class="cheat-sheet-toolbar"><strong>Windows 小抄</strong><input ref="searchRef" v-model="query" aria-label="按标题搜索题目" placeholder="按标题搜索 Ctrl+F" autofocus /><button type="button" @pointerdown.stop @click.stop.prevent="startNew">新增</button><button type="button" @pointerdown.stop @click.stop.prevent="importMarkdown">导入</button><button type="button" @pointerdown.stop @click.stop.prevent="window.cheatSheetApi.command('hide')">隐藏</button></header>
    <div class="cheat-sheet-content">
      <aside class="cheat-sheet-list" aria-label="题目列表"><button v-for="item in results" :key="item.id" type="button" :class="{ selected: item.id === selectedId }" @click="select(item.id)"><span>{{ item.title }}</span><small>{{ new Date(item.updatedAt).toLocaleDateString() }}</small></button><p v-if="!results.length" class="empty">没有匹配的标题</p></aside>
      <section class="cheat-sheet-reader" aria-live="polite"><template v-if="mode === 'edit'"><input v-model="draft.title" class="editor-title" aria-label="题目标题" placeholder="题目标题" @input="dirty = true" /><textarea v-model="draft.markdown" aria-label="Markdown 内容" @input="dirty = true" /><div class="reader-actions"><button type="button" @click="save">保存 Ctrl+S</button><button type="button" @click="mode = 'read'; dirty = false; window.cheatSheetApi.setDirty(false)">取消</button></div></template><template v-else-if="current"><div class="reader-heading"><h1>{{ current.title }}</h1><div><button type="button" @click="startEdit">编辑</button><button type="button" @click="remove">删除</button><button type="button" @click="window.cheatSheetApi.exportMarkdown(current.id)">导出</button></div></div><article class="markdown-body" v-html="current.html" /></template><p v-else class="empty reader-empty">选择一道题目，或按 Ctrl+N 新建</p></section>
    </div><footer class="cheat-sheet-status">{{ message || `${state?.questions.length ?? 0} 道题目 · Ctrl+Alt+←/→ 切换题目 · Ctrl+Alt+↑/↓ 滚动 · Ctrl+Alt+-/= 调整透明度` }}</footer>
  </main>
</template>

<style scoped>
:global(html), :global(body), :global(#cheat-sheet-app) { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
.cheat-sheet-shell { --cheat-sheet-text: #f5f5f5; --cheat-sheet-text-muted: #a3a3a3; --cheat-sheet-border: rgba(255, 255, 255, 0.18); --cheat-sheet-surface-muted: #151515; --cheat-sheet-input: #111; --cheat-sheet-accent: #66ccff; display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; color: var(--cheat-sheet-text); background: var(--cheat-sheet-background-color); opacity: var(--cheat-sheet-background-opacity); font: 14px/1.5 var(--ui-font-family, 'Geist Variable', system-ui, sans-serif); }
.cheat-sheet-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--cheat-sheet-border); -webkit-app-region: drag; }
.cheat-sheet-toolbar strong, .cheat-sheet-toolbar input, .cheat-sheet-toolbar button { -webkit-app-region: no-drag; }
.cheat-sheet-toolbar strong { white-space: nowrap; }
.cheat-sheet-toolbar input { flex: 1; min-width: 0; height: 32px; border: 1px solid var(--cheat-sheet-border); border-radius: 6px; padding: 0 9px; color: var(--cheat-sheet-text); background: var(--cheat-sheet-input); }
button { min-height: 30px; border: 1px solid var(--cheat-sheet-border); border-radius: 6px; padding: 0 10px; color: var(--cheat-sheet-text); background: var(--cheat-sheet-surface-muted); cursor: pointer; font: inherit; } button:hover, button.selected { border-color: var(--cheat-sheet-accent); background: #242424; } button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--cheat-sheet-accent); outline-offset: 2px; }
.cheat-sheet-content { display: flex; flex: 1; min-height: 0; } .cheat-sheet-list { width: 210px; overflow-y: auto; padding: 8px; border-right: 1px solid var(--cheat-sheet-border); } .cheat-sheet-list button { display: flex; flex-direction: column; align-items: flex-start; width: 100%; margin-bottom: 5px; text-align: left; } .cheat-sheet-list small { color: var(--cheat-sheet-text-muted); font-size: 11px; }
.cheat-sheet-reader { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px; } .reader-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; } h1 { margin: 0; font-size: 20px; } .reader-heading div, .reader-actions { display: flex; gap: 8px; } .markdown-body { max-width: 75ch; } .markdown-body :deep(pre) { overflow: auto; padding: 10px; border-radius: 6px; background: var(--cheat-sheet-surface-muted); } .markdown-body :deep(code) { font-family: var(--app-code-font-family, ui-monospace, Consolas, monospace); } .editor-title, textarea { display: block; box-sizing: border-box; width: 100%; border: 1px solid var(--cheat-sheet-border); border-radius: 6px; color: var(--cheat-sheet-text); background: var(--cheat-sheet-input); font: inherit; } .editor-title { height: 38px; margin-bottom: 10px; padding: 0 10px; font-size: 18px; } textarea { min-height: 360px; resize: vertical; padding: 12px; font-family: var(--app-code-font-family, ui-monospace, Consolas, monospace); } .reader-actions { margin-top: 10px; } .empty { color: var(--cheat-sheet-text-muted); text-align: center; } .reader-empty { margin-top: 30%; }
.cheat-sheet-status { min-height: 26px; box-sizing: border-box; padding: 5px 12px; border-top: 1px solid var(--cheat-sheet-border); color: var(--cheat-sheet-text-muted); font-size: 11px; }
@media (max-width: 600px) { .cheat-sheet-list { width: 150px; } .cheat-sheet-toolbar strong { display: none; } }
</style>
