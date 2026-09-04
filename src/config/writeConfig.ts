import { mkdirSync, existsSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { ProviderStatus } from '../discovery/types.js';

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates',
  'workflows'
);

export interface WriteConfigResult {
  wrote: boolean;
  path: string;
  reason?: string;
}

function scaffoldWorkflowTemplates(workflowsDir: string): void {
  if (!existsSync(TEMPLATES_DIR)) {
    return;
  }
  for (const file of readdirSync(TEMPLATES_DIR)) {
    const dest = join(workflowsDir, file);
    if (existsSync(dest)) {
      continue;
    }
    copyFileSync(join(TEMPLATES_DIR, file), dest);
  }
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

  const workflowsDir = join(agentrailDir, 'workflows');
  mkdirSync(workflowsDir, { recursive: true });
  mkdirSync(join(agentrailDir, 'tasks'), { recursive: true });
  mkdirSync(join(agentrailDir, 'runs'), { recursive: true });

  scaffoldWorkflowTemplates(workflowsDir);

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
