# Shared Workflow Context (MVP Feature 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give the AgentRail orchestrator ownership of persisted workflow state: every `agentrail run` writes a `.agentrail/runs/<run-id>/` directory (task.md, progress.json, one output file per step, final-summary.md), and each provider step declares exactly which prior output files it needs instead of receiving the entire accumulated history.

**Architecture:** A new `src/context/runContext.ts` module owns all run-directory file I/O (create run, write step output, read named context files, update progress, write final summary). `WorkflowStep` types gain optional `output`/`context` fields that `parseWorkflow` validates. `buildPrompt` switches from a single `priorContext` string to a `Map<string, string>` of named context files. `runWorkflow` is rewritten to drive the run context instead of accumulating an in-memory string, and `program.ts`'s `run` command prints the run directory path on completion.

**Tech Stack:** TypeScript, Node.js (`node:fs`, `node:path`), vitest. No new dependencies.

Spec: `docs/superpowers/specs/2026-09-05-shared-workflow-context-design.md`

---

### Task 1: `output`/`context` fields on workflow steps

**Files:**
- Modify: `c:\git\agentrail\src\workflow\types.ts`
- Modify: `c:\git\agentrail\src\workflow\parseWorkflow.ts`
- Modify: `c:\git\agentrail\tests\workflow\parseWorkflow.test.ts`

- [x] **Step 1: Write the failing tests**

Append to `tests/workflow/parseWorkflow.test.ts` (inside the existing top-level
`describe('parseWorkflow', ...)` block, alongside the other `it(...)` cases):

```ts
  it('accepts optional output on a shell step and output/context on a provider step', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [
        { name: 'analyze', provider: 'claude', task: 'analyze-requirements', output: 'requirements.md' },
        {
          name: 'plan',
          provider: 'claude',
          task: 'create-plan',
          output: 'plan.md',
          context: ['requirements'],
        },
        { name: 'test', run: 'npm test', output: 'test-results.md' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        name: 'feature',
        steps: [
          {
            name: 'analyze',
            provider: 'claude',
            task: 'analyze-requirements',
            output: 'requirements.md',
          },
          {
            name: 'plan',
            provider: 'claude',
            task: 'create-plan',
            output: 'plan.md',
            context: ['requirements'],
          },
          { name: 'test', run: 'npm test', output: 'test-results.md' },
        ],
      },
    });
  });

  it('omits output/context from the parsed step when not provided', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        name: 'feature',
        steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
      },
    });
  });

  it('rejects a non-string output', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', output: 123 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "output" must be a non-empty string'
      );
    }
  });

  it('rejects an empty output', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', output: '' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "output" must be a non-empty string'
      );
    }
  });

  it('rejects a context that is not an array', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', context: 'requirements' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "context" must be an array of non-empty strings'
      );
    }
  });

  it('rejects a context array containing a non-string element', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan', context: ['requirements', 5] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "context" must be an array of non-empty strings'
      );
    }
  });

  it('rejects context on a shell step', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'test', run: 'npm test', context: ['requirements'] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("test"): "context" is only valid on provider steps, not "run" steps'
      );
    }
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/workflow/parseWorkflow.test.ts`
Expected: FAIL — the new fields aren't recognized yet (the "accepts optional
output..." case fails because the parsed result won't include `output`/
`context`; the rejection cases fail because nothing currently rejects them).

- [x] **Step 3: Write minimal implementation**

Modify `src/workflow/types.ts` (replace the whole file):

```ts
export interface ProviderStep {
  name: string;
  provider: string;
  task: string;
  output?: string;
  context?: string[];
}

export interface ShellStep {
  name: string;
  run: string;
  output?: string;
}

export type WorkflowStep = ProviderStep | ShellStep;

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export function isShellStep(step: WorkflowStep): step is ShellStep {
  return 'run' in step;
}
```

Modify `src/workflow/parseWorkflow.ts` — add an `isStringArray` helper near
the existing `isPlainObject` helper:

```ts
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}
```

Then replace the `if (hasRun) { ... }` block with:

```ts
    if (hasRun) {
      if (!isNonEmptyString(rawStep.run)) {
        errors.push(`${stepLabel}: "run" must be a non-empty string`);
        return;
      }
      if ('context' in rawStep) {
        errors.push(`${stepLabel}: "context" is only valid on provider steps, not "run" steps`);
        return;
      }
      let output: string | undefined;
      if ('output' in rawStep) {
        if (!isNonEmptyString(rawStep.output)) {
          errors.push(`${stepLabel}: "output" must be a non-empty string`);
          return;
        }
        output = rawStep.output;
      }
      if (hasName) {
        steps.push({
          name: rawStep.name as string,
          run: rawStep.run as string,
          ...(output !== undefined ? { output } : {}),
        });
      }
      return;
    }
```

And replace the `if (hasProvider || hasTask) { ... }` block with:

```ts
    if (hasProvider || hasTask) {
      const providerOk = isNonEmptyString(rawStep.provider);
      const taskOk = isNonEmptyString(rawStep.task);
      if (!providerOk) {
        errors.push(`${stepLabel}: "provider" is required and must be a non-empty string`);
      }
      if (!taskOk) {
        errors.push(`${stepLabel}: "task" is required and must be a non-empty string`);
      }

      let output: string | undefined;
      if ('output' in rawStep) {
        if (!isNonEmptyString(rawStep.output)) {
          errors.push(`${stepLabel}: "output" must be a non-empty string`);
        } else {
          output = rawStep.output;
        }
      }

      let context: string[] | undefined;
      if ('context' in rawStep) {
        if (!isStringArray(rawStep.context)) {
          errors.push(`${stepLabel}: "context" must be an array of non-empty strings`);
        } else {
          context = rawStep.context;
        }
      }

      if (hasName && providerOk && taskOk && !errors.some((e) => e.startsWith(stepLabel))) {
        steps.push({
          name: rawStep.name as string,
          provider: rawStep.provider as string,
          task: rawStep.task as string,
          ...(output !== undefined ? { output } : {}),
          ...(context !== undefined ? { context } : {}),
        });
      }
      return;
    }
```

Note the `!errors.some((e) => e.startsWith(stepLabel))` guard: it prevents
pushing a step into `steps` when this same step already produced an
`output`/`context` validation error above (mirroring how the existing
`providerOk`/`taskOk` checks work — a step with any error for itself doesn't
get added, but errors from *other* steps don't block it).

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/workflow/parseWorkflow.test.ts tests/workflow/types.test.ts`
Expected: PASS (all cases, old and new)

- [x] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: Some failures are expected in `tests/orchestrator/` and
`tests/program.test.ts` — nothing in this task touches those, so if they fail
it's pre-existing; confirm `tests/workflow/` and `tests/discovery/`,
`tests/providers/`, `tests/config/`, `tests/report/`, `tests/prompt/` are all
green (they don't depend on the changed files).

- [x] **Step 6: Commit**

```bash
git add src/workflow/types.ts src/workflow/parseWorkflow.ts tests/workflow/parseWorkflow.test.ts
git commit -m "feat: add optional output/context fields to workflow steps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `runContext` module

**Files:**
- Create: `c:\git\agentrail\src\context\runContext.ts`
- Test: `c:\git\agentrail\tests\context\runContext.test.ts`

- [x] **Step 1: Write the failing tests**

Create `tests/context/runContext.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRunContext,
  updateProgress,
  writeStepOutput,
  readContextFiles,
  writeFinalSummary,
} from '../../src/context/runContext.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-runcontext-'));
  dirs.push(dir);
  return dir;
}

const fixedNow = () => new Date(2026, 8, 5, 14, 30, 22);

describe('createRunContext', () => {
  it('creates the run directory, task.md, and initial progress.json', () => {
    const dir = makeTmpDir();

    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan', 'implement'], fixedNow);

    expect(ctx.runId).toBe('2026-09-05T143022');
    expect(ctx.runDir).toBe(join(dir, '.agentrail', 'runs', '2026-09-05T143022'));
    expect(existsSync(ctx.runDir)).toBe(true);
    expect(readFileSync(join(ctx.runDir, 'task.md'), 'utf-8')).toBe('add dark mode');

    const progress = JSON.parse(readFileSync(join(ctx.runDir, 'progress.json'), 'utf-8'));
    expect(progress.workflow).toBe('feature');
    expect(progress.task).toBe('add dark mode');
    expect(progress.startedAt).toBe(fixedNow().toISOString());
    expect(progress.steps).toEqual([
      { name: 'plan', status: 'pending' },
      { name: 'implement', status: 'pending' },
    ]);
  });
});

describe('updateProgress', () => {
  it('updates a step status and output in progress.json', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    updateProgress(ctx, 'plan', 'running');
    let progress = JSON.parse(readFileSync(join(ctx.runDir, 'progress.json'), 'utf-8'));
    expect(progress.steps[0]).toEqual({ name: 'plan', status: 'running' });

    updateProgress(ctx, 'plan', 'success', 'plan.md');
    progress = JSON.parse(readFileSync(join(ctx.runDir, 'progress.json'), 'utf-8'));
    expect(progress.steps[0]).toEqual({ name: 'plan', status: 'success', output: 'plan.md' });
  });
});

describe('writeStepOutput', () => {
  it('writes a file into the run directory', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    writeStepOutput(ctx, 'plan.md', '1. do the thing');

    expect(readFileSync(join(ctx.runDir, 'plan.md'), 'utf-8')).toBe('1. do the thing');
  });
});

describe('readContextFiles', () => {
  it('returns file contents keyed by filename when all names exist', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['analyze', 'plan'], fixedNow);
    writeStepOutput(ctx, 'requirements.md', '1. support dark mode');

    const result = readContextFiles(ctx, ['requirements']);

    expect(result).toEqual({
      ok: true,
      content: new Map([['requirements.md', '1. support dark mode']]),
    });
  });

  it('returns the first missing name when a context file does not exist', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    const result = readContextFiles(ctx, ['requirements']);

    expect(result).toEqual({ ok: false, missing: 'requirements' });
  });

  it('returns an empty map for an empty names list', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    const result = readContextFiles(ctx, []);

    expect(result).toEqual({ ok: true, content: new Map() });
  });
});

describe('writeFinalSummary', () => {
  it('writes final-summary.md into the run directory', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    writeFinalSummary(ctx, 'Workflow "feature" completed — 1/1 steps succeeded.\n');

    expect(readFileSync(join(ctx.runDir, 'final-summary.md'), 'utf-8')).toBe(
      'Workflow "feature" completed — 1/1 steps succeeded.\n'
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context/runContext.test.ts`
Expected: FAIL — `Cannot find module '../../src/context/runContext.js'`

- [x] **Step 3: Write minimal implementation**

Create `src/context/runContext.ts`:

```ts
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RunContext {
  runId: string;
  runDir: string;
}

export interface ProgressStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  output?: string;
}

interface ProgressFile {
  workflow: string;
  task: string;
  startedAt: string;
  steps: ProgressStep[];
}

function formatRunId(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function progressPath(ctx: RunContext): string {
  return join(ctx.runDir, 'progress.json');
}

function readProgress(ctx: RunContext): ProgressFile {
  return JSON.parse(readFileSync(progressPath(ctx), 'utf-8')) as ProgressFile;
}

function writeProgress(ctx: RunContext, progress: ProgressFile): void {
  writeFileSync(progressPath(ctx), JSON.stringify(progress, null, 2), 'utf-8');
}

export function createRunContext(
  cwd: string,
  workflowName: string,
  task: string,
  stepNames: string[],
  now: () => Date = () => new Date()
): RunContext {
  const date = now();
  const runId = formatRunId(date);
  const runDir = join(cwd, '.agentrail', 'runs', runId);
  mkdirSync(runDir, { recursive: true });

  writeFileSync(join(runDir, 'task.md'), task, 'utf-8');

  const ctx: RunContext = { runId, runDir };
  writeProgress(ctx, {
    workflow: workflowName,
    task,
    startedAt: date.toISOString(),
    steps: stepNames.map((name) => ({ name, status: 'pending' })),
  });

  return ctx;
}

export function updateProgress(
  ctx: RunContext,
  stepName: string,
  status: ProgressStep['status'],
  output?: string
): void {
  const progress = readProgress(ctx);
  const step = progress.steps.find((s) => s.name === stepName);
  if (step) {
    step.status = status;
    if (output !== undefined) step.output = output;
  }
  writeProgress(ctx, progress);
}

export function writeStepOutput(ctx: RunContext, filename: string, content: string): void {
  writeFileSync(join(ctx.runDir, filename), content, 'utf-8');
}

export type ReadContextResult =
  | { ok: true; content: Map<string, string> }
  | { ok: false; missing: string };

export function readContextFiles(ctx: RunContext, names: string[]): ReadContextResult {
  const content = new Map<string, string>();
  for (const name of names) {
    const filename = `${name}.md`;
    const path = join(ctx.runDir, filename);
    if (!existsSync(path)) {
      return { ok: false, missing: name };
    }
    content.set(filename, readFileSync(path, 'utf-8'));
  }
  return { ok: true, content };
}

export function writeFinalSummary(ctx: RunContext, text: string): void {
  writeFileSync(join(ctx.runDir, 'final-summary.md'), text, 'utf-8');
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/context/runContext.test.ts`
Expected: PASS (8 tests)

- [x] **Step 5: Commit**

```bash
git add src/context/runContext.ts tests/context/runContext.test.ts
git commit -m "feat: add runContext module for persisted workflow run state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `buildPrompt` switches to a context file map

**Files:**
- Modify: `c:\git\agentrail\src\orchestrator\buildPrompt.ts`
- Modify: `c:\git\agentrail\tests\orchestrator\buildPrompt.test.ts`

- [x] **Step 1: Write the failing tests**

Replace the full contents of `tests/orchestrator/buildPrompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/orchestrator/buildPrompt.js';
import type { ProviderStep } from '../../src/workflow/types.js';

describe('buildPrompt', () => {
  it('frames the first step with no context files', () => {
    const step: ProviderStep = { name: 'plan', provider: 'claude', task: 'create-plan' };

    const prompt = buildPrompt('feature', 'add dark mode', step, new Map());

    expect(prompt).toBe(
      'You are running the "create-plan" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Context:\n\n' +
        '(none — this is the first step)'
    );
  });

  it('renders a single context file', () => {
    const step: ProviderStep = {
      name: 'plan',
      provider: 'claude',
      task: 'create-plan',
      context: ['requirements'],
    };
    const context = new Map([['requirements.md', '1. support dark mode']]);

    const prompt = buildPrompt('feature', 'add dark mode', step, context);

    expect(prompt).toBe(
      'You are running the "create-plan" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Context:\n\n' +
        '--- requirements.md ---\n1. support dark mode'
    );
  });

  it('renders multiple context files in insertion order', () => {
    const step: ProviderStep = {
      name: 'implement',
      provider: 'claude',
      task: 'implement',
      context: ['requirements', 'plan'],
    };
    const context = new Map([
      ['requirements.md', '1. support dark mode'],
      ['plan.md', '1. add a toggle'],
    ]);

    const prompt = buildPrompt('feature', 'add dark mode', step, context);

    expect(prompt).toBe(
      'You are running the "implement" step of the "feature" workflow.\n\n' +
        'Overall task: add dark mode\n\n' +
        'Context:\n\n' +
        '--- requirements.md ---\n1. support dark mode\n\n' +
        '--- plan.md ---\n1. add a toggle'
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/buildPrompt.test.ts`
Expected: FAIL — old `buildPrompt` signature takes a string, not a `Map`, so
the assertions on the rendered text won't match.

- [x] **Step 3: Write minimal implementation**

Replace the full contents of `src/orchestrator/buildPrompt.ts`:

```ts
import type { ProviderStep } from '../workflow/types.js';

export function buildPrompt(
  workflowName: string,
  taskDescription: string,
  step: ProviderStep,
  context: Map<string, string>
): string {
  const contextText =
    context.size === 0
      ? '(none — this is the first step)'
      : Array.from(context.entries())
          .map(([filename, content]) => `--- ${filename} ---\n${content}`)
          .join('\n\n');

  return (
    `You are running the "${step.task}" step of the "${workflowName}" workflow.\n\n` +
    `Overall task: ${taskDescription}\n\n` +
    `Context:\n\n` +
    contextText
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/buildPrompt.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add src/orchestrator/buildPrompt.ts tests/orchestrator/buildPrompt.test.ts
git commit -m "feat: build provider prompts from named context files

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `runWorkflow` uses persisted run context

**Files:**
- Modify: `c:\git\agentrail\src\orchestrator\runWorkflow.ts`
- Modify: `c:\git\agentrail\tests\orchestrator\runWorkflow.test.ts`

- [x] **Step 1: Write the failing tests**

Replace the full contents of `tests/orchestrator/runWorkflow.test.ts`:

```ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/runWorkflow.test.ts`
Expected: FAIL — `runWorkflow`'s current deps type has no `cwd`, its result
has no `runDir`/`runId`, and it doesn't write any files, so essentially every
assertion here fails or the call doesn't type-check.

- [x] **Step 3: Write minimal implementation**

Replace the full contents of `src/orchestrator/runWorkflow.ts`:

```ts
import type { ExecFn, ProviderAdapter } from '../discovery/types.js';
import type { Workflow, ProviderStep, ShellStep } from '../workflow/types.js';
import { isShellStep } from '../workflow/types.js';
import { buildPrompt } from './buildPrompt.js';
import { runShellCommand } from './runShellCommand.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../providers/constants.js';
import {
  createRunContext,
  updateProgress,
  writeStepOutput,
  readContextFiles,
  writeFinalSummary,
} from '../context/runContext.js';

export interface RunWorkflowDeps {
  registry: ProviderAdapter[];
  exec: ExecFn;
  write: (text: string) => void;
  cwd: string;
}

export interface RunWorkflowResult {
  ok: boolean;
  stepsRun: number;
  failedStep?: string;
  runId: string;
  runDir: string;
}

function outputFilename(step: ProviderStep | ShellStep): string {
  return step.output ?? `${step.name}.md`;
}

export async function runWorkflow(
  workflow: Workflow,
  taskDescription: string,
  deps: RunWorkflowDeps
): Promise<RunWorkflowResult> {
  const total = workflow.steps.length;
  const ctx = createRunContext(
    deps.cwd,
    workflow.name,
    taskDescription,
    workflow.steps.map((s) => s.name)
  );

  const fail = (index: number, stepName: string): RunWorkflowResult => {
    updateProgress(ctx, stepName, 'failed');
    writeFinalSummary(
      ctx,
      `Workflow "${workflow.name}" failed at step "${stepName}" (${index + 1}/${total}).\n`
    );
    return { ok: false, stepsRun: index, failedStep: stepName, runId: ctx.runId, runDir: ctx.runDir };
  };

  for (let i = 0; i < total; i++) {
    const step = workflow.steps[i];
    const n = i + 1;
    deps.write(`→ Step ${n}/${total}: ${step.name}\n`);
    updateProgress(ctx, step.name, 'running');

    if (isShellStep(step)) {
      const result = await runShellCommand(step.run, deps.exec, {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });

      if (result.code !== 0) {
        deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
        if (result.stderr) deps.write(result.stderr + '\n');
        return fail(i, step.name);
      }

      if (result.stdout) deps.write(result.stdout + '\n');
      const filename = outputFilename(step);
      writeStepOutput(ctx, filename, result.stdout);
      updateProgress(ctx, step.name, 'success', filename);
      deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
      continue;
    }

    const adapter = deps.registry.find(
      (p) => p.command === step.provider || p.name === step.provider
    );
    if (!adapter) {
      deps.write(
        `✗ Step ${n}/${total} ("${step.name}") failed: provider "${step.provider}" is not registered\n`
      );
      return fail(i, step.name);
    }

    const contextResult = readContextFiles(ctx, step.context ?? []);
    if (!contextResult.ok) {
      deps.write(
        `✗ Step ${n}/${total} ("${step.name}") failed: context file "${contextResult.missing}.md" not found\n`
      );
      return fail(i, step.name);
    }

    const prompt = buildPrompt(workflow.name, taskDescription, step, contextResult.content);
    const result = await adapter.execute(prompt, deps.exec);

    if (result.code !== 0) {
      deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
      if (result.stderr) deps.write(result.stderr + '\n');
      return fail(i, step.name);
    }

    if (result.stdout) deps.write(result.stdout + '\n');
    const filename = outputFilename(step);
    writeStepOutput(ctx, filename, result.stdout);
    updateProgress(ctx, step.name, 'success', filename);
    deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
  }

  const summary =
    `Workflow "${workflow.name}" completed — ${total}/${total} steps succeeded.\n\n` +
    'AgentRail does not commit or push automatically. Please review the changes before committing.\n';
  deps.write(summary);
  writeFinalSummary(ctx, summary);

  return { ok: true, stepsRun: total, runId: ctx.runId, runDir: ctx.runDir };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/runWorkflow.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Commit**

```bash
git add src/orchestrator/runWorkflow.ts tests/orchestrator/runWorkflow.test.ts
git commit -m "feat: persist workflow run state and scope context to declared files

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `agentrail run` wires the run directory through

**Files:**
- Modify: `c:\git\agentrail\src\program.ts`
- Modify: `c:\git\agentrail\tests\program.test.ts`

- [x] **Step 1: Write the failing test**

In `tests/program.test.ts`, modify the existing `'runs a workflow end to end
and reports success'` test (inside `describe('agentrail run', ...)`) by
adding one assertion after the existing one:

```ts
    await program.parseAsync(['node', 'agentrail', 'run', 'feature', 'add dark mode']);

    expect(output.join('')).toContain('Workflow "feature" completed — 1/1 steps succeeded.');
    expect(output.join('')).toMatch(/Run files written to .*\.agentrail[\\/]runs[\\/]/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/program.test.ts`
Expected: FAIL — `runWorkflow` needs a `cwd` in its deps (currently missing
from `program.ts`'s call site, which is a TypeScript compile error under
vitest's esbuild transform... if it doesn't fail to compile, it fails the new
`toMatch` assertion since the line is never printed).

- [x] **Step 3: Update `program.ts`**

Modify the `run` command's `action` handler in `src/program.ts` — replace:

```ts
      const result = await runWorkflow(loaded.workflow, task, {
        registry: deps.registry,
        exec: deps.exec,
        write,
      });

      if (!result.ok) {
        process.exitCode = 1;
      }
```

with:

```ts
      const result = await runWorkflow(loaded.workflow, task, {
        registry: deps.registry,
        exec: deps.exec,
        write,
        cwd: cwd(),
      });

      write(`Run files written to ${result.runDir}\n`);

      if (!result.ok) {
        process.exitCode = 1;
      }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/program.test.ts`
Expected: PASS (all tests in the file)

- [x] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [x] **Step 6: Commit**

```bash
git add src/program.ts tests/program.test.ts
git commit -m "feat: print the run directory path after agentrail run

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Final full-suite verification

**Files:** none (verification only)

- [x] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no skipped/failed tests.

- [x] **Step 2: Run the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [x] **Step 3: Smoke-test the built CLI**

From a throwaway temp directory (adjust paths for your shell; on Windows use
PowerShell equivalents of `mkdir`/`cd`):

```bash
rm -rf /tmp/agentrail-smoke && mkdir -p /tmp/agentrail-smoke && cd /tmp/agentrail-smoke
mkdir -p .agentrail/workflows
cat > .agentrail/workflows/smoke.yaml <<'EOF'
name: smoke
steps:
  - name: echo
    run: echo hello-from-agentrail
EOF
node c:/git/agentrail/dist/cli.js run smoke "smoke test"
cat .agentrail/runs/*/progress.json
cat .agentrail/runs/*/final-summary.md
cd c:/git/agentrail
```

Expected: the CLI prints the step lines, the completion message, and a
`Run files written to ...` line; `progress.json` shows the `echo` step as
`"status": "success"` with `"output": "echo.md"`; `final-summary.md` contains
the completion message.

- [x] **Step 4: Report status**

Confirm to the user that:
- `agentrail run <workflow> "<task>"` now persists every run to
  `.agentrail/runs/<run-id>/`: `task.md`, `progress.json`, one `<output>.md`
  file per step (named by the step's `output:` field or defaulting to
  `<step-name>.md`), and `final-summary.md`.
- A provider step can declare `context: [name, ...]` in its workflow YAML to
  receive only those named prior outputs in its prompt, instead of the entire
  run history — matching the product plan's "each provider receives only the
  context needed for its current task" requirement.
- Referencing a context file that was never produced fails the step
  immediately with a clear error, rather than silently sending a partial
  prompt.
- `agentrail run` prints the run directory path on completion (success or
  failure) so the developer knows where to find the persisted files.
