import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listWorkflows } from '../../src/workflow/listWorkflows.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-listworkflows-'));
  dirs.push(dir);
  return dir;
}

describe('listWorkflows', () => {
  it('returns an empty array when the workflows directory does not exist', () => {
    const dir = makeTmpDir();
    expect(listWorkflows(dir)).toEqual([]);
  });

  it('lists valid and invalid workflows, sorted by name', () => {
    const dir = makeTmpDir();
    const workflowsDir = join(dir, '.agentrail', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(
      join(workflowsDir, 'feature.yaml'),
      'name: feature\nsteps:\n  - name: plan\n    provider: claude\n    task: create-plan\n'
    );
    writeFileSync(join(workflowsDir, 'broken.yaml'), 'name: broken\nsteps: []\n');
    writeFileSync(join(workflowsDir, 'notes.txt'), 'ignore me');

    const entries = listWorkflows(dir);

    expect(entries).toEqual([
      {
        name: 'broken',
        path: join(workflowsDir, 'broken.yaml'),
        valid: false,
        errors: ['"steps" is required and must be a non-empty array'],
      },
      { name: 'feature', path: join(workflowsDir, 'feature.yaml'), valid: true },
    ]);
  });
});
