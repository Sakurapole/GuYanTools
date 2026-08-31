import type { AndroidInputConfig, AndroidInputState, AndroidInputStatus } from '@/contracts/android-tools';
import { AndroidUhidSession } from './android_uhid_service';

export interface NativeInputEvent { kind: 'move' | 'button' | 'wheel' | 'key'; x?: number; y?: number; dx?: number; dy?: number; button?: number; down?: boolean; delta?: number; code?: number; modifiers?: number; shortcut?: string; isWinKey?: boolean; isAltTab?: boolean; isVolumeKey?: boolean }
export interface WindowsInputBridge { start(listener: (event: NativeInputEvent) => void): void; stop(): void; getCursor(): { x: number; y: number }; setCursor(x: number, y: number): void; setBlocked(blocked: boolean): void }
export interface InputRouterDependencies { bridge: WindowsInputBridge; uhid: Pick<AndroidUhidSession, 'start' | 'stop' | 'sendKeyboardReport' | 'sendMouseReport'>; screen?: { width: number; height: number } }

export class AndroidInputRouter {
  private config: AndroidInputConfig | null = null;
  private state: AndroidInputState = 'windows';
  private serial = '';
  private virtualCursor = { x: 0, y: 0 };
  private readonly listeners = new Set<(status: AndroidInputStatus) => void>();
  private edgeTimer: ReturnType<typeof setTimeout> | null = null;
  private edgeTravel = 0;
  private pressedKeys = new Set<number>();
  private lastEscapeAt = 0;

  constructor(private readonly deps: InputRouterDependencies) {}

  async start(config: AndroidInputConfig) {
    if (this.state !== 'windows' && this.state !== 'suspended') throw new Error('ANDROID_INPUT_ALREADY_RUNNING');
    this.config = config;
    this.serial = config.deviceSerial;
    try {
      await this.deps.uhid.start(config.deviceSerial);
      this.deps.bridge.start(event => this.handleNativeEvent(event));
      this.emit('windows');
      return this.status();
    } catch (error) {
      await this.deps.uhid.stop();
      this.config = null;
      this.serial = '';
      this.state = 'suspended';
      this.emit('suspended', error instanceof Error ? error.message : 'ANDROID_INPUT_START_FAILED');
      throw error;
    }
  }

  async stop(reason = 'user') {
    this.clearEdgeTimer();
    this.flushKeys();
    this.deps.bridge.setBlocked(false);
    this.deps.bridge.stop();
    await this.deps.uhid.stop();
    this.state = reason === 'user' ? 'windows' : 'suspended';
    this.emit(this.state, reason === 'user' ? undefined : 'ANDROID_INPUT_SUSPENDED');
  }

  async toggle() {
    if (this.state === 'android' || this.state === 'entering') await this.returnToWindows();
    else if (this.config) await this.enterAndroid();
    return this.status();
  }

  handleNativeEvent(event: NativeInputEvent) {
    if (!this.config || this.state === 'suspended') return;
    if (event.kind === 'key' && event.down && event.shortcut === this.config.toggleShortcut) { void this.toggle(); return; }
    if (this.state === 'windows' || this.state === 'entering') {
      if (event.kind === 'move' && this.atConfiguredEdge(event.x ?? 0, event.y ?? 0)) {
        this.edgeTravel += Math.abs(event.dx ?? 0) + Math.abs(event.dy ?? 0);
        if (this.edgeTravel >= this.config.edgeThresholdPx) {
          if (!this.edgeTimer) this.edgeTimer = setTimeout(() => { void this.enterAndroid(); }, this.config.edgeDelayMs);
          this.state = 'entering'; this.emit('entering');
        }
      } else { this.edgeTravel = 0; this.clearEdgeTimer(); if (this.state === 'entering') { this.state = 'windows'; this.emit('windows'); } }
      return;
    }
    if (this.state !== 'android') return;
    if (event.kind === 'move') {
      this.virtualCursor.x = Math.max(0, Math.min(this.config.androidWidth - 1, this.virtualCursor.x + (event.dx ?? 0)));
      this.virtualCursor.y = Math.max(0, Math.min(this.config.androidHeight - 1, this.virtualCursor.y + (event.dy ?? 0)));
      if (this.atAndroidReturnEdge()) { void this.returnToWindows(); return; }
      this.deps.uhid.sendMouseReport({ buttons: 0, dx: Math.max(-127, Math.min(127, event.dx ?? 0)), dy: Math.max(-127, Math.min(127, event.dy ?? 0)), wheel: 0 });
    } else if (event.kind === 'wheel') this.deps.uhid.sendMouseReport({ buttons: 0, dx: 0, dy: 0, wheel: event.delta ?? 0 });
    else if (event.kind === 'button') this.deps.uhid.sendMouseReport({ buttons: event.down ? (1 << (event.button ?? 0)) : 0, dx: 0, dy: 0, wheel: 0 });
    else if (event.kind === 'key') {
      const code = event.code ?? 0;
      if (code === 27 && event.down) { const now = Date.now(); if (now - this.lastEscapeAt <= 400) { void this.stop('emergency'); return; } this.lastEscapeAt = now; }
      if (event.down) this.pressedKeys.add(code); else this.pressedKeys.delete(code);
      if ((event.isWinKey && this.config.preserveWinKey) || (event.isAltTab && this.config.preserveAltTab) || (event.isVolumeKey && this.config.preserveVolumeKeys)) return;
      this.deps.uhid.sendKeyboardReport({ modifiers: event.modifiers ?? 0, keys: event.down ? [code] : [] });
    }
  }

  onStatus(listener: (status: AndroidInputStatus) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  status(): AndroidInputStatus { return { state: this.state, deviceSerial: this.serial, virtualCursor: { ...this.virtualCursor } }; }
  private async enterAndroid() {
    if (!this.config) return;
    this.clearEdgeTimer();
    const cursor = this.deps.bridge.getCursor();
    const screen = this.deps.screen ?? { width: 1920, height: 1080 };
    this.virtualCursor = {
      x: this.mapCoordinate(cursor.x, screen.width, this.config.androidWidth),
      y: this.mapCoordinate(cursor.y, screen.height, this.config.androidHeight),
    };
    this.state = 'android';
    this.deps.bridge.setBlocked(true);
    this.emit('android');
  }
  private async returnToWindows() {
    if (!this.config) return;
    this.state = 'returning';
    this.emit('returning');
    this.flushKeys();
    const screen = this.deps.screen ?? { width: 1920, height: 1080 };
    this.deps.bridge.setCursor(
      this.mapCoordinate(this.virtualCursor.x, this.config.androidWidth, screen.width),
      this.mapCoordinate(this.virtualCursor.y, this.config.androidHeight, screen.height),
    );
    this.deps.bridge.setBlocked(false);
    this.state = 'windows';
    this.emit('windows');
  }
  private mapCoordinate(value: number, sourceSize: number, targetSize: number) {
    if (sourceSize <= 1 || targetSize <= 1) return 0;
    const ratio = Math.max(0, Math.min(1, value / (sourceSize - 1)));
    return Math.round(ratio * (targetSize - 1));
  }
  private atConfiguredEdge(x: number, y: number) { const c = this.config!; return c.placement === 'right' ? x >= (this.deps.screen?.width ?? 1920) - 1 : c.placement === 'left' ? x <= 0 : c.placement === 'top' ? y <= 0 : y >= (this.deps.screen?.height ?? 1080) - 1; }
  private atAndroidReturnEdge() { const c = this.config!; return c.placement === 'right' ? this.virtualCursor.x <= 0 : c.placement === 'left' ? this.virtualCursor.x >= c.androidWidth - 1 : c.placement === 'top' ? this.virtualCursor.y >= c.androidHeight - 1 : this.virtualCursor.y <= 0; }
  private flushKeys() { for (const code of this.pressedKeys) this.deps.uhid.sendKeyboardReport({ modifiers: 0, keys: [] }); this.pressedKeys.clear(); }
  private clearEdgeTimer() { if (this.edgeTimer) clearTimeout(this.edgeTimer); this.edgeTimer = null; }
  private emit(state: AndroidInputState, errorCode?: string) { this.state = state; const status = { ...this.status(), errorCode }; for (const listener of this.listeners) listener(status); }
}
