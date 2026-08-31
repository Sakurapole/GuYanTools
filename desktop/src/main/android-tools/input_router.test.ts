import { describe, expect, it, vi } from 'vitest';
import { AndroidInputRouter, type NativeInputEvent, type WindowsInputBridge } from './input_router';
import { createDefaultAndroidInputConfig } from '@/contracts/app_config';
import { normalizeAndroidInput } from '../app-config/manager';

function createRouter() {
  let listener: ((event: NativeInputEvent) => void) | undefined;
  const bridge: WindowsInputBridge = {
    start: fn => { listener = fn; }, stop: vi.fn(), getCursor: () => ({ x: 1919, y: 540 }), setCursor: vi.fn(), setBlocked: vi.fn(),
  };
  const uhid = { start: vi.fn(async () => ({ sessionId: 'uhid-1' })), stop: vi.fn(async () => undefined), sendKeyboardReport: vi.fn(), sendMouseReport: vi.fn() };
  return { router: new AndroidInputRouter({ bridge, uhid, screen: { width: 1920, height: 1080 } }), bridge, uhid, emit: (event: NativeInputEvent) => listener?.(event) };
}

describe('AndroidInputRouter', () => {
  it('provides the documented Android input defaults and independent key policies', () => {
    const defaults = createDefaultAndroidInputConfig();
    expect(defaults.placement).toBe('right');
    expect(defaults.edgeDelayMs).toBe(120);
    expect(defaults.edgeThresholdPx).toBe(12);
    expect(defaults.toggleShortcut).toBe('Ctrl+Alt+A');
    expect(defaults.preserveWinKey).toBe(true);
    expect(defaults.preserveAltTab).toBe(true);
    expect(defaults.preserveVolumeKeys).toBe(false);
  });

  it('normalizes unsafe dimensions, shortcuts, and serials while preserving policies', () => {
    const normalized = normalizeAndroidInput({ androidWidth: 1, androidHeight: 999999, edgeThresholdPx: 0, toggleShortcut: ' ; rm -rf', deviceSerial: '  R58M123  ', preserveWinKey: false, preserveAltTab: true, preserveVolumeKeys: true });
    expect(normalized.androidWidth).toBe(320);
    expect(normalized.androidHeight).toBe(16384);
    expect(normalized.edgeThresholdPx).toBe(1);
    expect(normalized.toggleShortcut).toBe('Ctrl+Alt+A');
    expect(normalized.deviceSerial).toBe('R58M123');
    expect(normalized.preserveWinKey).toBe(false);
    expect(normalized.preserveAltTab).toBe(true);
    expect(normalized.preserveVolumeKeys).toBe(true);
  });

  const config = (placement: 'left' | 'right' | 'top' | 'bottom' = 'right') => ({ deviceSerial: 'R58M123', placement, androidWidth: 1080, androidHeight: 1920, edgeDelayMs: 120, edgeThresholdPx: 12, toggleShortcut: 'Ctrl+Alt+A', preserveWinKey: true, preserveAltTab: true, preserveVolumeKeys: false });

  it('enters after configured edge travel and delay', async () => {
    vi.useFakeTimers();
    const { router, bridge, emit } = createRouter();
    await router.start({ deviceSerial: 'R58M123', placement: 'right', androidWidth: 1080, androidHeight: 1920, edgeDelayMs: 120, edgeThresholdPx: 12, toggleShortcut: 'Ctrl+Alt+A', preserveWinKey: true, preserveAltTab: true, preserveVolumeKeys: false });
    emit({ kind: 'move', x: 1919, y: 400, dx: 12, dy: 0 });
    await vi.advanceTimersByTimeAsync(120);
    expect(router.status().state).toBe('android');
    expect(bridge.setBlocked).toHaveBeenCalledWith(true);
    await router.stop();
    vi.useRealTimers();
  });

  it('releases the bridge on suspended stop', async () => {
    const { router, bridge } = createRouter();
    await router.start({ deviceSerial: 'R58M123', placement: 'left', androidWidth: 1080, androidHeight: 1920, edgeDelayMs: 0, edgeThresholdPx: 1, toggleShortcut: 'Ctrl+Alt+A', preserveWinKey: true, preserveAltTab: true, preserveVolumeKeys: false });
    await router.stop('disconnect');
    expect(router.status().state).toBe('suspended');
    expect(bridge.setBlocked).toHaveBeenLastCalledWith(false);
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)('returns to Windows from Android edge (%s)', async placement => {
    const { router, bridge, emit } = createRouter();
    await router.start(config(placement));
    await router.toggle();
    expect(router.status().state).toBe('android');
    const event = placement === 'right' ? { dx: -2000, dy: 0 } : placement === 'left' ? { dx: 2000, dy: 0 } : placement === 'top' ? { dx: 0, dy: 2000 } : { dx: 0, dy: -2000 };
    emit({ kind: 'move', ...event });
    expect(router.status().state).toBe('windows');
    expect(bridge.setBlocked).toHaveBeenLastCalledWith(false);
    await router.stop();
  });

  it('maps the Windows cursor proportionally on entry and return', async () => {
    const { router, bridge, emit } = createRouter();
    await router.start(config());
    await router.toggle();
    expect(router.status().virtualCursor).toEqual({ x: 0, y: 960 });
    emit({ kind: 'move', dx: -100, dy: -200 });
    await router.toggle();
    expect(bridge.setCursor).toHaveBeenLastCalledWith(1919, 427);
    await router.stop();
  });

  it('toggles with the configured shortcut', async () => {
    const { router, emit } = createRouter();
    await router.start(config());
    emit({ kind: 'key', down: true, shortcut: 'Ctrl+Alt+A' });
    await vi.waitFor(() => expect(router.status().state).toBe('android'));
    emit({ kind: 'key', down: true, shortcut: 'Ctrl+Alt+A' });
    await vi.waitFor(() => expect(router.status().state).toBe('windows'));
    await router.stop();
  });

  it.each([
    ['Win', { isWinKey: true }, 'preserveWinKey'],
    ['AltTab', { isAltTab: true }, 'preserveAltTab'],
    ['volume', { isVolumeKey: true }, 'preserveVolumeKeys'],
  ] as const)('applies the %s policy independently', async (_name, marker, policy) => {
    const { router, uhid, emit } = createRouter();
    const enabled = { ...config(), [policy]: true };
    await router.start(enabled);
    await router.toggle();
    emit({ kind: 'key', code: 42, down: true, ...marker });
    expect(uhid.sendKeyboardReport).not.toHaveBeenCalled();
    await router.stop();
  });

  it('emergency-stops on double Escape and flushes pressed keys', async () => {
    vi.useFakeTimers();
    const { router, uhid, emit } = createRouter();
    await router.start(config());
    await router.toggle();
    emit({ kind: 'key', code: 30, down: true });
    emit({ kind: 'key', code: 27, down: true });
    vi.advanceTimersByTime(200);
    emit({ kind: 'key', code: 27, down: true });
    await vi.runAllTimersAsync();
    expect(router.status().state).toBe('suspended');
    expect(uhid.sendKeyboardReport).toHaveBeenCalledWith({ modifiers: 0, keys: [] });
    vi.useRealTimers();
  });
});
