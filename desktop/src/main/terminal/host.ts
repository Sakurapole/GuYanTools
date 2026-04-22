import { BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import { JsTerminalHost } from '@guyantools/core';
import type {
  CreateTerminalSessionPayload,
  ResizeTerminalSessionPayload,
  TerminalEventEnvelope,
  TerminalProfile,
  TerminalSessionDescriptor,
} from '@/contracts/terminal';

class TerminalHost {
  private readonly host = new JsTerminalHost();
  private readonly emitter = new EventEmitter();

  constructor() {
    this.host.registerEventSink((payload: string) => {
      try {
        const event = JSON.parse(payload) as TerminalEventEnvelope;
        this.emitter.emit('event', event);
        this.broadcast(event);
      } catch (error) {
        console.error('[TerminalHost] Failed to parse terminal event payload:', error);
      }
    });
  }

  onEvent(listener: (event: TerminalEventEnvelope) => void) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  listProfiles(): TerminalProfile[] {
    return this.host.listProfiles();
  }

  listSessions(): TerminalSessionDescriptor[] {
    return this.host.listSessions();
  }

  createSession(payload: CreateTerminalSessionPayload): TerminalSessionDescriptor {
    return this.host.createSession(payload);
  }

  write(sessionId: string, data: string) {
    this.host.write(sessionId, data);
  }

  resizeSession(payload: ResizeTerminalSessionPayload) {
    this.host.resizeSession(payload);
  }

  killSession(sessionId: string) {
    this.host.killSession(sessionId);
  }

  attachSession(sessionId: string, target: string) {
    this.host.attachSession(sessionId, target);
  }

  attachToMain(sessionId: string) {
    this.host.attachSession(sessionId, 'main');
  }

  closeDetachedView(sessionId: string, target: string) {
    this.host.closeDetachedView(sessionId, target);
  }

  private broadcast(event: TerminalEventEnvelope) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:event', event);
      }
    }
  }
}

export const terminalHost = new TerminalHost();
