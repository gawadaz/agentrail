# Workflow Execution (MVP Feature 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add `agentrail run <workflow> "<task>"`: load a named workflow, execute its steps in order against real provider CLIs and real shell commands, pass each step's output forward as context, abort on first failure, and print a completion summary.

**Architecture:** Each `ProviderAdapter` gains an `execute(prompt, exec)` method that shells out to that provider's non-interactive CLI. A new `src/orchestrator/` module holds `buildPrompt` (pure prompt framing), `runShellCommand` (platform-aware shell dispatch), and `runWorkflow` (the step loop: look up provider or run shell, capture output, accumulate context, abort on failure). `program.ts` gains a `run` command wiring `loadWorkflow` + `runWorkflow` together.

**Tech Stack:** TypeScript, Node.js, vitest. No new dependencies.

Spec: `docs/superpowers/specs/2026-09-05-workflow-execution-design.md`

Note: the working tree already contains (uncommitted) a provider registry swap — `gemini` replaced by `antigravity` (`agy`) and `copilot` (`copilot`) adapters, plus a Windows-compatible `realExec` rewrite (`src/discovery/exec.ts`) using `cmd /c` dispatch. This plan builds on top of that pre-existing state; no task in this plan re-touches `registry.ts` or `exec.ts`'s existing behavior except to add the shared timeout constant.

---

### Task 1: Provider `execute()` — types and constant

**Files:**
- Modify: `c:\git\agentrail\src\discovery\types.ts`
- Create: `c:\git\agentrail\src\providers\constants.ts`
- Test: `c:\git\agentrail\tests\providers\constants.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/providers/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';

describe('PROVIDER_EXECUTE_TIMEOUT_MS', () => {
  it('is 30 minutes in milliseconds', () => {
    expect(PROVIDER_EXECUTE_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers/constants.test.ts`
Expected: FAIL — `Cannot find module '../../src/providers/constants.js'`

- [x] **Step 3: Write minimal implementation**

Create `src/providers/constants.ts`:

```ts
export const PROVIDER_EXECUTE_TIMEOUT_MS = 30 * 60 * 1000;
```

Modify `src/discovery/types.ts` — add `execute` to `ProviderAdapter` (after `checkAuth`):

```ts
export interface ProviderAdapter {
  name: string;
  command: string;
  versionArgs: string[];
  parseVersion?: (stdout: string) => string | undefined;
  checkAuth: (exec: ExecFn) => Promise<AuthCheckResult>;
  execute: (prompt: string, exec: ExecFn) => Promise<ExecResult>;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers/constants.test.ts`
Expected: PASS (1 test)

Note: adding `execute` to the `ProviderAdapter` interface will make `src/providers/claude/adapter.ts`, `codex/adapter.ts`, `antigravity/adapter.ts`, and `copilot/adapter.ts` fail to type-check until Task 2 adds `execute` to each. That's expected and fixed in the next task — don't run `npm run build` or the full suite until Task 2 is done.

- [x] **Step 5: Commit**

```bash
git add src/discovery/types.ts src/providers/constants.ts tests/providers/constants.test.ts
git commit -m "feat: add ProviderAdapter.execute and shared execute timeout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Implement `execute()` on all four provider adapters

**Files:**
- Modify: `c:\git\agentrail\src\providers\claude\adapter.ts`
- Modify: `c:\git\agentrail\src\providers\codex\adapter.ts`
- Modify: `c:\git\agentrail\src\providers\antigravity\adapter.ts`
- Modify: `c:\git\agentrail\src\providers\copilot\adapter.ts`
- Modify: `c:\git\agentrail\tests\providers\claude.test.ts`
- Modify: `c:\git\agentrail\tests\providers\codex.test.ts`
- Modify: `c:\git\agentrail\tests\providers\antigravity.test.ts`
- Modify: `c:\git\agentrail\tests\providers\copilot.test.ts`

- [x] **Step 1: Write the failing tests**

Append to `tests/providers/claude.test.ts` (add the import alongside the
existing ones):

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';
```

```ts
describe('claudeAdapter.execute', () => {
  it('shells out to claude with -p and --dangerously-skip-permissions', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'done', stderr: '' };
    };

    const result = await claudeAdapter.execute('do the thing', fakeExec);

    expect(calls).toEqual([
      {
        cmd: 'claude',
        args: ['-p', 'do the thing', '--dangerously-skip-permissions'],
        opts: { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS },
      },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
  });
});
```

Append to `tests/providers/codex.test.ts`:

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';
```

```ts
describe('codexAdapter.execute', () => {
  it('shells out to codex exec with --dangerously-bypass-approvals-and-sandbox', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'done', stderr: '' };
    };

    const result = await codexAdapter.execute('do the thing', fakeExec);

    expect(calls).toEqual([
      {
        cmd: 'codex',
        args: ['exec', 'do the thing', '--dangerously-bypass-approvals-and-sandbox'],
        opts: { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS },
      },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
  });
});
```

Append to `tests/providers/antigravity.test.ts`:

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';
```

```ts
describe('antigravityAdapter.execute', () => {
  it('shells out to agy with -p and --dangerously-skip-permissions', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'done', stderr: '' };
    };

    const result = await antigravityAdapter.execute('do the thing', fakeExec);

    expect(calls).toEqual([
      {
        cmd: 'agy',
        args: ['-p', 'do the thing', '--dangerously-skip-permissions'],
        opts: { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS },
      },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
  });
});
```

Append to `tests/providers/copilot.test.ts`:

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../../src/providers/constants.js';
```

```ts
describe('copilotAdapter.execute', () => {
  it('shells out to copilot with -p and --allow-all', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (cmd: string, args: string[], opts?: { timeoutMs?: number }) => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'done', stderr: '' };
    };

    const result = await copilotAdapter.execute('do the thing', fakeExec);

    expect(calls).toEqual([
      {
        cmd: 'copilot',
        args: ['-p', 'do the thing', '--allow-all'],
        opts: { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS },
      },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/providers/`
Expected: FAIL — each adapter's test file errors with something like
`claudeAdapter.execute is not a function` (or a TS error if the adapter
object literal doesn't satisfy `ProviderAdapter` yet — either way, red).

- [x] **Step 3: Write minimal implementation**

Modify `src/providers/claude/adapter.ts` — add the import and the `execute`
method inside the returned object (after `checkAuth`, note the trailing
comma before it and no comma needed after since it's now the last field):

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../constants.js';
```

```ts
    async execute(prompt, exec) {
      return exec('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });
    },
```

Modify `src/providers/codex/adapter.ts`:

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../constants.js';
```

```ts
  async execute(prompt, exec) {
    return exec('codex', ['exec', prompt, '--dangerously-bypass-approvals-and-sandbox'], {
      timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
    });
  },
```

Modify `src/providers/antigravity/adapter.ts`:

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../constants.js';
```

```ts
  async execute(prompt, exec) {
    return exec('agy', ['-p', prompt, '--dangerously-skip-permissions'], {
      timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
    });
  },
```

Modify `src/providers/copilot/adapter.ts`:

```ts
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../constants.js';
```

```ts
    async execute(prompt, exec) {
      return exec('copilot', ['-p', prompt, '--allow-all'], {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });
    },
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/providers/`
Expected: PASS (all provider test files green)

- [x] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [x] **Step 6: Commit**

```bash
git add src/providers/claude/adapter.ts src/providers/codex/adapter.ts src/providers/antigravity/adapter.ts src/providers/copilot/adapter.ts tests/providers/claude.test.ts tests/providers/codex.test.ts tests/providers/antigravity.test.ts tests/providers/copilot.test.ts
git commit -m "feat: implement execute() on all provider adapters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `buildPrompt`

**Files:**
- Create: `c:\git\agentrail\src\orchestrator\buildPrompt.ts`
- Test: `c:\git\agentrail\tests\orchestrator\buildPrompt.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/orchestrator/buildPrompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/orchestrator/buildPrompt.js';
import type { ProviderStep } from '../../src/workflow/types.js';

describe('buildPrompt', () => {
  it('frames the first step with no prior context', () => {
    const step: ProviderStep = { name: 'plan', provider: 'claude', task: 'create-plan' };

    const prompt = buildPrompt('feature', 'add dark mode', step, '');

    expect(prompt).toBe(
      'You are running the "create-plan" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Prior step output:\n' +
        '(none — this is the first step)'
    );
  });

  it('includes prior context for later steps', () => {
    const step: ProviderStep = { name: 'implement', provider: 'claude', task: 'implement' };

    const prompt = buildPrompt('feature', 'add dark mode', step, '\n\n--- plan ---\n1. do X');

    expect(prompt).toBe(
      'You are running the "implement" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Prior step output:\n' +
        '\n\n--- plan ---\n1. do X'
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/buildPrompt.test.ts`
Expected: FAIL — `Cannot find module '../../src/orchestrator/buildPrompt.js'`

- [x] **Step 3: Write minimal implementation**

Create `src/orchestrator/buildPrompt.ts`:

```ts
import type { ProviderStep } from '../workflow/types.js';

export function buildPrompt(
  workflowName: string,
  taskDescription: string,
  step: ProviderStep,
  priorContext: string
): string {
  const context = priorContext || '(none — this is the first step)';

  return (
    `You are running the "${step.task}" step of the "${workflowName}" workflow.\n\n` +
    `Overall task: ${taskDescription}\n\n` +
    `Prior step output:\n` +
    context
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/buildPrompt.test.ts`
Expected: PASS (2 tests)

- [x] **Step 5: Commit**

```bash
git add src/orchestrator/buildPrompt.ts tests/orchestrator/buildPrompt.test.ts
git commit -m "feat: add buildPrompt for orchestrator provider steps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `runShellCommand`

**Files:**
- Create: `c:\git\agentrail\src\orchestrator\runShellCommand.ts`
- Test: `c:\git\agentrail\tests\orchestrator\runShellCommand.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/orchestrator/runShellCommand.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runShellCommand } from '../../src/orchestrator/runShellCommand.js';
import type { ExecResult } from '../../src/discovery/types.js';

describe('runShellCommand', () => {
  it('dispatches via cmd /c on win32', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (
      cmd: string,
      args: string[],
      opts?: { timeoutMs?: number }
    ): Promise<ExecResult> => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    const result = await runShellCommand('npm test', fakeExec, {
      timeoutMs: 1000,
      platform: 'win32',
    });

    expect(calls).toEqual([
      { cmd: 'cmd', args: ['/c', 'npm test'], opts: { timeoutMs: 1000 } },
    ]);
    expect(result).toEqual({ code: 0, stdout: 'ok', stderr: '' });
  });

  it('dispatches via sh -c on posix platforms', async () => {
    const calls: Array<{ cmd: string; args: string[]; opts?: { timeoutMs?: number } }> = [];
    const fakeExec = async (
      cmd: string,
      args: string[],
      opts?: { timeoutMs?: number }
    ): Promise<ExecResult> => {
      calls.push({ cmd, args, opts });
      return { code: 0, stdout: 'ok', stderr: '' };
    };

    await runShellCommand('npm test', fakeExec, { timeoutMs: 1000, platform: 'linux' });

    expect(calls).toEqual([
      { cmd: 'sh', args: ['-c', 'npm test'], opts: { timeoutMs: 1000 } },
    ]);
  });

  it('defaults to process.platform when no platform override is given', async () => {
    const fakeExec = async (): Promise<ExecResult> => ({ code: 0, stdout: '', stderr: '' });

    const result = await runShellCommand('echo hi', fakeExec);

    expect(result.code).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/runShellCommand.test.ts`
Expected: FAIL — `Cannot find module '../../src/orchestrator/runShellCommand.js'`

- [x] **Step 3: Write minimal implementation**

Create `src/orchestrator/runShellCommand.ts`:

```ts
import type { ExecFn, ExecResult } from '../discovery/types.js';

export async function runShellCommand(
  command: string,
  exec: ExecFn,
  opts?: { timeoutMs?: number; platform?: NodeJS.Platform }
): Promise<ExecResult> {
  const platform = opts?.platform ?? process.platform;
  const execOpts = opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : undefined;

  if (platform === 'win32') {
    return exec('cmd', ['/c', command], execOpts);
  }
  return exec('sh', ['-c', command], execOpts);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/runShellCommand.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add src/orchestrator/runShellCommand.ts tests/orchestrator/runShellCommand.test.ts
git commit -m "feat: add runShellCommand for orchestrator shell steps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `runWorkflow`

**Files:**
- Create: `c:\git\agentrail\src\orchestrator\runWorkflow.ts`
- Test: `c:\git\agentrail\tests\orchestrator\runWorkflow.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/orchestrator/runWorkflow.test.ts`:

```ts
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
    expect(calls[1]).toBe('exec:sh -c npm test');
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/runWorkflow.test.ts`
Expected: FAIL — `Cannot find module '../../src/orchestrator/runWorkflow.js'`

- [x] **Step 3: Write minimal implementation**

Create `src/orchestrator/runWorkflow.ts`:

```ts
import type { ExecFn, ProviderAdapter } from '../discovery/types.js';
import type { Workflow } from '../workflow/types.js';
import { isShellStep } from '../workflow/types.js';
import { buildPrompt } from './buildPrompt.js';
import { runShellCommand } from './runShellCommand.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../providers/constants.js';

export interface RunWorkflowDeps {
  registry: ProviderAdapter[];
  exec: ExecFn;
  write: (text: string) => void;
}

export interface RunWorkflowResult {
  ok: boolean;
  stepsRun: number;
  failedStep?: string;
}

export async function runWorkflow(
  workflow: Workflow,
  taskDescription: string,
  deps: RunWorkflowDeps
): Promise<RunWorkflowResult> {
  const total = workflow.steps.length;
  let context = '';

  for (let i = 0; i < total; i++) {
    const step = workflow.steps[i];
    const n = i + 1;
    deps.write(`→ Step ${n}/${total}: ${step.name}\n`);

    if (isShellStep(step)) {
      const result = await runShellCommand(step.run, deps.exec, {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });

      if (result.code !== 0) {
        deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
        if (result.stderr) deps.write(result.stderr + '\n');
        return { ok: false, stepsRun: i, failedStep: step.name };
      }

      if (result.stdout) deps.write(result.stdout + '\n');
      context += `\n\n--- ${step.name} ---\n${result.stdout}`;
      deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
      continue;
    }

    const adapter = deps.registry.find((p) => p.command === step.provider || p.name === step.provider);
    if (!adapter) {
      deps.write(`✗ Step ${n}/${total} ("${step.name}") failed: provider "${step.provider}" is not registered\n`);
      return { ok: false, stepsRun: i, failedStep: step.name };
    }

    const prompt = buildPrompt(workflow.name, taskDescription, step, context);
    const result = await adapter.execute(prompt, deps.exec);

    if (result.code !== 0) {
      deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
      if (result.stderr) deps.write(result.stderr + '\n');
      return { ok: false, stepsRun: i, failedStep: step.name };
    }

    if (result.stdout) deps.write(result.stdout + '\n');
    context += `\n\n--- ${step.name} ---\n${result.stdout}`;
    deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
  }

  deps.write(
    `Workflow "${workflow.name}" completed — ${total}/${total} steps succeeded.\n\n` +
      'AgentRail does not commit or push automatically. Please review the changes before committing.\n'
  );

  return { ok: true, stepsRun: total };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/runWorkflow.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [x] **Step 6: Commit**

```bash
git add src/orchestrator/runWorkflow.ts tests/orchestrator/runWorkflow.test.ts
git commit -m "feat: add runWorkflow orchestrator step loop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `agentrail run` CLI command

**Files:**
- Modify: `c:\git\agentrail\src\program.ts`
- Modify: `c:\git\agentrail\tests\program.test.ts`

- [x] **Step 1: Write the failing tests**

Append to `tests/program.test.ts` (reuse the existing `dirs` array / `afterEach`
cleanup already in that file):

```ts
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
    writeFileSync(
      join(workflowsDir, 'feature.yaml'),
      'name: feature\nsteps:\n  - name: test\n    run: echo hi\n'
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
  });
});
```

Check the top of `tests/program.test.ts` for the existing `fakeExec` fixture
used by other tests (e.g. the `providers`/`workflows` describe blocks) — reuse
it as-is; it already resolves with `{ code: 0, stdout: '', stderr: '' }` for
any shell command, which is sufficient for the `echo hi` shell step above.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/program.test.ts`
Expected: FAIL — `unknown command 'run'`

- [x] **Step 3: Add the command to `program.ts`**

Add these imports at the top of `src/program.ts`, alongside the existing
ones:

```ts
import { loadWorkflow } from './workflow/loadWorkflow.js';
import { runWorkflow } from './orchestrator/runWorkflow.js';
```

Add the new command inside `createProgram`, after the `workflows` command and
before the `init` command:

```ts
  program
    .command('run')
    .description('Run a workflow against real provider CLIs and shell commands')
    .argument('<workflow>', 'workflow name (from .agentrail/workflows/<name>.yaml)')
    .argument('<task>', 'task description passed to every provider step')
    .action(async (workflowName: string, task: string) => {
      const loaded = loadWorkflow(cwd(), workflowName);
      if (!loaded.ok) {
        writeErr(loaded.errors.join('\n') + '\n');
        program.error(`Failed to load workflow "${workflowName}"`);
        return;
      }

      const result = await runWorkflow(loaded.workflow, task, {
        registry: deps.registry,
        exec: deps.exec,
        write,
      });

      if (!result.ok) {
        process.exitCode = 1;
      }
    });
```

`deps` here refers to the `ProgramDeps` parameter of `createProgram` (already
in scope — see how the `providers` command above uses `deps.registry` and
`deps.exec`).

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/program.test.ts`
Expected: PASS (all tests in the file, including the 2 new `agentrail run` ones)

- [x] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [x] **Step 6: Commit**

```bash
git add src/program.ts tests/program.test.ts
git commit -m "feat: add agentrail run command

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Final full-suite verification

**Files:** none (verification only)

- [x] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no skipped/failed tests.

- [x] **Step 2: Run the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [x] **Step 3: Smoke-test the built CLI**

From a throwaway temp directory:

```bash
mkdir -p /tmp/agentrail-smoke && cd /tmp/agentrail-smoke
mkdir -p .agentrail/workflows
printf 'name: smoke\nsteps:\n  - name: echo\n    run: echo hello-from-agentrail\n' > .agentrail/workflows/smoke.yaml
node c:/git/agentrail/dist/cli.js run smoke "smoke test"
```

Expected: prints `→ Step 1/1: echo`, then `hello-from-agentrail`, then
`✓ Step 1/1 ("echo") completed`, then `Workflow "smoke" completed — 1/1 steps
succeeded.`

- [x] **Step 4: Report status**

Confirm to the user that:
- `agentrail run <workflow> "<task>"` executes a workflow's steps in order
  against real provider CLIs (`claude`, `codex`, `agy`, `copilot`) and real
  shell commands, passing each step's captured stdout forward as context to
  the next provider step.
- A failing step (non-zero exit) aborts the run immediately; a step naming an
  unregistered provider fails immediately without invoking anything.
- Output is captured and printed after each step completes (not streamed),
  and a plain completion message is printed once all steps succeed.
