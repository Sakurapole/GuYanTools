import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const homePath = resolve(process.cwd(), 'src/windows/main/pages/Home/Home.vue');

describe('home category sidebar Stencil migration', () => {
  it('renders category actions with Stencil button elements and keeps the local registration boundary', () => {
    const homeSource = readFileSync(homePath, 'utf8');
    const sidebarSource = homeSource.match(/<aside class="category-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? '';

    expect(homeSource).toContain("import { defineCustomElements } from '@guyantools/ui-core';");
    expect(homeSource).toContain('defineCustomElements();');
    expect(sidebarSource).toContain('<gt-icon-button');
    expect(sidebarSource).toContain('<gt-button v-for="(category, index) in categories"');
    expect(sidebarSource).toContain('<gt-card ref="sidebarPanelRef"');
    expect(sidebarSource).not.toContain('<UiCard ref="sidebarPanelRef"');
    expect(sidebarSource).toContain(':active="index === activeCategoryIndex"');
    expect(sidebarSource).not.toContain('<UiButton v-for="(category, index) in categories"');
    expect(sidebarSource).not.toContain('<UiIconButton v-if="canScrollCategoryUp"');
    expect(sidebarSource).not.toContain('<UiIconButton v-if="canScrollCategoryDown"');

    const homeStyles = readFileSync(resolve(process.cwd(), 'src/windows/main/pages/Home/home.scss'), 'utf8');
    expect(homeStyles).toContain('.category-item::part(base)');
    expect(homeStyles).toContain('.category-item::part(label)');
    expect(homeStyles).not.toContain('.category-item.ui-button');
    expect(homeStyles).not.toContain('.category-scroll-btn.ui-icon-button');
  });

  it('maps both home card containers to Stencil card parts', () => {
    const homeSource = readFileSync(homePath, 'utf8');
    const homeStyles = readFileSync(resolve(process.cwd(), 'src/windows/main/pages/Home/home.scss'), 'utf8');

    expect(homeSource).toContain('<gt-card ref="sidebarPanelRef"');
    expect(homeSource).toContain('<gt-card class="comp-area-panel"');
    expect(homeSource).not.toContain('<UiCard ref="sidebarPanelRef"');
    expect(homeSource).not.toContain('<UiCard class="comp-area-panel"');
    expect(homeStyles).toContain('.sidebar-panel::part(body)');
    expect(homeStyles).toContain('.comp-area-panel::part(body)');
  });

  it('uses Stencil state cards for loading, empty, and error feedback', () => {
    const homeSource = readFileSync(homePath, 'utf8');
    const stateSource = homeSource.match(/<div v-if="isLoading" class="home-state">[\s\S]*?<\/div>/)?.[0] ?? '';
    const emptyStateSource = homeSource.match(/<div v-else-if="!activeSlotCategory" class="home-state">[\s\S]*?<\/div>/)?.[0] ?? '';

    expect(stateSource).toContain('<gt-state-card');
    expect(stateSource).toContain('title="首页布局加载中..."');
    expect(emptyStateSource).toContain('<gt-state-card');
    expect(emptyStateSource).toContain(':title="loadError || \'暂无首页分类\'"');
    expect(homeSource).not.toContain('<UiStateCard class="home-state-card"');
  });

  it('uses the Stencil dialog contract for adding a category', () => {
    const homeSource = readFileSync(homePath, 'utf8');
    const dialogSource = homeSource.match(/<!-- 添加类别对话框 -->[\s\S]*?<\/gt-dialog>/)?.[0] ?? '';

    expect(dialogSource).toContain('<gt-dialog');
    expect(dialogSource).toContain(':open="showAddCategoryDialog"');
    expect(dialogSource).toContain('@gt-open-change="handleAddCategoryDialogChange"');
    expect(dialogSource).toContain('--gt-dialog-width');
    expect(dialogSource).toContain('<div slot="header" class="dialog-header">');
    expect(dialogSource).toContain('<div slot="footer" class="dialog-footer">');
    expect(dialogSource).toContain('<gt-icon-button class="dialog-close-btn"');
    expect(dialogSource).toContain('@gt-click="closeAddCategoryDialog"');
    expect(dialogSource).toContain('<gt-field label="类别名称" for="category-label">');
    expect(dialogSource).toContain('<gt-field label="图标" for="category-icon">');
    expect(dialogSource).toContain('<gt-input id="category-label" :value="newCategoryForm.label"');
    expect(dialogSource).toContain('@gt-input="handleCategoryLabelInput"');
    expect(dialogSource).toContain('<gt-button variant="secondary" @gt-click="closeAddCategoryDialog">取消</gt-button>');
    expect(dialogSource).toContain('@gt-click="confirmAddCategory"');
    expect(dialogSource).not.toContain('<UiButton');
    expect(dialogSource).not.toContain('<UiInput');
    expect(dialogSource).not.toContain('<UiField');
    expect(dialogSource).not.toContain('<UiIconButton');
    expect(dialogSource).not.toContain('<template #header>');
    expect(dialogSource).not.toContain('<template #footer>');
    expect(dialogSource).not.toContain('<UiDialog');
    const homeStyles = readFileSync(resolve(process.cwd(), 'src/windows/main/pages/Home/home.scss'), 'utf8');
    expect(homeStyles).toContain('> gt-button');
  });
});
