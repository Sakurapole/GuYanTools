import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = process.cwd();
const pagePath = resolve(desktopRoot, 'src/windows/main/pages/UiMigrationComparison.vue');

describe('UI migration comparison page', () => {
  it('registers a development-only route and renders a dual implementation workspace', () => {
    const routerSource = readFileSync(resolve(desktopRoot, 'src/windows/main/routes/router.ts'), 'utf8');
    const viteSource = readFileSync(resolve(desktopRoot, 'vite.renderer.config.ts'), 'utf8');

    expect(existsSync(pagePath)).toBe(true);
    expect(routerSource).toContain("path: '/devtools/ui-migration'");
    expect(viteSource).toContain("tag.startsWith('gt-')");

    const pageSource = readFileSync(pagePath, 'utf8');
    expect(pageSource).toContain('Vue Legacy');
    expect(pageSource).toContain('Stencil');
    expect(pageSource).toContain("status: 'aligned'");
  });

  it('keeps the first migration component catalog and local Stencil registration together', () => {
    expect(existsSync(pagePath)).toBe(true);
    const pageSource = readFileSync(pagePath, 'utf8');

    for (const componentId of [
      'button', 'icon-button', 'card', 'field', 'input', 'textarea',
      'checkbox', 'radio', 'switch', 'tabs', 'empty-state', 'state-card',
      'dialog', 'select', 'date-picker', 'time-picker', 'date-time-picker',
    ]) {
      expect(pageSource).toContain(`id: '${componentId}'`);
    }

    expect(pageSource).toContain('defineCustomElements()');
    expect(pageSource).toContain('selectedComponent.id');
    expect(pageSource).toContain("{ id: 'button', label: 'Button', group: '基础', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'icon-button', label: 'IconButton', group: '基础', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'card', label: 'Card', group: '基础', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'field', label: 'Field', group: '表单', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'input', label: 'Input', group: '表单', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'textarea', label: 'Textarea', group: '表单', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'checkbox', label: 'Checkbox', group: '表单', status: 'aligned'");
    expect(pageSource).toContain("const legacyTextarea = ref('对齐多行输入。')");
    expect(pageSource).toContain("const stencilTextarea = ref('对齐多行输入。')");
    expect(pageSource).toContain("{ id: 'dialog', label: 'Dialog', group: '基础', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'select', label: 'Select', group: '表单', status: 'aligned'");
    expect(pageSource).toContain('<UiSelect v-model="legacySelect"');
    expect(pageSource).toContain('<gt-select :value="stencilSelect"');
    expect(pageSource).toContain("{ id: 'date-picker', label: 'DatePicker', group: '表单', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'time-picker', label: 'TimePicker', group: '表单', status: 'aligned'");
    expect(pageSource).toContain("{ id: 'date-time-picker', label: 'DateTimePicker', group: '表单', status: 'aligned'");
    expect(pageSource).toContain('<UiDatePicker v-model="legacyDate"');
    expect(pageSource).toContain('<gt-date-picker :value="stencilDate"');
    expect(pageSource).toContain('<UiTimePicker v-model="legacyTime"');
    expect(pageSource).toContain('<gt-time-picker :value="stencilTime"');
    expect(pageSource).toContain('<UiDateTimePicker v-model="legacyDateTime"');
    expect(pageSource).toContain('<gt-date-time-picker :value="stencilDateTime"');
    expect(pageSource).toContain('<UiDialog');
    expect(pageSource).toContain('<gt-dialog');
    expect(pageSource).toContain('@gt-open-change="handleStencilDialogChange"');
    expect(pageSource).toContain('<div slot="header" class="ui-migration-dialog__header">');
    expect(pageSource).toContain('<div slot="footer" class="ui-migration-dialog__footer">');
  });

  it('exposes the page through the development bottom-bar defaults', () => {
    const appConfigSource = readFileSync(resolve(desktopRoot, 'src/contracts/app_config.ts'), 'utf8');

    expect(appConfigSource).toContain("| 'ui-migration'");
    expect(appConfigSource).toMatch(/APP_BOTTOM_BAR_DEFAULT_VISIBLE_TAB_IDS:[\s\S]*?'ui-migration'/);
    expect(appConfigSource).toMatch(/id: 'ui-migration',[\s\S]*?route: '\/devtools\/ui-migration',[\s\S]*?devOnly: true/);
  });

  it('uses the same constrained stage width for both Field implementations', () => {
    const pageSource = readFileSync(pagePath, 'utf8');

    expect(pageSource).toContain('.ui-migration-page__stage > :deep(.ui-field), .ui-migration-page__stage > gt-field');
    expect(pageSource).toContain('width: min(100%, 380px);');
  });
});
