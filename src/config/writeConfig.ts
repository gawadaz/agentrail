import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { ProviderStatus } from '../discovery/types.js';

export interface WriteConfigResult {
  wrote: boolean;
  path: string;
  reason?: string;
}

export function writeConfig(
  cwd: string,
  statuses: ProviderStatus[],
  opts: { force?: boolean } = {}
): WriteConfigResult {
  const agentrailDir = join(cwd, '.agentrail');
  const configPath = join(agentrailDir, 'config.yaml');

  if (existsSync(configPath) && !opts.force) {
    return {
      wrote: false,
      path: configPath,
      reason: 'config.yaml already exists (use --force to overwrite)',
    };
  }

  mkdirSync(join(agentrailDir, 'workflows'), { recursive: true });
  mkdirSync(join(agentrailDir, 'tasks'), { recursive: true });
  mkdirSync(join(agentrailDir, 'runs'), { recursive: true });

  const providers: Record<string, Record<string, unknown>> = {};
  for (const status of statuses) {
    if (!status.installed) {
      providers[status.command] = { command: status.command, installed: false };
      continue;
    }
    providers[status.command] = {
      command: status.command,
      installed: true,
      authenticated: status.authenticated,
    };
  }

  writeFileSync(configPath, yaml.dump({ providers }), 'utf-8');

  return { wrote: true, path: configPath };
}
