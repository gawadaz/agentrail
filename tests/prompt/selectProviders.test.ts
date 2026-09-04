import { describe, it, expect } from 'vitest';
import { buildChoices, selectProviders } from '../../src/prompt/selectProviders.js';
import type { ProviderStatus } from '../../src/discovery/types.js';

const statuses: ProviderStatus[] = [
  { name: 'Claude Code', command: 'claude', installed: true, authenticated: 'yes' },
  { name: 'Gemini CLI', command: 'gemini', installed: false, authenticated: 'unknown' },
];

describe('buildChoices', () => {
  it('labels detected providers and marks every choice unchecked', () => {
    const choices = buildChoices(statuses);

    expect(choices).toEqual([
      { name: 'Claude Code (detected)', value: 'claude', checked: false },
      { name: 'Gemini CLI (not detected)', value: 'gemini', checked: false },
    ]);
  });

  it('returns an empty list for an empty input', () => {
    expect(buildChoices([])).toEqual([]);
  });
});

describe('selectProviders', () => {
  it('returns only the statuses whose command was selected, preserving order', async () => {
    const fakePrompt = async () => ['gemini', 'claude'];

    const result = await selectProviders(statuses, fakePrompt);

    expect(result).toEqual([statuses[0], statuses[1]]);
  });

  it('returns an empty array when nothing is selected', async () => {
    const fakePrompt = async () => [];

    const result = await selectProviders(statuses, fakePrompt);

    expect(result).toEqual([]);
  });

  it('passes buildChoices output to the prompt function', async () => {
    let received: unknown;
    const fakePrompt = async (choices: unknown) => {
      received = choices;
      return [];
    };

    await selectProviders(statuses, fakePrompt);

    expect(received).toEqual(buildChoices(statuses));
  });
});
