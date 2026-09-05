import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/orchestrator/buildPrompt.js';
import type { ProviderStep } from '../../src/workflow/types.js';

describe('buildPrompt', () => {
  it('frames the first step with no context files', () => {
    const step: ProviderStep = { name: 'plan', provider: 'claude', task: 'create-plan' };

    const prompt = buildPrompt('feature', 'add dark mode', step, new Map());

    expect(prompt).toBe(
      'You are running the "create-plan" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Context:\n\n' +
        '(none — this is the first step)'
    );
  });

  it('renders a single context file', () => {
    const step: ProviderStep = {
      name: 'plan',
      provider: 'claude',
      task: 'create-plan',
      context: ['requirements'],
    };
    const context = new Map([['requirements.md', '1. support dark mode']]);

    const prompt = buildPrompt('feature', 'add dark mode', step, context);

    expect(prompt).toBe(
      'You are running the "create-plan" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Context:\n\n' +
        '--- requirements.md ---\n1. support dark mode'
    );
  });

  it('renders multiple context files in insertion order', () => {
    const step: ProviderStep = {
      name: 'implement',
      provider: 'claude',
      task: 'implement',
      context: ['requirements', 'plan'],
    };
    const context = new Map([
      ['requirements.md', '1. support dark mode'],
      ['plan.md', '1. add a toggle'],
    ]);

    const prompt = buildPrompt('feature', 'add dark mode', step, context);

    expect(prompt).toBe(
      'You are running the "implement" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Context:\n\n' +
        '--- requirements.md ---\n1. support dark mode\n\n' +
        '--- plan.md ---\n1. add a toggle'
    );
  });
});
