import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { UiButton, UiField, UiStateCard } from '../src';

describe('Vue feedback adapters', () => {
  it('forwards button attributes and prefix/suffix slots', () => {
    const wrapper = mount(UiButton, {
      props: { type: 'submit', title: 'Save plugin' },
      slots: { prefix: '<span>+</span>', default: 'Save', suffix: '<span>!</span>' },
    });

    expect(wrapper.find('gt-button').attributes('type')).toBe('submit');
    expect(wrapper.text()).toContain('Save');
  });

  it('keeps field and state-card named slots', () => {
    const field = mount(UiField, { props: { label: 'Name', error: 'Required' }, slots: { default: '<input />' } });
    const state = mount(UiStateCard, { props: { state: 'error', title: 'Failed' }, slots: { actions: '<button>Retry</button>' } });

    expect(field.find('gt-field').exists()).toBe(true);
    expect(state.text()).toContain('Retry');
  });
});
