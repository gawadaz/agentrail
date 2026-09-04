import { describe, it, expect } from 'vitest';
import { geminiAdapter } from '../../src/providers/gemini/adapter.js';

describe('gemini adapter', () => {
  it('has the expected command and name', () => {
    expect(geminiAdapter.name).toBe('Gemini CLI');
    expect(geminiAdapter.command).toBe('gemini');
    expect(geminiAdapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes on exit code 0', async () => {
    const result = await geminiAdapter.checkAuth(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('yes');
  });

  it('reports authenticated no on exit code 1', async () => {
    const result = await geminiAdapter.checkAuth(async () => ({
      code: 1,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('no');
  });

  it('reports authenticated unknown on an unexpected exit code', async () => {
    const result = await geminiAdapter.checkAuth(async () => ({
      code: 127,
      stdout: '',
      stderr: 'unknown subcommand',
    }));
    expect(result.status).toBe('unknown');
  });

  it('calls "gemini auth status"', async () => {
    let calledWith: [string, string[]] | undefined;
    await geminiAdapter.checkAuth(async (cmd, args) => {
      calledWith = [cmd, args];
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(calledWith).toEqual(['gemini', ['auth', 'status']]);
  });
});
