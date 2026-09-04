import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProgram } from '../src/program.js';
import type { ExecFn, ProviderAdapter } from '../src/discovery/types.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const fakeRegistry: ProviderAdapter[] = [
  {
    name: 'Fake Provider',
    command: 'fakecli',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim(),
    checkAuth: async () => ({ status: 'yes' }),
  },
];

const fakeExec: ExecFn = async (cmd) =>
  cmd === 'fakecli'
    ? { code: 0, stdout: '1.0.0', stderr: '' }
    : { code: -1, stdout: '', stderr: 'not found' };

describe('agentrail providers', () => {
  it('prints a report for the registered providers', async () => {
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'providers']);

    const text = output.join('');
    expect(text).toContain('✓ Fake Provider');
    expect(text).toContain('Authenticated: yes');
  });
});

describe('agentrail init', () => {
  it('writes .agentrail/config.yaml in the given cwd', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'init']);

    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(true);
    expect(output.join('')).toContain('Wrote');
  });

  it('skips writing when config.yaml already exists and --force is not passed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const makeProgram = () =>
      createProgram({
        exec: fakeExec,
        registry: fakeRegistry,
        cwd: () => dir,
        stdout: (t) => output.push(t),
      });

    await makeProgram().parseAsync(['node', 'agentrail', 'init']);
    output.length = 0;
    await makeProgram().parseAsync(['node', 'agentrail', 'init']);

    expect(output.join('')).toContain('Skipped');
  });
});
