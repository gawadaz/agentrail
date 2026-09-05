import type { ProviderAdapter } from '../../discovery/types.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../constants.js';

export const antigravityAdapter: ProviderAdapter = {
  name: 'Antigravity CLI',
  command: 'agy',
  versionArgs: ['--version'],
  parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
  async checkAuth(exec) {
    const result = await exec('agy', ['auth', 'status'], { timeoutMs: 5000 });
    if (result.code === 0) return { status: 'yes' };
    if (result.code === 1) return { status: 'no' };
    return { status: 'unknown', note: `unexpected exit code ${result.code}` };
  },
  async execute(prompt, exec) {
    return exec('agy', ['-p', prompt, '--dangerously-skip-permissions'], {
      timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
    });
  },
};
