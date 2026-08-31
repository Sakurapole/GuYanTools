import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AndroidDevice,
  AndroidSession,
  AndroidSessionEvent,
  AndroidToolsApi,
  AndroidToolchainStatus,
  AndroidToolchainDownloadProgress,
} from '@/contracts/android-tools';
import AndroidTools from './AndroidTools.vue';

const pixel = (overrides: Partial<AndroidDevice> = {}): AndroidDevice => ({
  serial: 'USB-PIXEL-01',
  state: 'device',
  transport: 'adb-usb',
  model: 'Pixel 8',
  androidVersion: '14',
  sdkLevel: 34,
  usb: true,
  ...overrides,
});

const runningSession = (overrides: Partial<AndroidSession> = {}): AndroidSession => ({
  sessionId: 'session-1',
  deviceSerial: 'USB-PIXEL-01',
  mode: 'mirror-control',
  keyboard: 'uhid',
  mouse: 'uhid',
  status: 'running',
  startedAt: '2026-08-28T00:00:00.000Z',
  ...overrides,
});

function createApi(overrides: Partial<AndroidToolsApi> = {}) {
  let devicesListener: ((event: { devices: AndroidDevice[]; timestamp: string }) => void) | undefined;
  let sessionListener: ((event: AndroidSessionEvent) => void) | undefined;
  let downloadListener: ((progress: AndroidToolchainDownloadProgress) => void) | undefined;
  const api: AndroidToolsApi = {
    getToolchainStatus: vi.fn(async () => ({
      available: true,
      platform: 'win32',
      architecture: 'x64',
      versions: { adb: '35.0.2', fastboot: '35.0.2', scrcpy: '3.3.1' },
    } satisfies AndroidToolchainStatus)),
    listDevices: vi.fn(async () => [pixel()]),
    onDevicesChanged: vi.fn(listener => {
      devicesListener = listener;
      return vi.fn();
    }),
    listSessions: vi.fn(async () => []),
    startMirror: vi.fn(async () => runningSession()),
    startAudio: vi.fn(async () => runningSession({ mode: 'audio-only', keyboard: 'disabled', mouse: 'disabled' })),
    startOtg: vi.fn(async () => runningSession({ mode: 'otg', keyboard: 'uhid', mouse: 'uhid' })),
    stopSession: vi.fn(async () => undefined),
    getFastbootDevices: vi.fn(async () => []),
    fastbootGetVars: vi.fn(async () => ({})),
    fastbootReboot: vi.fn(async () => undefined),
    onSessionEvent: vi.fn(listener => {
      sessionListener = listener;
      return vi.fn();
    }),
    getToolchainDownloadStatus: vi.fn(async () => ({ phase: 'idle', percent: 0 } satisfies AndroidToolchainDownloadProgress)),
    downloadToolchain: vi.fn(async () => ({
      available: true,
      platform: 'win32',
      architecture: 'x64',
      versions: { adb: '37.0.1', fastboot: '37.0.1', scrcpy: '4.1' },
      source: 'managed',
    } satisfies AndroidToolchainStatus)),
    onToolchainDownloadProgress: vi.fn(listener => {
      downloadListener = listener;
      return vi.fn();
    }),
    ...overrides,
  };

  return {
    api,
    emitDevices: (devices: AndroidDevice[]) => devicesListener?.({ devices, timestamp: new Date().toISOString() }),
    emitSession: (event: AndroidSessionEvent) => sessionListener?.(event),
    emitDownload: (progress: AndroidToolchainDownloadProgress) => downloadListener?.(progress),
  };
}

function mountPage(api: AndroidToolsApi) {
  window.androidApi = api;
  return mount(AndroidTools, {
    global: {
      stubs: {
        IconRenderer: { template: '<span />' },
      },
    },
  });
}

describe('AndroidTools', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a toolchain diagnostic when the bundled tools are unavailable', async () => {
    const { api } = createApi({
      getToolchainStatus: vi.fn(async () => ({
        available: false,
        platform: 'win32',
        architecture: 'x64',
        versions: {},
        errorCode: 'ANDROID_TOOL_UNAVAILABLE',
        errorMessage: '缺少 adb.exe',
      })),
    });

    const wrapper = mountPage(api);
    await flushPromises();

    expect(wrapper.text()).toContain('工具链不可用');
    expect(wrapper.text()).toContain('缺少 adb.exe');
    expect(wrapper.get('[data-testid="android-toolchain-error"]').attributes('role')).toBe('alert');
    expect(api.listDevices).not.toHaveBeenCalled();
    expect(api.listSessions).not.toHaveBeenCalled();
  });

  it('pins a function from the collection into the sidebar and opens its tab', async () => {
    const { api } = createApi();
    const wrapper = mountPage(api);
    await flushPromises();

    expect(wrapper.find('[data-testid="android-sidebar-collection"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="android-function-collection"]').classes()).toContain('android-tools-function-grid');
    expect(wrapper.findAll('.android-tools-function-card')).toHaveLength(5);
    await wrapper.get('[data-testid="pin-function-mirror"]').trigger('click');
    expect(wrapper.find('[data-testid="android-sidebar-pinned-mirror"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="android-function-tab-mirror"]').exists()).toBe(true);
  });

  it('switches between device information and pinned function content', async () => {
    const { api } = createApi();
    const wrapper = mountPage(api);
    await flushPromises();
    await wrapper.get('[data-testid="pin-function-mirror"]').trigger('click');

    await wrapper.get('[data-testid="android-sidebar-devices"]').trigger('click');
    expect(wrapper.find('[data-testid="android-device-information"]').exists()).toBe(true);
    await wrapper.get('[data-testid="android-sidebar-pinned-mirror"]').trigger('click');
    expect(wrapper.find('[data-testid="android-function-content-mirror"]').exists()).toBe(true);
  });

  it('offers an in-app toolchain download and reloads state after completion', async () => {
    const { api } = createApi({
      getToolchainStatus: vi.fn()
        .mockResolvedValueOnce({
          available: false,
          platform: 'win32',
          architecture: 'x64',
          versions: {},
          errorCode: 'ANDROID_TOOL_UNAVAILABLE',
          errorMessage: '缺少 adb.exe',
        })
        .mockResolvedValueOnce({
          available: true,
          platform: 'win32',
          architecture: 'x64',
          versions: { adb: '37.0.1', fastboot: '37.0.1', scrcpy: '4.1' },
          source: 'managed',
        }),
    });
    const wrapper = mountPage(api);
    await flushPromises();

    await wrapper.get('[data-testid="download-android-toolchain"]').trigger('click');
    await flushPromises();

    expect(api.downloadToolchain).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('可用');
  });

  it('explains authorization and disables controls for unauthorized devices', async () => {
    const { api } = createApi({ listDevices: vi.fn(async () => [pixel({ state: 'unauthorized' })]) });
    const wrapper = mountPage(api);
    await flushPromises();

    expect(wrapper.text()).toContain('请在设备上允许 USB 调试授权');
    expect(wrapper.get('[data-testid="start-mirror"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="start-audio"]').attributes('disabled')).toBeDefined();
  });

  it('disables audio on Android 10 and allows it on Android 11+', async () => {
    const { api } = createApi({ listDevices: vi.fn(async () => [pixel({ androidVersion: '10', sdkLevel: 29 })]) });
    const wrapper = mountPage(api);
    await flushPromises();

    const audioButton = wrapper.get('[data-testid="start-audio"]');
    expect(audioButton.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Android 11 及以上才支持音频回传');

  });

  it('shows the unlock requirement for Android 11 audio capture', async () => {
    const { api } = createApi({ listDevices: vi.fn(async () => [pixel({ androidVersion: '11', sdkLevel: 30 })]) });
    const wrapper = mountPage(api);
    await flushPromises();

    expect(wrapper.text()).toContain('Android 11 设备需要在启动音频回传时保持解锁');
    expect(wrapper.get('[data-testid="start-audio"]').attributes('disabled')).toBeUndefined();
  });

  it('teaches the user how to recover from an empty device list', async () => {
    const { api } = createApi({ listDevices: vi.fn(async () => []) });
    const wrapper = mountPage(api);
    await flushPromises();

    expect(wrapper.text()).toContain('未发现 Android 设备');
    expect(wrapper.text()).toContain('连接 USB 并开启 USB 调试后');
  });

  it('selects a device, starts mirror control, and stops the running session', async () => {
    const second = pixel({ serial: 'USB-SAMSUNG-02', model: 'Galaxy S24', sdkLevel: 35, androidVersion: '15' });
    const session = runningSession({ deviceSerial: second.serial });
    const { api } = createApi({
      listDevices: vi.fn(async () => [pixel(), second]),
      startMirror: vi.fn(async input => {
        expect(input.deviceSerial).toBe(second.serial);
        return session;
      }),
      listSessions: vi.fn(async () => [session]),
    });
    const wrapper = mountPage(api);
    await flushPromises();

    await wrapper.get(`[data-testid="device-${second.serial}"]`).trigger('click');
    await wrapper.get('[data-testid="start-mirror"]').trigger('click');
    await flushPromises();
    expect(api.startMirror).toHaveBeenCalledWith({ deviceSerial: second.serial, keyboard: 'uhid', mouse: 'uhid' });
    expect(wrapper.text()).toContain('镜像控制');

    await wrapper.get(`[data-testid="stop-${session.sessionId}"]`).trigger('click');
    expect(api.stopSession).toHaveBeenCalledWith(session.sessionId);
  });

  it('shows the session failure reason returned by scrcpy', async () => {
    const failed = runningSession({ status: 'failed', errorCode: 'ANDROID_SESSION_EXITED', errorMessage: '音频采集不可用' });
    const { api } = createApi({ listSessions: vi.fn(async () => [failed]) });
    const wrapper = mountPage(api);
    await flushPromises();
    expect(wrapper.text()).toContain('音频采集不可用');
  });

  it('removes both event listeners when the page is unmounted', async () => {
    const deviceUnsubscribe = vi.fn();
    const sessionUnsubscribe = vi.fn();
    const { api } = createApi({
      onDevicesChanged: vi.fn(() => deviceUnsubscribe),
      onSessionEvent: vi.fn(() => sessionUnsubscribe),
    });
    const wrapper = mountPage(api);
    await flushPromises();

    wrapper.unmount();
    expect(deviceUnsubscribe).toHaveBeenCalledOnce();
    expect(sessionUnsubscribe).toHaveBeenCalledOnce();
  });
});
