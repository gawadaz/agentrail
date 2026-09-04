import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseWorkflow } from './parseWorkflow.js';
import type { Workflow } from './types.js';

export type LoadWorkflowResult =
  | { ok: true; workflow: Workflow; path: string }
  | { ok: false; path: string; errors: string[] };

export function loadWorkflow(cwd: string, name: string): LoadWorkflowResult {
  const path = join(cwd, '.agentrail', 'workflows', `${name}.yaml`);

  if (!existsSync(path)) {
    return { ok: false, path, errors: [`Workflow "${name}" not found at ${path}`] };
  }

  const content = readFileSync(path, 'utf-8');

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path, errors: [`${path}: ${message}`] };
  }

  const result = parseWorkflow(raw);
  if (!result.ok) {
    return { ok: false, path, errors: result.errors };
  }

  return { ok: true, workflow: result.workflow, path };
}
