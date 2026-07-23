import { describe, expect, it, vi } from 'vitest';

describe('GitPluginInstaller', () => {
  it('rejects non-HTTPS repositories before spawning git', async () => {
    const { GitPluginInstaller } = await import('./git_installer');
    const runGit = vi.fn();
    const installer = new GitPluginInstaller(runGit, async () => 'deadbeef');

    await expect(installer.install({
      url: 'git@github.com:Sakurapole/plugin.git',
      destination: 'C:/tmp/plugin',
      ref: 'v1.0.0',
      refType: 'tag',
    })).rejects.toThrow('PLUGIN_GIT_URL_INVALID');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('uses an argv-only git invocation and records the resolved commit', async () => {
    const { GitPluginInstaller } = await import('./git_installer');
    const calls: string[][] = [];
    const runGit = vi.fn(async (args: string[]) => {
      calls.push(args);
      return args[0] === 'rev-parse' ? 'abc1234\n' : '';
    });
    const installer = new GitPluginInstaller(runGit, async () => 'deadbeef');

    const result = await installer.install({
      url: 'https://github.com/Sakurapole/plugin.git',
      destination: 'C:/tmp/plugin',
      ref: 'v1.0.0',
      refType: 'tag',
    });

    expect(result.resolvedCommit).toBe('abc1234');
    expect(result.packageSha256).toBe('deadbeef');
    expect(calls).toEqual([
      ['clone', '--depth', '1', 'https://github.com/Sakurapole/plugin.git', 'C:/tmp/plugin'],
      ['fetch', '--depth', '1', 'origin', 'refs/tags/v1.0.0'],
      ['checkout', '--detach', 'v1.0.0'],
      ['rev-parse', 'HEAD'],
    ]);
  });

  it('fetches a branch ref without treating the word branch as a refspec', async () => {
    const { GitPluginInstaller } = await import('./git_installer');
    const calls: string[][] = [];
    const installer = new GitPluginInstaller(async args => {
      calls.push(args);
      return args[0] === 'rev-parse' ? 'abc1234' : '';
    }, async () => 'deadbeef');

    await installer.install({
      url: 'https://github.com/Sakurapole/plugin.git',
      destination: 'C:/tmp/plugin',
      ref: 'main',
      refType: 'branch',
    });

    expect(calls).toContainEqual(['fetch', '--depth', '1', 'origin', 'refs/heads/main']);
    expect(calls).toContainEqual(['checkout', '--detach', 'FETCH_HEAD']);
  });
});
