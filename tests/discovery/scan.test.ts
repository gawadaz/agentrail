import { describe, it, expect } from 'vitest';
import { scanAll } from '../../src/discovery/scan.js';
import type { ExecFn, ProviderAdapter } from '../../src/discovery/types.js';

function makeAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'Fake',
    command: 'fake',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim(),
    checkAuth: async () => ({ status: 'yes' }),
    ...overrides,
  };
}

describe('scanAll', () => {
  it('reports not installed when the version command fails', async () => {
    const adapter = makeAdapter({ command: 'missing' });
    const exec: ExecFn = async () => ({ code: -1, stdout: '', stderr: 'not found' });

    const [status] = await scanAll([adapter], exec);

    expect(status.installed).toBe(false);
    expect(status.authenticated).toBe('unknown');
    expect(status.error).toBe('not found');
  });

  it('reports installed, version, and auth status when the version command succeeds', async () => {
    const adapter = makeAdapter({
      checkAuth: async () => ({ status: 'yes', note: 'test note' }),
    });
    const exec: ExecFn = async (cmd, args) => {
      if (args[0] === '--version') return { code: 0, stdout: '1.2.3\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    };

    const [status] = await scanAll([adapter], exec);

    expect(status.installed).toBe(true);
    expect(status.version).toBe('1.2.3');
    expect(status.authenticated).toBe('yes');
    expect(status.authNote).toBe('test note');
  });

  it('downgrades a throwing checkAuth to unknown instead of failing the scan', async () => {
    const adapter = makeAdapter({
      checkAuth: async () => {
        throw new Error('boom');
      },
    });
    const exec: ExecFn = async () => ({ code: 0, stdout: '1.0.0', stderr: '' });

    const [status] = await scanAll([adapter], exec);

    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe('unknown');
    expect(status.authNote).toBe('boom');
  });

  it('preserves adapter order in the results', async () => {
    const a = makeAdapter({ name: 'A', command: 'a' });
    const b = makeAdapter({ name: 'B', command: 'b' });
    const exec: ExecFn = async () => ({ code: 0, stdout: '1.0.0', stderr: '' });

    const results = await scanAll([a, b], exec);

    expect(results.map((r) => r.name)).toEqual(['A', 'B']);
  });
});
