import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/orchestrator/buildPrompt.js';
import type { ProviderStep } from '../../src/workflow/types.js';

describe('buildPrompt', () => {
  it('frames the first step with no prior context', () => {
    const step: ProviderStep = { name: 'plan', provider: 'claude', task: 'create-plan' };

    const prompt = buildPrompt('feature', 'add dark mode', step, '');

    expect(prompt).toBe(
      'You are running the "create-plan" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Prior step output:\n' +
        '(none — this is the first step)'
    );
  });

  it('includes prior context for later steps', () => {
    const step: ProviderStep = { name: 'implement', provider: 'claude', task: 'implement' };

    const prompt = buildPrompt('feature', 'add dark mode', step, '\n\n--- plan ---\n1. do X');

    expect(prompt).toBe(
      'You are running the "implement" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Prior step output:\n' +
        '\n\n--- plan ---\n1. do X'
    );
  });
});
