import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AndroidUhidSession } from './android_uhid_service';

describe('AndroidUhidSession', () => {
  it('pushes and starts the fixed service path', async () => {
    const executeAdb = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const writes: string[] = [];
    const stderr = new EventEmitter();
    const stdout = new EventEmitter();
    const child = { stdin: { write: (value: string) => { writes.push(value); return true; }, end: vi.fn() }, stdout, stderr, on: vi.fn().mockReturnThis(), kill: vi.fn(() => true) };
    const toolchain = { getInputServicePath: () => 'C:/tools/service', getToolPath: () => 'adb.exe', executeAdb } as any;
    const session = new AndroidUhidSession(toolchain, { spawn: vi.fn(() => child as any) });
    const start = session.start('R58M123');
    await new Promise<void>(resolve => setTimeout(() => { stdout.emit('data', 'READY\n'); resolve(); }, 0));
    await start;
    session.sendKeyboardReport({ modifiers: 0, keys: [4] });
    expect(executeAdb).toHaveBeenCalledWith(expect.arrayContaining(['-s', 'R58M123', 'push', 'C:/tools/service']));
    expect(executeAdb).toHaveBeenCalledWith(expect.arrayContaining(['-s', 'R58M123', 'shell', 'chmod', '700']));
    expect(writes[0]).toContain('keyboard');
    await session.stop();
    expect(child.kill).toHaveBeenCalled();
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('rejects duplicate sessions, malformed reports, and disconnected writes', async () => {
    const executeAdb = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const child = { stdin: { write: vi.fn(() => true), end: vi.fn() }, stderr: new EventEmitter(), on: vi.fn().mockReturnThis(), kill: vi.fn(() => true) };
    const toolchain = { getInputServicePath: () => 'C:/tools/service', getToolPath: () => 'adb.exe', executeAdb } as any;
    const session = new AndroidUhidSession(toolchain, { spawn: vi.fn(() => child as any) });
    await session.start('R58M123');
    await expect(session.start('R58M123')).rejects.toThrow('ANDROID_UHID_START_FAILED');
    expect(() => session.sendKeyboardReport({ modifiers: 0, keys: [1, 2, 3, 4, 5, 6, 7] })).toThrow('ANDROID_UHID_PROTOCOL_ERROR');
    await session.stop();
    expect(() => session.sendMouseReport({ buttons: 0, dx: 0, dy: 0, wheel: 0 })).toThrow('ANDROID_UHID_DISCONNECTED');
  });

  it('sanitizes startup stderr in the stable error', async () => {
    const child = { stderr: new EventEmitter(), on: vi.fn().mockReturnThis(), kill: vi.fn(() => true) };
    const toolchain = { getInputServicePath: () => 'C:/tools/service', getToolPath: () => 'adb.exe', executeAdb: vi.fn(async () => { throw new Error('push failed\nsecret'); }) } as any;
    const session = new AndroidUhidSession(toolchain, { spawn: vi.fn(() => child as any) });
    await expect(session.start('R58M123')).rejects.toThrow('ANDROID_UHID_START_FAILED');
  });
});
