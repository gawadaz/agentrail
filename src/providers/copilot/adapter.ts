import type { ProviderAdapter } from '../../discovery/types.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../constants.js';

export interface CopilotAdapterDeps {
  env: NodeJS.ProcessEnv;
}

export function createCopilotAdapter(
  deps: Partial<CopilotAdapterDeps> = {}
): ProviderAdapter {
  const env = deps.env ?? process.env;

  return {
    name: 'GitHub Copilot CLI',
    command: 'copilot',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
    async checkAuth() {
      if (env.COPILOT_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN) {
        return { status: 'yes', note: 'auth token env var set' };
      }

      return {
        status: 'unknown',
        note: 'no auth token env var set; OS credential store not checked',
      };
    },
    async execute(prompt, exec) {
      return exec('copilot', ['-p', prompt, '--allow-all'], {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });
    },
  };
}

export const copilotAdapter = createCopilotAdapter();
