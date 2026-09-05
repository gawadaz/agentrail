import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
    execute: async () => ({ code: 0, stdout: 'ok', stderr: '' }),
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

describe('agentrail workflows', () => {
  it('reports no workflows found when the directory does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'workflows']);

    expect(output.join('')).toContain('No workflows found');
  });

  it('lists valid and invalid workflows found in .agentrail/workflows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const workflowsDir = join(dir, '.agentrail', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(
      join(workflowsDir, 'feature.yaml'),
      'name: feature\nsteps:\n  - name: plan\n    provider: claude\n    task: create-plan\n'
    );
    writeFileSync(join(workflowsDir, 'broken.yaml'), 'name: broken\nsteps: []\n');

    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'workflows']);

    const text = output.join('');
    expect(text).toContain('✓ feature');
    expect(text).toContain('✗ broken');
    expect(text).toContain('"steps" is required and must be a non-empty array');
  });
});

describe('agentrail run', () => {
  it('fails cleanly when the workflow does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const errOutput: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      stderr: (t) => errOutput.push(t),
    });
    program.exitOverride();

    await expect(
      program.parseAsync(['node', 'agentrail', 'run', 'missing', 'do the thing'])
    ).rejects.toThrow();

    expect(errOutput.join('')).toContain('Workflow "missing" not found');
  });

  it('runs a workflow end to end and reports success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const workflowsDir = join(dir, '.agentrail', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
    // Note: a shell step would hit fakeExec's `else` branch (it invokes `cmd`/`sh`,
    // not `fakecli`, and returns code: -1), so this uses a provider step that
    // resolves through fakeRegistry's `execute` (added above) instead, to
    // exercise a genuinely successful end-to-end run.
    writeFileSync(
      join(workflowsDir, 'feature.yaml'),
      'name: feature\nsteps:\n  - name: test\n    provider: fakecli\n    task: add dark mode\n'
    );

    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'run', 'feature', 'add dark mode']);

    expect(output.join('')).toContain('Workflow "feature" completed — 1/1 steps succeeded.');
    expect(output.join('')).toMatch(/Run files written to .*\.agentrail[\\/]runs[\\/]/);
  });
});
