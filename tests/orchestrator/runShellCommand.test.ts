import { describe, it, expect } from 'vitest';
import { runShellCommand } from '../../src/orchestrator/runShellCommand.js';
import type { ExecResult } from '../../src/discovery/types.js';

describe('runShellCommand', () => {
  it('dispatches via cmd /c on win32', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (
      cmd: string,
      args: string[],
      opts?: { timeoutMs?: number }
    ): Promise<ExecResult> => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    const result = await runShellCommand('npm test', fakeExec, {
      timeoutMs: 1000,
      platform: 'win32',
    });

    expect(calls).toEqual([
      { cmd: 'cmd', args: ['/c', 'npm test'], opts: { timeoutMs: 1000 } },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'ok', stderr: '' });
  });

  it('dispatches via sh -c on posix platforms', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (
      cmd: string,
      args: string[],
      opts?: { timeoutMs?: number }
    ): Promise<ExecResult> => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    await runShellCommand('npm test', fakeExec, { timeoutMs: 1000, platform: 'linux' });

    expect(calls).toEqual([
      { cmd: 'sh', args: ['-c', 'npm test'], opts: { timeoutMs: 1000 } },
    ]);
  });

  it('defaults to process.platform when no platform override is given', async () => {
    const fakeExec = async (): Promise<ExecResult> => ({ code: 0, stdout: '', stderr: '' });

    const result = await runShellCommand('echo hi', fakeExec);

    expect(result.code).toBe(0);
  });
});
