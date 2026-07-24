import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UiDialog, UiDrawer } from '../src';

describe('Vue overlay adapters', () => {
  afterEach(() => {
    document.body.querySelectorAll('[data-gt-overlay]').forEach((element) => element.remove());
  });

  it('teleports a dialog and removes it after unmount', async () => {
    const dialog = mount(UiDialog, { props: { modelValue: true }, attachTo: document.body, slots: { default: 'Plugin settings' } });
    await nextTick();
    expect(document.body.querySelector('[data-gt-overlay="dialog"]')).not.toBeNull();

    await dialog.unmount();
    expect(document.body.querySelector('[data-gt-overlay="dialog"]')).toBeNull();
  });

  it('forwards overlay close events to v-model', async () => {
    const drawer = mount(UiDrawer, { props: { modelValue: true }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('[data-gt-overlay]')?.getAttribute('data-gt-overlay')).toBe('drawer');
    (document.body.querySelector('[data-gt-overlay="drawer"] [data-overlay-mask]') as HTMLElement).click();

    expect(drawer.emitted('update:modelValue')).toEqual([[false]]);
    expect(drawer.emitted('close')).toHaveLength(1);
  });

  it('forwards root attributes to the Stencil host without Vue Teleport ownership', async () => {
    const dialog = mount(UiDialog, {
      props: { modelValue: true },
      attrs: { class: 'dialog-owner', 'aria-describedby': 'dialog-help' },
    });
    await nextTick();

    expect(dialog.find('gt-dialog').classes()).toContain('dialog-owner');
    expect(dialog.find('gt-dialog').attributes('aria-describedby')).toBe('dialog-help');
    const dialogSource = readFileSync(resolve(process.cwd(), 'src/components/UiDialog.vue'), 'utf8');
    const drawerSource = readFileSync(resolve(process.cwd(), 'src/components/UiDrawer.vue'), 'utf8');
    expect(dialogSource).not.toContain('<Teleport');
    expect(dialogSource).not.toContain('<style');
    expect(drawerSource).not.toContain('<Teleport');
    expect(drawerSource).not.toContain('<style');
  });
});
