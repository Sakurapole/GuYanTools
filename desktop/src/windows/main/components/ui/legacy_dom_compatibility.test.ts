import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiCard from './UiCard.vue';
import UiDialog from './UiDialog.vue';
import UiDatePicker from './UiDatePicker.vue';
import UiDateTimePicker from './UiDateTimePicker.vue';
import UiIconButton from './UiIconButton.vue';
import UiSelect from './UiSelect.vue';
import UiTimePicker from './UiTimePicker.vue';

const firstWaveAdapters = [
  'UiButton.vue',
  'UiIconButton.vue',
  'UiCard.vue',
  'UiField.vue',
  'UiInput.vue',
  'UiTextarea.vue',
  'UiCheckbox.vue',
  'UiRadio.vue',
  'UiSwitch.vue',
  'UiTabs.vue',
  'UiEmptyState.vue',
  'UiStateCard.vue',
] as const;

describe('legacy desktop UI DOM compatibility', () => {
  it('keeps card and icon-button as Stencil-backed compatibility adapters', () => {
    const card = mount(UiCard, { attrs: { class: 'comp-area-panel' } });
    const iconButton = mount(UiIconButton, { attrs: { class: 'theme-btn' } });

    expect(card.find('gt-card.comp-area-panel').exists()).toBe(true);
    expect(iconButton.find('gt-icon-button.theme-btn').exists()).toBe(true);
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

  it('forwards legacy dialog dimensions to the body-level panel', async () => {
    const dialog = mount(UiDialog, {
      props: { modelValue: true, width: '420px', maxWidth: '420px' },
      attachTo: document.body,
      slots: { default: '内容' },
    });

    await nextTick();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const host = dialog.find('gt-dialog').element as HTMLElement;
    expect(host.style.getPropertyValue('--gt-dialog-width')).toBe('420px');
    expect(host.style.getPropertyValue('--gt-dialog-max-width')).toBe('420px');

    dialog.unmount();
  });

  it('keeps Select as a Stencil-backed compatibility adapter', () => {
    const selectSource = readFileSync(resolve(process.cwd(), 'src/windows/main/components/ui/UiSelect.vue'), 'utf8');

    expect(selectSource).toContain("import { defineCustomElements } from '@guyantools/ui-core';");
    expect(selectSource).toContain('<gt-select');
    expect(selectSource).not.toContain('ui-select-dropdown');

    const select = mount(UiSelect, {
      props: {
        modelValue: 'standard',
        options: [{ label: '标准', value: 'standard' }],
      },
    });
    expect(select.find('gt-select').exists()).toBe(true);
    select.unmount();
  });

  it('maps the home state-card visual contract to shared public variables', () => {
    const legacyStateCard = readFileSync(resolve(process.cwd(), '../packages/ui-core/src/components/gt-state-card/gt-state-card.css'), 'utf8');
    const homeStyles = readFileSync(resolve(process.cwd(), 'src/windows/main/pages/Home/home.scss'), 'utf8');

    for (const variable of [
      '--gt-state-card-min-width',
      '--gt-state-card-gap',
      '--gt-state-card-padding',
      '--gt-state-card-radius',
      '--gt-state-card-background',
      '--gt-state-card-border-color',
      '--gt-state-card-shadow',
      '--gt-state-card-title-color',
      '--gt-state-card-description-color',
      '--gt-state-card-description-max-width',
    ]) {
      expect(legacyStateCard).toContain(variable);
      expect(homeStyles).toContain(variable);
    }

    expect(homeStyles).toContain('--gt-state-card-padding: 32px 34px;');
    expect(homeStyles).toContain('--gt-state-card-radius: var(--ui-radius-lg);');
    expect(homeStyles).toContain('--gt-state-card-shadow: none;');
  });

  it('keeps date and time pickers as Stencil-backed compatibility adapters', () => {
    const date = mount(UiDatePicker, { props: { modelValue: '2026-08-15' } });
    const time = mount(UiTimePicker, { props: { modelValue: '09:30' } });
    const dateTime = mount(UiDateTimePicker, { props: { modelValue: '2026-08-15T09:30' } });

    expect(date.find('gt-date-picker').exists()).toBe(true);
    expect(time.find('gt-time-picker').exists()).toBe(true);
    expect(dateTime.find('gt-date-time-picker').exists()).toBe(true);

    date.unmount();
    time.unmount();
    dateTime.unmount();
  });

  it('keeps every first-wave desktop entrypoint as a ui-vue adapter', () => {
    for (const file of firstWaveAdapters) {
      const source = readFileSync(resolve(process.cwd(), 'src/windows/main/components/ui', file), 'utf8');
      expect(source).toContain("@guyantools/ui-vue");
      expect(source).not.toContain('<style');
    }
  });
});
