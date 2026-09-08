import { mkdirSync, existsSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { ProviderStatus } from '../discovery/types.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the bundled workflow templates. Order of candidates:
 *   1. <moduleDir>/templates/workflows        — bundled skill layout (cli.js + templates/)
 *   2. <moduleDir>/../../templates/workflows   — tsc dist/ layout (dist/config/writeConfig.js)
 * Falls back to candidate 2 so callers still get a stable path to log.
 */
export function resolveTemplatesDir(moduleDir: string = MODULE_DIR): string {
  const candidates = [
    join(moduleDir, 'templates', 'workflows'),
    join(moduleDir, '..', '..', 'templates', 'workflows'),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[1];
}

const TEMPLATES_DIR = resolveTemplatesDir();

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
