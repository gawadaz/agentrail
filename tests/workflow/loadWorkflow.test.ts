import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow } from '../../src/workflow/loadWorkflow.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-loadworkflow-'));
  dirs.push(dir);
  mkdirSync(join(dir, '.agentrail', 'workflows'), { recursive: true });
  return dir;
}

describe('loadWorkflow', () => {
  it('loads and validates an existing workflow file', () => {
    const dir = makeProjectDir();
    writeFileSync(
      join(dir, '.agentrail', 'workflows', 'feature.yaml'),
      'name: feature\nsteps:\n  - name: plan\n    provider: claude\n    task: create-plan\n'
    );

    const result = loadWorkflow(dir, 'feature');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workflow).toEqual({
        name: 'feature',
        steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
      });
      expect(result.path).toContain('feature.yaml');
    }
  });

  it('returns an error when the workflow file does not exist', () => {
    const dir = makeProjectDir();

    const result = loadWorkflow(dir, 'missing');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('Workflow "missing" not found');
    }
  });

  it('returns an error for malformed YAML', () => {
    const dir = makeProjectDir();
    writeFileSync(
      join(dir, '.agentrail', 'workflows', 'broken.yaml'),
      'name: [unterminated\n'
    );

    const result = loadWorkflow(dir, 'broken');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('broken.yaml');
    }
  });

  it('passes through parseWorkflow validation errors', () => {
    const dir = makeProjectDir();
    writeFileSync(
      join(dir, '.agentrail', 'workflows', 'invalid.yaml'),
      'name: invalid\nsteps: []\n'
    );

    const result = loadWorkflow(dir, 'invalid');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"steps" is required and must be a non-empty array');
    }
  });
});
