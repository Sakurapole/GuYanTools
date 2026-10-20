import { mount, flushPromises } from '@vue/test-utils';
import { isReactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCheatSheetSettings, type CheatSheetCommand } from '@/contracts/cheat_sheet';
import { createDefaultAppConfig } from '@/contracts/app_config';
import App from './App.vue';

let stateListener: () => void;
let commandListener: (command: CheatSheetCommand) => void;
let settings = createDefaultCheatSheetSettings();
const summary = { id: 'one', title: 'Java 并发', createdAt: 1, updatedAt: 1 };
const scrollBy = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  settings = createDefaultCheatSheetSettings();
  document.documentElement.className = '';
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: scrollBy });
  window.cheatSheetApi = {
    getState: vi.fn(async () => ({ questions: [summary], settings: { ...settings }, protected: true, shortcutStatus: [] })),
    getQuestion: vi.fn(async () => ({ ...summary, markdown: '# Java', html: '<p>长正文</p>' })),
    saveQuestion: vi.fn(async (input) => ({ ...summary, ...input, createdAt: 1, updatedAt: 2 })),
    setDirty: vi.fn(async (): Promise<void> => {}),
    ready: vi.fn(async (): Promise<void> => {}),
    onCommand: (listener: typeof commandListener) => { commandListener = listener; return vi.fn(); },
    onStateChanged: (listener: typeof stateListener) => { stateListener = listener; return vi.fn(); },
  } as any;
  window.appConfigApi = { getConfig: vi.fn(async () => createDefaultAppConfig()), onDidChange: () => vi.fn() } as any;
});
afterEach(() => { document.body.innerHTML = ''; });
describe('cheat sheet reading window', () => {
  it('applies a theme and background opacity while keeping text fully opaque', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(wrapper.get('.cheat-sheet-shell').attributes('style')).toContain('--cheat-sheet-background-color: #000');
    expect(wrapper.get('.cheat-sheet-shell').attributes('style')).toContain('--cheat-sheet-background-opacity: 0.9');
    wrapper.unmount();
  });
  it('keeps current scroll position and editing state when background opacity changes', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const reader = wrapper.get('.cheat-sheet-reader').element;
    reader.scrollTop = 160;
    const getQuestion = window.cheatSheetApi.getQuestion as ReturnType<typeof vi.fn>;
    getQuestion.mockClear();
    settings.opacity = 0.5;
    stateListener();
    await flushPromises();
    expect(reader.scrollTop).toBe(160);
    expect(getQuestion).not.toHaveBeenCalled();
    expect(wrapper.get('.cheat-sheet-shell').attributes('style')).toContain('--cheat-sheet-background-opacity: 0.5');
    wrapper.unmount();
  });
  it('scrolls the reader on global up/down and page commands even with search focused', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    wrapper.get('input').element.focus();
    commandListener('scroll-down');
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 80, behavior: 'auto' });
    commandListener('scroll-up');
    expect(scrollBy).toHaveBeenLastCalledWith({ top: -80, behavior: 'auto' });
    Object.defineProperty(wrapper.get('.cheat-sheet-reader').element, 'clientHeight', { value: 400 });
    commandListener('page-down');
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 340, behavior: 'auto' });
    wrapper.unmount();
  });
  it('passes a plain object to IPC when saving a reactive draft', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.reader-heading button').trigger('click');
    await wrapper.get('.editor-title').setValue('Java 并发更新');
    await wrapper.get('textarea').setValue('# 更新内容');
    await wrapper.get('.reader-actions button').trigger('click');
    await flushPromises();
    const input = (window.cheatSheetApi.saveQuestion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(isReactive(input)).toBe(false);
    expect(input).toMatchObject({ title: 'Java 并发更新', markdown: '# 更新内容' });
    wrapper.unmount();
  });
  it('keeps the window workflow active when the first new-question button click lands in the draggable header', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.cheat-sheet-toolbar button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.editor-title').exists()).toBe(true);
    expect(window.cheatSheetApi.setDirty).toHaveBeenCalledWith(true);
    wrapper.unmount();
  });
  it('switches the selected question in the list with the previous and next global commands', async () => {
    const second = { id: 'two', title: 'Java 内存模型', createdAt: 2, updatedAt: 2 };
    window.cheatSheetApi.getState = vi.fn(async () => ({ questions: [summary, second], settings: { ...settings }, protected: true, shortcutStatus: [] })) as any;
    window.cheatSheetApi.getQuestion = vi.fn(async (id: string) => ({ ...(id === 'two' ? second : summary), markdown: '# Java', html: '<p>题目</p>' })) as any;
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    commandListener('next');
    await flushPromises();
    expect(wrapper.findAll('.cheat-sheet-list button')[1].classes()).toContain('selected');
    commandListener('previous');
    await flushPromises();
    expect(wrapper.findAll('.cheat-sheet-list button')[0].classes()).toContain('selected');
    wrapper.unmount();
  });
});
