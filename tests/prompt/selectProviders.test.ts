import { describe, it, expect } from 'vitest';
import { buildChoices } from '../../src/prompt/selectProviders.js';
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
