import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { UiDialog, UiDrawer } from '../src';

describe('Vue overlay adapters', () => {
  it('teleports a dialog and removes it after unmount', async () => {
    const dialog = mount(UiDialog, { props: { modelValue: true }, attachTo: document.body, slots: { default: 'Plugin settings' } });
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
});
