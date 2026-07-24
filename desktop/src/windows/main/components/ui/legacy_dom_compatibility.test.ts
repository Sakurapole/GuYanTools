import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import UiCard from './UiCard.vue';
import UiDialog from './UiDialog.vue';
import UiIconButton from './UiIconButton.vue';

describe('legacy desktop UI DOM compatibility', () => {
  it('keeps class-addressable card and icon-button roots for existing desktop styles', () => {
    const card = mount(UiCard, { attrs: { class: 'comp-area-panel' } });
    const iconButton = mount(UiIconButton, { attrs: { class: 'theme-btn' } });

    expect(card.find('.ui-card.comp-area-panel').exists()).toBe(true);
    expect(iconButton.find('button.ui-icon-button.theme-btn').exists()).toBe(true);
  });

  it('does not warn when a dialog receives a legacy CSS class', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const dialog = mount(UiDialog, {
      attrs: { class: 'widget-editor' },
      props: { modelValue: false },
    });

    expect(warn).not.toHaveBeenCalled();
    dialog.unmount();
    warn.mockRestore();
  });
});
