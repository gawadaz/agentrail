import { describe, it, expect } from 'vitest';
import { runWorkflow } from '../../src/orchestrator/runWorkflow.js';
import type { Workflow } from '../../src/workflow/types.js';
import type { ExecFn, ExecResult, ProviderAdapter } from '../../src/discovery/types.js';

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

describe('runWorkflow', () => {
  it('runs provider and shell steps in order, accumulating context', async () => {
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
    });

    expect(result).toEqual({ ok: true, stepsRun: 2 });
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
  });

  it('stops after the first failing step', async () => {
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
    });

    expect(result).toEqual({ ok: false, stepsRun: 0, failedStep: 'plan' });
    expect(secondStepRan).toBe(false);
    expect(written.join('')).toContain('Step 1/2 ("plan") failed (exit 1)');
  });

  it('fails a step immediately when the provider is not registered', async () => {
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
    });

    expect(result).toEqual({ ok: false, stepsRun: 0, failedStep: 'plan' });
    expect(written.join('')).toContain("provider \"unknown-provider\" is not registered");
  });
});
