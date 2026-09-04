import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkflow } from './loadWorkflow.js';

export interface WorkflowListEntry {
  name: string;
  path: string;
  valid: boolean;
  errors?: string[];
}

export function listWorkflows(cwd: string): WorkflowListEntry[] {
  const dir = join(cwd, '.agentrail', 'workflows');

  if (!existsSync(dir)) {
    return [];
  }

  const names = readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => file.slice(0, -'.yaml'.length))
    .sort();

  return names.map((name) => {
    const result = loadWorkflow(cwd, name);
    if (result.ok) {
      return { name, path: result.path, valid: true };
    }
    return { name, path: result.path, valid: false, errors: result.errors };
  });
}
