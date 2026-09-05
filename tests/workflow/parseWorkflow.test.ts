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

  it('accepts optional output on a shell step and output/context on a provider step', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [
        { name: 'analyze', provider: 'claude', task: 'analyze-requirements', output: 'requirements.md' },
        {
          name: 'plan',
          provider: 'claude',
          task: 'create-plan',
          output: 'plan.md',
          context: ['requirements'],
        },
        { name: 'test', run: 'npm test', output: 'test-results.md' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        name: 'feature',
        steps: [
          {
            name: 'analyze',
            provider: 'claude',
            task: 'analyze-requirements',
            output: 'requirements.md',
          },
          {
            name: 'plan',
            provider: 'claude',
            task: 'create-plan',
            output: 'plan.md',
            context: ['requirements'],
          },
          { name: 'test', run: 'npm test', output: 'test-results.md' },
        ],
      },
    });
  });

  it('omits output/context from the parsed step when not provided', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        name: 'feature',
        steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
      },
    });
  });

  it('rejects a non-string output', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', output: 123 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "output" must be a non-empty string'
      );
    }
  });

  it('rejects an empty output', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', output: '' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "output" must be a non-empty string'
      );
    }
  });

  it('rejects a context that is not an array', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', context: 'requirements' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "context" must be an array of non-empty strings'
      );
    }
  });

  it('rejects a context array containing a non-string element', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', context: ['requirements', 5] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "context" must be an array of non-empty strings'
      );
    }
  });

  it('rejects context on a shell step', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'test', run: 'npm test', context: ['requirements'] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("test"): "context" is only valid on provider steps, not "run" steps'
      );
    }
  });
});
