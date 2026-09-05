import { describe, it, expect } from 'vitest';
import { providerRegistry } from '../../src/providers/registry.js';

describe('providerRegistry', () => {
  it('lists exactly the 4 MVP providers in product-plan order', () => {
    expect(providerRegistry.map((a) => a.command)).toEqual([
      'claude',
      'codex',
      'agy',
      'copilot',
    ]);
  });
});
