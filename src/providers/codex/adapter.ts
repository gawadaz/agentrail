import type { ProviderAdapter } from '../../discovery/types.js';

export const codexAdapter: ProviderAdapter = {
  name: 'Codex',
  command: 'codex',
  versionArgs: ['--version'],
  parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
  async checkAuth(exec) {
    const result = await exec('codex', ['login', 'status'], { timeoutMs: 5000 });
    if (result.code === 0) return { status: 'yes' };
    if (result.code === 1) return { status: 'no' };
    return { status: 'unknown', note: `unexpected exit code ${result.code}` };
  },
};
