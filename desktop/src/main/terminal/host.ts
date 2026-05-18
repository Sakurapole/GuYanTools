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
  private static readonly MAX_SESSION_BUFFER_CHARS = 2_000_000;

  private readonly host = new JsTerminalHost();
  private readonly emitter = new EventEmitter();
  private readonly sessionBuffers = new Map<string, string>();

  constructor() {
    this.host.registerEventSink((payload: string) => {
      try {
        const event = JSON.parse(payload) as TerminalEventEnvelope;
        this.updateSessionBuffer(event);
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
    const session = this.host.createSession(payload);
    if (!this.sessionBuffers.has(session.sessionId)) {
      this.sessionBuffers.set(session.sessionId, '');
    }
    return session;
  }

  getBuffer(sessionId: string) {
    return this.sessionBuffers.get(sessionId) ?? '';
  }

  clearBuffer(sessionId: string) {
    this.sessionBuffers.set(sessionId, '');
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

  private updateSessionBuffer(event: TerminalEventEnvelope) {
    if (event.eventType === 'data') {
      this.appendSessionBuffer(event.sessionId, event.data ?? '');
      return;
    }

    if (event.eventType === 'exit') {
      this.sessionBuffers.delete(event.sessionId);
    }
  }

  private appendSessionBuffer(sessionId: string, data: string) {
    if (!data) return;

    const previous = this.sessionBuffers.get(sessionId) ?? '';
    const next = `${previous}${data}`;
    if (next.length <= TerminalHost.MAX_SESSION_BUFFER_CHARS) {
      this.sessionBuffers.set(sessionId, next);
      return;
    }

    this.sessionBuffers.set(sessionId, next.slice(next.length - TerminalHost.MAX_SESSION_BUFFER_CHARS));
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
