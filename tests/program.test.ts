import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
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
  it('writes .agentrail/config.yaml with only the selected providers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      isInteractive: () => true,
      promptSelect: async (statuses) => statuses,
    });

    await program.parseAsync(['node', 'agentrail', 'init']);

    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(true);
    expect(output.join('')).toContain('Wrote');
  });

  it('writes an empty providers map when nothing is selected', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      isInteractive: () => true,
      promptSelect: async () => [],
    });

    await program.parseAsync(['node', 'agentrail', 'init']);

    const content = readFileSync(join(dir, '.agentrail', 'config.yaml'), 'utf-8');
    expect(yaml.load(content)).toEqual({ providers: {} });
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
        isInteractive: () => true,
        promptSelect: async (statuses) => statuses,
      });

    await makeProgram().parseAsync(['node', 'agentrail', 'init']);
    output.length = 0;
    await makeProgram().parseAsync(['node', 'agentrail', 'init']);

    expect(output.join('')).toContain('Skipped');
  });

  it('errors without writing when not run in an interactive terminal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      stderr: (t) => errors.push(t),
      isInteractive: () => false,
      promptSelect: async (statuses) => statuses,
    });

    await expect(
      program.exitOverride().parseAsync(['node', 'agentrail', 'init'])
    ).rejects.toThrow();

    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(false);
    expect(errors.join('')).toContain('interactive terminal');
  });
});
