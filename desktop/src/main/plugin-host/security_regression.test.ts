import { describe, expect, it } from 'vitest';
import { redactPluginLogMeta, validatePluginCommand } from './security_guards';

describe('plugin security regression guards', () => {
  it('rejects arbitrary commands outside the plugin namespace', () => {
    expect(() => validatePluginCommand('guyantools.example', 'shell.exec')).toThrow('PLUGIN_COMMAND_DENIED');
    expect(() => validatePluginCommand('guyantools.example', 'guyantools.example.resolve')).not.toThrow();
  });

  it('redacts credentials and sensitive fields before plugin metadata is logged', () => {
    const safe = redactPluginLogMeta({ token: 'secret-token', Cookie: 'SESSDATA=secret', nested: { password: 'secret-password' }, ok: 'value' });
    expect(JSON.stringify(safe)).not.toContain('secret-token');
    expect(JSON.stringify(safe)).not.toContain('SESSDATA');
    expect(JSON.stringify(safe)).not.toContain('secret-password');
    expect(safe).toMatchObject({ token: '[REDACTED]', Cookie: '[REDACTED]', nested: { password: '[REDACTED]' }, ok: 'value' });
  });
});
