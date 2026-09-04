import { existsSync as realExistsSync } from 'node:fs';
import { homedir as realHomedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAdapter } from '../../discovery/types.js';

export interface ClaudeAdapterDeps {
  existsSync: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
}

export function createClaudeAdapter(
  deps: Partial<ClaudeAdapterDeps> = {}
): ProviderAdapter {
  const existsSync = deps.existsSync ?? realExistsSync;
  const env = deps.env ?? process.env;
  const homedir = deps.homedir ?? realHomedir;

  return {
    name: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
    async checkAuth() {
      if (env.ANTHROPIC_API_KEY) {
        return { status: 'yes', note: 'ANTHROPIC_API_KEY set' };
      }

      const credentialsPath = env.CLAUDE_CONFIG_DIR
        ? join(env.CLAUDE_CONFIG_DIR, '.credentials.json')
        : join(homedir(), '.claude', '.credentials.json');

      if (existsSync(credentialsPath)) {
        return { status: 'yes', note: 'credentials file found' };
      }

      return { status: 'no', note: 'no credentials file or ANTHROPIC_API_KEY' };
    },
  };
}

export const claudeAdapter = createClaudeAdapter();
