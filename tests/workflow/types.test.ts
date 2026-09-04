import { describe, it, expect } from 'vitest';
import { isShellStep } from '../../src/workflow/types.js';
import type { WorkflowStep } from '../../src/workflow/types.js';

describe('isShellStep', () => {
  it('returns true for a step with a "run" key', () => {
    const step: WorkflowStep = { name: 'lint', run: 'npm run lint' };
    expect(isShellStep(step)).toBe(true);
  });

  it('returns false for a provider step', () => {
    const step: WorkflowStep = { name: 'plan', provider: 'claude', task: 'create-plan' };
    expect(isShellStep(step)).toBe(false);
  });
});
