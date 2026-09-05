import { describe, it, expect } from 'vitest';
import { createCopilotAdapter, copilotAdapter } from '../../src/providers/copilot/adapter.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';

const noopExec = async () => ({ code: 0, stdout: '', stderr: '' });

describe('copilot adapter', () => {
  it('has the expected command and name', () => {
    const adapter = createCopilotAdapter();
    expect(adapter.name).toBe('GitHub Copilot CLI');
    expect(adapter.command).toBe('copilot');
    expect(adapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes when COPILOT_GITHUB_TOKEN is set', async () => {
    const adapter = createCopilotAdapter({ env: { COPILOT_GITHUB_TOKEN: 'tok' } });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
  });

  it('reports authenticated yes when GH_TOKEN is set', async () => {
    const adapter = createCopilotAdapter({ env: { GH_TOKEN: 'tok' } });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
  });

  it('reports authenticated yes when GITHUB_TOKEN is set', async () => {
    const adapter = createCopilotAdapter({ env: { GITHUB_TOKEN: 'tok' } });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
  });

  it('reports authenticated unknown when no token env var is set', async () => {
    const adapter = createCopilotAdapter({ env: {} });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('unknown');
  });
});

describe('copilotAdapter.execute', () => {
  it('shells out to copilot with -p and --allow-all', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'done', stderr: '' };
    };

    const result = await copilotAdapter.execute('do the thing', fakeExec);

    expect(calls).toEqual([
      {
        cmd: 'copilot',
        args: ['-p', 'do the thing', '--allow-all'],
        opts: { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS },
      },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
  });
});
