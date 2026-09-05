import { describe, it, expect } from 'vitest';
import { antigravityAdapter } from '../../src/providers/antigravity/adapter.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';

describe('antigravity adapter', () => {
  it('has the expected command and name', () => {
    expect(antigravityAdapter.name).toBe('Antigravity CLI');
    expect(antigravityAdapter.command).toBe('agy');
    expect(antigravityAdapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes on exit code 0', async () => {
    const result = await antigravityAdapter.checkAuth(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('yes');
  });

  it('reports authenticated no on exit code 1', async () => {
    const result = await antigravityAdapter.checkAuth(async () => ({
      code: 1,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('no');
  });

  it('reports authenticated unknown on an unexpected exit code', async () => {
    const result = await antigravityAdapter.checkAuth(async () => ({
      code: 127,
      stdout: '',
      stderr: 'unknown subcommand',
    }));
    expect(result.status).toBe('unknown');
  });

  it('calls "agy auth status"', async () => {
    let calledWith: [string, string[]] | undefined;
    await antigravityAdapter.checkAuth(async (cmd, args) => {
      calledWith = [cmd, args];
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(calledWith).toEqual(['agy', ['auth', 'status']]);
  });
});

describe('antigravityAdapter.execute', () => {
  it('shells out to agy with -p and --dangerously-skip-permissions', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'done', stderr: '' };
    };

    const result = await antigravityAdapter.execute('do the thing', fakeExec);

    expect(calls).toEqual([
      {
        cmd: 'agy',
        args: ['-p', 'do the thing', '--dangerously-skip-permissions'],
        opts: { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS },
      },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
  });
});
