import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { GtInput } from '../src/generated/stencil-proxies';

describe('generated Stencil Vue proxies', () => {
  it('creates a typed Vue component for the public custom element', () => {
    const wrapper = mount(GtInput, { props: { value: 'plugin-name' } });

    expect(wrapper.find('gt-input').element.value).toBe('plugin-name');
  });
});
