import { describe, it, expect } from 'vitest';
import { codexAdapter } from '../../src/providers/codex/adapter.js';

describe('codex adapter', () => {
  it('has the expected command and name', () => {
    expect(codexAdapter.name).toBe('Codex');
    expect(codexAdapter.command).toBe('codex');
    expect(codexAdapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes on exit code 0', async () => {
    const result = await codexAdapter.checkAuth(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('yes');
  });

  it('reports authenticated no on exit code 1', async () => {
    const result = await codexAdapter.checkAuth(async () => ({
      code: 1,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('no');
  });

  it('reports authenticated unknown on an unexpected exit code', async () => {
    const result = await codexAdapter.checkAuth(async () => ({
      code: 127,
      stdout: '',
      stderr: 'unknown subcommand',
    }));
    expect(result.status).toBe('unknown');
    expect(result.note).toContain('127');
  });

  it('calls "codex login status"', async () => {
    let calledWith: [string, string[]] | undefined;
    await codexAdapter.checkAuth(async (cmd, args) => {
      calledWith = [cmd, args];
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(calledWith).toEqual(['codex', ['login', 'status']]);
  });
});
