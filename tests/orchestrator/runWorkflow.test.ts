import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkflow } from '../../src/orchestrator/runWorkflow.js';
import type { Workflow } from '../../src/workflow/types.js';
import type { ExecFn, ProviderAdapter } from '../../src/discovery/types.js';

function makeFakeAdapter(command: string, execute: ProviderAdapter['execute']): ProviderAdapter {
  return {
    name: command,
    command,
    versionArgs: ['--version'],
    async checkAuth() {
      return { status: 'yes' };
    },
    execute,
  };
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-runworkflow-'));
  dirs.push(dir);
  return dir;
}

describe('runWorkflow', () => {
  it('runs provider and shell steps in order, persisting each step output to the run dir', async () => {
    const dir = makeTmpDir();
    const calls: string[] = [];
    const claude = makeFakeAdapter('claude', async (prompt) => {
      calls.push(`claude:${prompt}`);
      return { code: 0, stdout: 'plan output', stderr: '' };
    });
    const fakeExec: ExecFn = async (cmd, args) => {
      calls.push(`exec:${cmd} ${args.join(' ')}`);
      return { code: 0, stdout: 'test output', stderr: '' };
    };

    const workflow: Workflow = {
      name: 'feature',
      steps: [
        { name: 'plan', provider: 'claude', task: 'create-plan' },
        { name: 'test', run: 'npm test' },
      ],
    };

    const written: string[] = [];
    const result = await runWorkflow(workflow, 'add dark mode', {
      registry: [claude],
      exec: fakeExec,
      write: (text) => written.push(text),
      cwd: dir,
    });

    expect(result.ok).toBe(true);
    expect(result.stepsRun).toBe(2);
    expect(calls[0]).toContain('claude:');
    expect(calls[0]).toContain('create-plan');
    const expectedShellCall =
      process.platform === 'win32' ? 'exec:cmd /c npm test' : 'exec:sh -c npm test';
    expect(calls[1]).toBe(expectedShellCall);

    const output = written.join('');
    expect(output).toContain('Step 1/2: plan');
    expect(output).toContain('plan output');
    expect(output).toContain('Step 2/2: test');
    expect(output).toContain('test output');
    expect(output).toContain('Workflow "feature" completed — 2/2 steps succeeded.');

    expect(readFileSync(join(result.runDir, 'task.md'), 'utf-8')).toBe('add dark mode');
    expect(readFileSync(join(result.runDir, 'plan.md'), 'utf-8')).toBe('plan output');
    expect(readFileSync(join(result.runDir, 'test.md'), 'utf-8')).toBe('test output');
    expect(readFileSync(join(result.runDir, 'final-summary.md'), 'utf-8')).toContain(
      'Workflow "feature" completed — 2/2 steps succeeded.'
    );
    const progress = JSON.parse(readFileSync(join(result.runDir, 'progress.json'), 'utf-8'));
    expect(progress.steps).toEqual([
      { name: 'plan', status: 'success', output: 'plan.md' },
      { name: 'test', status: 'success', output: 'test.md' },
    ]);
  });

  it('passes only the declared context files to a later step', async () => {
    const dir = makeTmpDir();
    const prompts: string[] = [];
    const analyze = makeFakeAdapter('gemini', async () => ({
      code: 0,
      stdout: '1. support dark mode',
      stderr: '',
    }));
    const plan = makeFakeAdapter('claude', async (prompt) => {
      prompts.push(prompt);
      return { code: 0, stdout: '1. add a toggle', stderr: '' };
    });
    const fakeExec: ExecFn = async () => ({ code: 0, stdout: '', stderr: '' });

    const workflow: Workflow = {
      name: 'feature',
      steps: [
        { name: 'analyze', provider: 'gemini', task: 'analyze-requirements', output: 'requirements.md' },
        { name: 'plan', provider: 'claude', task: 'create-plan', context: ['requirements'] },
      ],
    };

    const result = await runWorkflow(workflow, 'add dark mode', {
      registry: [analyze, plan],
      exec: fakeExec,
      write: () => {},
      cwd: dir,
    });

    expect(result.ok).toBe(true);
    expect(prompts[0]).toContain('--- requirements.md ---\n1. support dark mode');
  });

  it('stops after the first failing step', async () => {
    const dir = makeTmpDir();
    const claude = makeFakeAdapter('claude', async () => {
      return { code: 1, stdout: '', stderr: 'boom' };
    });
    let secondStepRan = false;
    const fakeExec: ExecFn = async () => {
      secondStepRan = true;
      return { code: 0, stdout: '', stderr: '' };
    };

    const workflow: Workflow = {
      name: 'feature',
      steps: [
        { name: 'plan', provider: 'claude', task: 'create-plan' },
        { name: 'test', run: 'npm test' },
      ],
    };

    const written: string[] = [];
    const result = await runWorkflow(workflow, 'add dark mode', {
      registry: [claude],
      exec: fakeExec,
      write: (text) => written.push(text),
      cwd: dir,
    });

    expect(result.ok).toBe(false);
    expect(result.stepsRun).toBe(0);
    expect(result.failedStep).toBe('plan');
    expect(secondStepRan).toBe(false);
    expect(written.join('')).toContain('Step 1/2 ("plan") failed (exit 1)');

    const progress = JSON.parse(readFileSync(join(result.runDir, 'progress.json'), 'utf-8'));
    expect(progress.steps[0]).toEqual({ name: 'plan', status: 'failed' });
    expect(existsSync(join(result.runDir, 'final-summary.md'))).toBe(true);
  });

  it('fails a step immediately when the provider is not registered', async () => {
    const dir = makeTmpDir();
    const fakeExec: ExecFn = async () => ({ code: 0, stdout: '', stderr: '' });

    const workflow: Workflow = {
      name: 'feature',
      steps: [{ name: 'plan', provider: 'unknown-provider', task: 'create-plan' }],
    };

    const written: string[] = [];
    const result = await runWorkflow(workflow, 'add dark mode', {
      registry: [],
      exec: fakeExec,
      write: (text) => written.push(text),
      cwd: dir,
    });

    expect(result.ok).toBe(false);
    expect(result.stepsRun).toBe(0);
    expect(result.failedStep).toBe('plan');
    expect(written.join('')).toContain('provider "unknown-provider" is not registered');
  });

  it('fails a step immediately when a declared context file was never produced', async () => {
    const dir = makeTmpDir();
    const claude = makeFakeAdapter('claude', async () => ({ code: 0, stdout: 'x', stderr: '' }));
    const fakeExec: ExecFn = async () => ({ code: 0, stdout: '', stderr: '' });

    const workflow: Workflow = {
      name: 'feature',
      steps: [
        { name: 'plan', provider: 'claude', task: 'create-plan', context: ['requirements'] },
      ],
    };

    const written: string[] = [];
    const result = await runWorkflow(workflow, 'add dark mode', {
      registry: [claude],
      exec: fakeExec,
      write: (text) => written.push(text),
      cwd: dir,
    });

    expect(result.ok).toBe(false);
    expect(result.stepsRun).toBe(0);
    expect(result.failedStep).toBe('plan');
    expect(written.join('')).toContain('context file "requirements.md" not found');
  });
});
