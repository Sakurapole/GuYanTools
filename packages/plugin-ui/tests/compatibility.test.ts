import { describe, expect, it } from 'vitest';
import { defineCustomElements } from '@guyantools/ui-core/loader';
import { registerGuYanElements as pluginRegister } from '../src';
import { GtButton as VueGtButton } from '../src/vue';
import { GtButton } from '../src/react';

describe('plugin UI compatibility facade', () => {
  it('forwards the Stencil loader and generated framework bindings', () => {
    pluginRegister();
    defineCustomElements();

    expect(customElements.get('gt-button')).toBeDefined();
    expect(customElements.get('gt-drawer')).toBeDefined();
    expect(VueGtButton).toBeDefined();
    expect(GtButton).toBeDefined();
  });
});
