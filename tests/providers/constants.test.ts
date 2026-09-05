import { describe, it, expect } from 'vitest';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';

describe('PROVIDER_EXECUTE_TIMEOUT_MS', () => {
  it('is 30 minutes in milliseconds', () => {
    expect(PROVIDER_EXECUTE_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});
