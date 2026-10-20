<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import { sanitizeKnowledgeMarkdownHtml } from '@/windows/main/pages/Knowledge/utils/markdown_sanitize';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import PluginActionIcon from './PluginActionIcon.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import gettingStartedSource from '../../../../../../docs/desktop/plugin-development/GETTING_STARTED.md?raw';
import developmentSource from '../../../../../../docs/desktop/plugin-development/DEVELOPMENT.md?raw';
import referenceSource from '../../../../../../docs/desktop/plugin-development/API_REFERENCE.md?raw';
import exampleSource from '../../../../../../examples/hello-plugin/README.md?raw';

type DocSection = { id: string; title: string; markdown: string; html: string };
type DocPage = {
  id: string;
  label: string;
  title: string;
  intro: string;
  introHtml: string;
  sections: DocSection[];
};

function renderMarkdown(markdown: string): string {
  return sanitizeKnowledgeMarkdownHtml(
    marked.parse(markdown, { async: false, gfm: true }) as string
  );
}

function parseDoc(id: string, label: string, source: string): DocPage {
  const lines = source.trim().split(/\r?\n/);
  const title = lines.shift()?.replace(/^#\s+/, '') ?? label;
  const sections: DocSection[] = [];
  let intro: string[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];
  const flush = () => {
    if (!currentTitle) return;
    const markdown = currentBody.join('\n').trim();
    sections.push({
      id: `${id}-${sections.length + 1}`,
      title: currentTitle,
      markdown,
      html: renderMarkdown(markdown),
    });
  };
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      currentTitle = heading[1];
      currentBody = [];
    } else if (currentTitle) {
      currentBody.push(line);
    } else {
      intro.push(line);
    }
  }
  flush();
  const introText = intro.join('\n').trim();
  return { id, label, title, intro: introText, introHtml: renderMarkdown(introText), sections };
}

const docs = [
  parseDoc('start', '入门', gettingStartedSource),
  parseDoc('development', '开发', developmentSource),
  parseDoc('reference', '参考', referenceSource),
  parseDoc('example', '示例项目', exampleSource),
];

const router = useRouter();
const activeDocId = ref('start');
const activeSectionId = ref('');
const query = ref('');
const searchInput = ref<InstanceType<typeof UiInput> | null>(null);
const contentPane = ref<HTMLElement | null>(null);
const contentScrollbar = ref<InstanceType<typeof UiScrollbar> | null>(null);
const copied = ref(false);
const statusMessage = ref('');
const activeDoc = computed(() => docs.find((doc) => doc.id === activeDocId.value) ?? docs[0]);
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const searchResults = computed(() => {
  if (!normalizedQuery.value) return [];
  return docs.flatMap((doc) =>
    doc.sections
      .filter((section) =>
        `${section.title} ${section.markdown}`.toLocaleLowerCase().includes(normalizedQuery.value)
      )
      .map((section) => ({ doc, section }))
  );
});

async function selectDoc(docId: string, sectionId?: string) {
  activeDocId.value = docId;
  activeSectionId.value = sectionId ?? '';
  query.value = '';
  await nextTick();
  if (sectionId) {
    const pane = contentScrollbar.value?.viewportRef ?? contentPane.value;
    const section = document.getElementById(sectionId);
    if (pane && section) {
      const top =
        pane.scrollTop + section.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      await contentScrollbar.value?.scrollTo({ top, behavior: 'smooth' });
    }
  } else {
    await contentScrollbar.value?.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.value?.focus();
  }
  if (event.key === 'Escape' && query.value) query.value = '';
}

async function copyPage() {
  try {
    const doc = activeDoc.value;
    await navigator.clipboard.writeText(
      `# ${doc.title}\n\n${doc.intro}\n\n${doc.sections.map((section) => `## ${section.title}\n\n${section.markdown}`).join('\n\n')}`
    );
    copied.value = true;
    statusMessage.value = '当前文档已复制';
    window.setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {
    statusMessage.value = '复制失败，请检查剪贴板权限';
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="plugin-docs">
    <header class="plugin-docs__header">
      <div class="plugin-docs__brand">
        <IconRenderer icon="iconify:lucide:blocks" :size="21" />
        <strong>插件开发</strong>
        <span class="plugin-docs__version">API 1.0</span>
      </div>
      <div class="plugin-docs__search">
        <IconRenderer icon="iconify:lucide:search" :size="17" />
        <UiInput
          ref="searchInput"
          v-model="query"
          placeholder="搜索文档"
          aria-label="搜索插件开发文档"
        />
        <kbd>Ctrl K</kbd>
      </div>
      <nav class="plugin-docs__top-nav" aria-label="文档分类">
        <UiButton
          variant="ghost"
          size="sm"
          v-for="doc in docs"
          :key="doc.id"
          type="button"
          :class="{ 'is-active': activeDocId === doc.id }"
          @click="selectDoc(doc.id)"
          ><template #prefix><PluginActionIcon name="page" /></template>
          {{ doc.label }}
        </UiButton>
      </nav>
      <UiButton class="plugin-docs__back" variant="ghost" @click="router.push('/plugins')"
        ><template #prefix><PluginActionIcon name="previous" /></template>返回插件平台</UiButton
      >
    </header>

    <div class="plugin-docs__layout">
      <UiScrollbar class="plugin-docs__sidebar-scroll" :x="true" :y="true" always-visible>
        <aside class="plugin-docs__sidebar" aria-label="文档导航">
          <template v-if="normalizedQuery">
            <p class="plugin-docs__sidebar-heading">搜索结果 · {{ searchResults.length }}</p>
            <p v-if="searchResults.length === 0" class="plugin-docs__empty">没有找到相关章节</p>
            <UiButton
              variant="ghost"
              size="sm"
              v-for="result in searchResults"
              :key="result.section.id"
              type="button"
              class="plugin-docs__search-result"
              @click="selectDoc(result.doc.id, result.section.id)"
              ><template #prefix><PluginActionIcon name="page" /></template>
              <strong>{{ result.section.title }}</strong>
              <span>{{ result.doc.label }}</span>
            </UiButton>
          </template>
          <template v-else>
            <div
              v-for="doc in docs"
              :key="doc.id"
              class="plugin-docs__nav-group"
              :class="{ 'is-current': activeDocId === doc.id }"
            >
              <UiButton
                variant="ghost"
                size="sm"
                class="plugin-docs__nav-heading"
                type="button"
                @click="selectDoc(doc.id)"
                ><template #prefix><PluginActionIcon name="page" /></template>
                {{ doc.label }}
              </UiButton>
              <UiButton
                variant="ghost"
                size="sm"
                v-for="section in doc.sections"
                :key="section.id"
                class="plugin-docs__nav-link"
                :class="{ 'is-active': activeDocId === doc.id && activeSectionId === section.id }"
                type="button"
                @click="selectDoc(doc.id, section.id)"
                ><template #prefix><PluginActionIcon name="page" /></template>
                {{ section.title }}
              </UiButton>
            </div>
          </template>
        </aside>
      </UiScrollbar>

      <UiScrollbar
        ref="contentScrollbar"
        class="plugin-docs__content-scroll"
        :x="true"
        :y="true"
        always-visible
      >
        <main ref="contentPane" class="plugin-docs__content" tabindex="-1">
          <article class="plugin-docs__article">
            <div class="plugin-docs__article-tools">
              <span>{{ activeDoc.label }} / GuYanTools</span>
              <UiButton variant="secondary" size="sm" @click="copyPage"
                ><template #prefix><PluginActionIcon :name="copied ? 'check' : 'copy'" /></template>

                {{ copied ? '已复制' : '复制页面' }}
              </UiButton>
            </div>
            <h1>{{ activeDoc.title }}</h1>
            <div class="plugin-docs__prose plugin-docs__intro" v-html="activeDoc.introHtml" />
            <section
              v-for="section in activeDoc.sections"
              :id="section.id"
              :key="section.id"
              class="plugin-docs__section"
            >
              <h2>{{ section.title }}</h2>
              <div class="plugin-docs__prose" v-html="section.html" />
            </section>
            <div class="plugin-docs__endnote">
              文档内容随仓库源码更新 · GuYanTools Plugin API 1.0
            </div>
          </article>
        </main>
      </UiScrollbar>

      <UiScrollbar class="plugin-docs__toc-scroll" :x="true" :y="true" always-visible>
        <aside class="plugin-docs__toc" aria-label="本页目录">
          <p>本页目录</p>
          <UiButton
            variant="ghost"
            size="sm"
            v-for="section in activeDoc.sections"
            :key="section.id"
            type="button"
            :class="{ 'is-active': activeSectionId === section.id }"
            @click="selectDoc(activeDoc.id, section.id)"
            ><template #prefix><PluginActionIcon name="page" /></template>
            {{ section.title }}
          </UiButton>
        </aside>
      </UiScrollbar>
    </div>
    <span class="plugin-docs__sr-only" role="status" aria-live="polite">{{ statusMessage }}</span>
  </div>
</template>

<style scoped lang="scss">
.plugin-docs {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-surface-base);
  color: var(--ui-text-primary);
  font-size: 14px;
}
.plugin-docs__header {
  flex: 0 0 64px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 28px;
  border-bottom: 1px solid var(--ui-border-subtle);
}
.plugin-docs__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 210px;
  white-space: nowrap;
}
.plugin-docs__brand strong {
  font-size: 16px;
  letter-spacing: -0.02em;
}
.plugin-docs__brand :deep(svg) {
  color: var(--gt-color-primary);
}
.plugin-docs__version {
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--ui-surface-panel-muted);
  color: var(--ui-text-secondary);
  font-size: 11px;
}
.plugin-docs__search {
  width: min(250px, 24vw);
  min-width: 170px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border-radius: 8px;
  background: var(--ui-surface-panel-muted);
  color: var(--ui-text-secondary);
}
.plugin-docs__search :deep(gt-input) {
  min-width: 0;
  flex: 1;
}
.plugin-docs__search :deep(gt-input::part(base)) {
  background: transparent;
  box-shadow: none;
}
.plugin-docs__search kbd {
  white-space: nowrap;
  padding: 3px 5px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
}
.plugin-docs__top-nav {
  display: flex;
  align-self: stretch;
  align-items: stretch;
  gap: 4px;
  margin-left: auto;
}
.plugin-docs__top-nav gt-button {
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 0 11px;
  color: var(--ui-text-secondary);
  background: transparent;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.plugin-docs__top-nav gt-button:hover,
.plugin-docs__top-nav gt-button.is-active {
  color: var(--gt-color-primary);
}
.plugin-docs__top-nav gt-button.is-active {
  border-bottom-color: var(--gt-color-primary);
  font-weight: 700;
}
.plugin-docs__back {
  white-space: nowrap;
}
.plugin-docs__layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 190px;
}
.plugin-docs__sidebar-scroll,
.plugin-docs__content-scroll,
.plugin-docs__toc-scroll {
  min-height: 0;
  height: 100%;
}
.plugin-docs__sidebar {
  padding: 24px 16px 38px 28px;
  background: var(--ui-surface-panel-muted);
  border-right: 1px solid var(--ui-border-subtle);
}
.plugin-docs__nav-group {
  padding: 0 0 17px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--ui-border-subtle);
}
.plugin-docs__nav-group:last-child {
  border-bottom: 0;
}
.plugin-docs__nav-heading,
.plugin-docs__nav-link,
.plugin-docs__search-result {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
}
.plugin-docs__nav-heading {
  padding: 5px 9px 10px;
  color: var(--ui-text-primary);
  font-weight: 750;
}
.plugin-docs__nav-link {
  padding: 7px 9px;
  border-radius: 6px;
  color: var(--ui-text-secondary);
  line-height: 1.4;
}
.plugin-docs__nav-link:hover,
.plugin-docs__nav-link.is-active,
.plugin-docs__search-result:hover {
  color: var(--gt-color-primary);
  background: color-mix(in srgb, var(--gt-color-primary) 9%, transparent);
}
.plugin-docs__sidebar-heading {
  margin: 0 0 15px;
  font-weight: 750;
}
.plugin-docs__search-result {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px;
  border-radius: 6px;
}
.plugin-docs__search-result span,
.plugin-docs__empty {
  color: var(--ui-text-secondary);
  font-size: 12px;
}
.plugin-docs__content {
  min-width: 0;
  min-height: 100%;
}
.plugin-docs__article {
  max-width: 830px;
  padding: 54px clamp(30px, 5vw, 88px) 80px;
  margin: 0 auto;
  box-sizing: content-box;
}
.plugin-docs__article-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 25px;
  color: var(--ui-text-tertiary);
  font-size: 12px;
}
.plugin-docs__article-tools :deep(gt-button) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.plugin-docs__article h1 {
  margin: 0 0 20px;
  font-size: clamp(29px, 3vw, 38px);
  line-height: 1.2;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.plugin-docs__section {
  padding-top: 34px;
  margin-top: 46px;
  border-top: 1px solid var(--ui-border-subtle);
  scroll-margin-top: 26px;
}
.plugin-docs__section h2 {
  margin: 0 0 18px;
  font-size: 22px;
  line-height: 1.35;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.plugin-docs__prose {
  max-width: 72ch;
  color: var(--ui-text-primary);
  font-size: 15px;
  line-height: 1.78;
  overflow-wrap: anywhere;
}
.plugin-docs__intro {
  font-size: 16px;
  line-height: 1.8;
}
.plugin-docs__prose :deep(p) {
  margin: 0 0 18px;
}
.plugin-docs__prose :deep(ul),
.plugin-docs__prose :deep(ol) {
  padding-left: 23px;
  margin: 12px 0 20px;
}
.plugin-docs__prose :deep(li) {
  margin: 5px 0;
}
.plugin-docs__prose :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--ui-surface-panel-muted);
  color: var(--gt-color-primary);
  font-size: 0.91em;
}
.plugin-docs__prose :deep(pre) {
  overflow: visible;
  width: max-content;
  max-width: none;
  padding: 18px 20px;
  border-radius: 9px;
  background: var(--ui-surface-panel-muted);
  border: 1px solid var(--ui-border-subtle);
  font-size: 13px;
  line-height: 1.6;
}
.plugin-docs__prose :deep(pre code) {
  padding: 0;
  color: var(--ui-text-primary);
  background: transparent;
  font-family: var(--app-code-font-family, ui-monospace, Consolas, monospace);
}
.plugin-docs__prose :deep(table) {
  width: max-content;
  max-width: none;
  border-collapse: collapse;
  margin: 18px 0;
  font-size: 13px;
}
.plugin-docs__prose :deep(th),
.plugin-docs__prose :deep(td) {
  padding: 9px 12px;
  border-bottom: 1px solid var(--ui-border-subtle);
  text-align: left;
  vertical-align: top;
}
.plugin-docs__prose :deep(th) {
  background: var(--ui-surface-panel-muted);
}
.plugin-docs__endnote {
  padding-top: 35px;
  margin-top: 58px;
  border-top: 1px solid var(--ui-border-subtle);
  color: var(--ui-text-tertiary);
  font-size: 12px;
}
.plugin-docs__toc {
  padding: 56px 18px 28px 0;
}
.plugin-docs__toc p {
  margin: 0 0 14px;
  font-weight: 750;
}
.plugin-docs__toc gt-button {
  display: block;
  width: 100%;
  padding: 7px 0;
  border: 0;
  background: none;
  text-align: left;
  color: var(--ui-text-secondary);
  line-height: 1.4;
  cursor: pointer;
  font: inherit;
}
.plugin-docs__toc gt-button:hover,
.plugin-docs__toc gt-button.is-active {
  color: var(--gt-color-primary);
}
.plugin-docs gt-button::part(base):focus-visible {
  outline: 2px solid var(--gt-color-primary);
  outline-offset: 2px;
}
.plugin-docs__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 1180px) {
  .plugin-docs__layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .plugin-docs__toc-scroll {
    display: none;
  }
  .plugin-docs__brand {
    min-width: auto;
  }
}
@media (max-width: 760px) {
  .plugin-docs__header {
    flex-wrap: wrap;
    height: auto;
    gap: 8px 16px;
    padding: 10px 16px;
  }
  .plugin-docs__search {
    order: 3;
    width: 100%;
  }
  .plugin-docs__top-nav {
    margin-left: auto;
  }
  .plugin-docs__top-nav gt-button {
    padding: 10px 6px;
  }
  .plugin-docs__back {
    display: none;
  }
  .plugin-docs__layout {
    display: flex;
    flex-direction: column;
  }
  .plugin-docs__sidebar-scroll {
    flex: 0 0 auto;
    height: auto;
  }
  .plugin-docs__sidebar {
    display: flex;
    gap: 7px;
    padding: 8px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border-subtle);
  }
  .plugin-docs__nav-group {
    display: none;
  }
  .plugin-docs__nav-group.is-current {
    display: flex;
  }
  .plugin-docs__nav-heading {
    display: none;
  }
  .plugin-docs__nav-link {
    white-space: nowrap;
  }
  .plugin-docs__article {
    padding: 28px 22px 65px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .plugin-docs__content {
    scroll-behavior: auto;
  }
}
</style>
