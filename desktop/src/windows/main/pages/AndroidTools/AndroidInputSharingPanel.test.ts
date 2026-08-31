import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AndroidInputSharingPanel from './components/AndroidInputSharingPanel.vue';

const config = { deviceSerial: 'R58M123', placement: 'right' as const, androidWidth: 1080, androidHeight: 1920, edgeDelayMs: 120, edgeThresholdPx: 12, toggleShortcut: 'Ctrl+Alt+A', preserveWinKey: true, preserveAltTab: true, preserveVolumeKeys: false };

describe('AndroidInputSharingPanel', () => {
  beforeEach(() => {
    window.androidApi = { input: { getConfig: vi.fn(async () => config), updateConfig: vi.fn(async () => config), start: vi.fn(async () => ({ state: 'windows', deviceSerial: config.deviceSerial, virtualCursor: { x: 0, y: 0 } })), stop: vi.fn(async () => undefined), toggle: vi.fn(async () => ({ state: 'android', deviceSerial: config.deviceSerial, virtualCursor: { x: 1, y: 1 } })), getStatus: vi.fn(async () => ({ state: 'windows', deviceSerial: config.deviceSerial, virtualCursor: { x: 0, y: 0 } })), onStatus: vi.fn((): (() => void) => () => undefined) } } as any;
  });

  it('renders controls and disables start without a ready device', async () => {
    const wrapper = mount(AndroidInputSharingPanel, { props: { deviceSerial: '', deviceReady: false } });
    await Promise.resolve();
    expect(wrapper.get('[data-testid="android-input-sharing-panel"]').text()).toContain('无缝键鼠共享');
    expect(wrapper.text()).toContain('请先选择一台已授权的 Android 设备');
  });

  it('shows emergency release affordance while sharing', async () => {
    const wrapper = mount(AndroidInputSharingPanel, { props: { deviceSerial: config.deviceSerial, deviceReady: true } });
    await Promise.resolve();
    expect(wrapper.text()).toContain('紧急释放');
    expect(wrapper.text()).toContain('Android');
  });
});
