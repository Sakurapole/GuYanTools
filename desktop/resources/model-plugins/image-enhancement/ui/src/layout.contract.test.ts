import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const uiRoot = path.resolve(__dirname, '..');

describe('AI image processing workbench layout contract', () => {
  it('keeps the Stitch shell regions and multi-backend controls', () => {
    const template = [
      'src/App.vue',
      'src/components/workbench/WorkbenchSidebar.vue',
      'src/components/workbench/ProcessingConfigSidebar.vue',
      'src/components/workbench/TaskToolbar.vue',
      'src/components/workbench/ActivityBar.vue',
    ]
      .map((file) => fs.readFileSync(path.join(uiRoot, file), 'utf8'))
      .join('\n');
    const styles = fs.readFileSync(path.join(uiRoot, 'src/style.css'), 'utf8');
    expect(template).toContain('workbench-sidebar--left');
    expect(template).toContain('workbench-sidebar--right');
    expect(template).toContain('backendOptions');
    expect(template).toContain('aria-label="任务类别"');
    expect(template).toContain('<gt-button');
    expect(template).toContain('<gt-checkbox');
    expect(template).toContain('<gt-badge');
    expect(template).toContain('<gt-progress');
    expect(styles).toContain('position: fixed');
    expect(styles).toContain('--left-rail');
    expect(styles).toContain('--right-rail');
  });

  it('keeps the page shell focused on orchestration', () => {
    const app = fs.readFileSync(path.join(uiRoot, 'src/App.vue'), 'utf8');
    expect(app.length).toBeLessThan(22000);
    expect(app).toContain('<ProcessingConfigSidebar');
    expect(app).toContain('<RuntimeEnvironment');
  });
});
