import { describe, it, expect } from 'vitest';
import { createClaudeAdapter } from '../../src/providers/claude/adapter.js';

const noopExec = async () => ({ code: 0, stdout: '', stderr: '' });

describe('claude adapter', () => {
  it('has the expected command and name', () => {
    const adapter = createClaudeAdapter();
    expect(adapter.name).toBe('Claude Code');
    expect(adapter.command).toBe('claude');
    expect(adapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes when ANTHROPIC_API_KEY is set', async () => {
    const adapter = createClaudeAdapter({
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      existsSync: () => false,
      homedir: () => '/home/test',
    });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
    expect(result.note).toContain('ANTHROPIC_API_KEY');
  });

  it('reports authenticated yes when the credentials file exists', async () => {
    const adapter = createClaudeAdapter({
      env: {},
      existsSync: (path: string) => path.endsWith('.credentials.json'),
      homedir: () => '/home/test',
    });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
    expect(result.note).toContain('credentials file');
  });

  it('reports authenticated no when neither signal is present', async () => {
    const adapter = createClaudeAdapter({
      env: {},
      existsSync: () => false,
      homedir: () => '/home/test',
    });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('no');
  });

  it('honors CLAUDE_CONFIG_DIR when checking for credentials', async () => {
    let checkedPath = '';
    const adapter = createClaudeAdapter({
      env: { CLAUDE_CONFIG_DIR: '/custom/dir' },
      existsSync: (path: string) => {
        checkedPath = path;
        return true;
      },
      homedir: () => '/home/test',
    });
    await adapter.checkAuth(noopExec);
    expect(checkedPath).toContain('custom');
    expect(checkedPath).toContain('.credentials.json');
  });
});
