import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import { isBundledModelPluginRecord } from './index';

function record(source: InstalledPluginRecord['installSource']): InstalledPluginRecord {
  return {
    manifest: { id: 'guyantools.image-enhancement' } as InstalledPluginRecord['manifest'],
    installSource: source,
  } as InstalledPluginRecord;
}

describe('bundled model plugin trust normalization', () => {
  it('recognizes the bundled image plugin selected through the local picker', () => {
    expect(
      isBundledModelPluginRecord(
        record({ type: 'local', value: 'C:/app/resources/model-plugins/image-enhancement' }),
        'C:/app/resources/model-plugins/image-enhancement'
      )
    ).toBe(true);
  });

  it('does not trust an arbitrary local model plugin', () => {
    expect(
      isBundledModelPluginRecord(
        record({ type: 'local', value: 'C:/user/downloads/image-enhancement' }),
        'C:/app/resources/model-plugins/image-enhancement'
      )
    ).toBe(false);
  });
});
