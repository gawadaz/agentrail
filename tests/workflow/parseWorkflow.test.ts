import { describe, it, expect } from 'vitest';
import { parseWorkflow } from '../../src/workflow/parseWorkflow.js';

describe('parseWorkflow', () => {
  it('accepts a valid workflow with provider and shell steps', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [
        { name: 'plan', provider: 'claude', task: 'create-plan' },
        { name: 'test', run: 'npm test' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        name: 'feature',
        steps: [
          { name: 'plan', provider: 'claude', task: 'create-plan' },
          { name: 'test', run: 'npm test' },
        ],
      },
    });
  });

  it('rejects a non-object top level', () => {
    const result = parseWorkflow('not an object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        'workflow must be a YAML mapping (object) at the top level',
      ]);
    }
  });

  it('rejects a missing/empty name', () => {
    const result = parseWorkflow({ name: '', steps: [{ name: 'a', run: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"name" is required and must be a non-empty string');
    }
  });

  it('rejects missing/empty steps', () => {
    const result = parseWorkflow({ name: 'feature', steps: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"steps" is required and must be a non-empty array');
    }
  });

  it('rejects a step missing a name', () => {
    const result = parseWorkflow({ name: 'feature', steps: [{ run: 'npm test' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('step 1: "name" is required and must be a non-empty string');
    }
  });

  it('rejects duplicate step names', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [
        { name: 'test', run: 'npm test' },
        { name: 'test', run: 'npm run test:e2e' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('step 2 ("test"): duplicate step name "test"');
    }
  });

  it('rejects a step with neither run nor provider/task', () => {
    const result = parseWorkflow({ name: 'feature', steps: [{ name: 'mystery' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("mystery"): must have either "run" or both "provider" and "task"'
      );
    }
  });

  it('rejects a step with both run and provider/task', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'both', run: 'npm test', provider: 'claude', task: 'implement' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("both"): must have either "run" or both "provider" and "task", not both'
      );
    }
  });

  it('rejects a provider step missing task', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "task" is required and must be a non-empty string'
      );
    }
  });

  it('rejects a provider step missing provider', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', task: 'create-plan' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "provider" is required and must be a non-empty string'
      );
    }
  });

  it('collects multiple errors from multiple steps in one pass', () => {
    const result = parseWorkflow({
      name: '',
      steps: [{ name: 'a' }, { provider: 'claude', task: 'x' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        '"name" is required and must be a non-empty string',
        'step 1 ("a"): must have either "run" or both "provider" and "task"',
        'step 2: "name" is required and must be a non-empty string',
      ]);
    }
  });
});
