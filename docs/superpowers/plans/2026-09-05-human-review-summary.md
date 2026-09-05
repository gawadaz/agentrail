# Human Review Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a successful workflow run, replace the generic completion message with a richer summary that reports files changed (via `git status --porcelain`) and a `PASS` line per workflow step, matching MVP Feature 7 (Human Review).

**Architecture:** A new pure-formatting module `src/report/humanReview.ts` exposes `getFilesChangedCount` (runs `git status --porcelain` through the existing `ExecFn` abstraction, returns `null` on any failure) and `formatHumanReviewSummary` (builds the final text from workflow name, step names, and the files-changed count). `runWorkflow.ts`'s success path calls both and uses the result instead of its current inline summary string.

**Tech Stack:** TypeScript, vitest, existing `ExecFn`/`ProviderAdapter` abstractions in `src/discovery/types.ts`.

---

### Task 1: `getFilesChangedCount` in a new `src/report/humanReview.ts`

**Files:**
- Create: `src/report/humanReview.ts`
- Test: `tests/report/humanReview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/report/humanReview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getFilesChangedCount } from '../../src/report/humanReview.js';
import type { ExecFn } from '../../src/discovery/types.js';

describe('getFilesChangedCount', () => {
  it('counts non-empty lines from git status --porcelain', async () => {
    const exec: ExecFn = async (cmd, args) => {
      expect(cmd).toBe('git');
      expect(args).toEqual(['status', '--porcelain']);
      return { code: 0, stdout: ' M src/a.ts\n?? src/b.ts\n', stderr: '' };
    };

    await expect(getFilesChangedCount(exec)).resolves.toBe(2);
  });

  it('returns 0 when the working tree is clean', async () => {
    const exec: ExecFn = async () => ({ code: 0, stdout: '', stderr: '' });

    await expect(getFilesChangedCount(exec)).resolves.toBe(0);
  });

  it('returns null when git exits non-zero (e.g. not a git repo)', async () => {
    const exec: ExecFn = async () => ({
      code: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
    });

    await expect(getFilesChangedCount(exec)).resolves.toBeNull();
  });

  it('returns null when exec rejects', async () => {
    const exec: ExecFn = async () => {
      throw new Error('spawn failed');
    };

    await expect(getFilesChangedCount(exec)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/report/humanReview.test.ts`
Expected: FAIL — `src/report/humanReview.ts` does not exist (module not found).

- [ ] **Step 3: Implement `getFilesChangedCount`**

Create `src/report/humanReview.ts`:

```ts
import type { ExecFn } from '../discovery/types.js';

export async function getFilesChangedCount(exec: ExecFn): Promise<number | null> {
  try {
    const result = await exec('git', ['status', '--porcelain']);
    if (result.code !== 0) return null;
    const lines = result.stdout.split('\n').filter((line) => line.trim().length > 0);
    return lines.length;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/report/humanReview.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/report/humanReview.ts tests/report/humanReview.test.ts
git commit -m "feat: add getFilesChangedCount for human review summary"
```

---

### Task 2: `formatHumanReviewSummary`

**Files:**
- Modify: `src/report/humanReview.ts`
- Modify: `tests/report/humanReview.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/report/humanReview.test.ts` (add the import and a new `describe` block):

```ts
import { formatHumanReviewSummary } from '../../src/report/humanReview.js';
```

```ts
describe('formatHumanReviewSummary', () => {
  it('includes files changed and a PASS line per step, in order', () => {
    const output = formatHumanReviewSummary('feature', ['analyze', 'plan', 'implement'], 3);

    expect(output).toContain('Workflow "feature" completed — 3/3 steps succeeded.');
    expect(output).toContain('Files changed: 3');
    const lines = output.split('\n');
    const analyzeIdx = lines.indexOf('analyze: PASS');
    const planIdx = lines.indexOf('plan: PASS');
    const implementIdx = lines.indexOf('implement: PASS');
    expect(analyzeIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(analyzeIdx);
    expect(implementIdx).toBeGreaterThan(planIdx);
    expect(output).toContain('Please review the changes before committing.');
    expect(output).toContain('AgentRail will not commit or push automatically.');
  });

  it('omits the files-changed line when the count is null', () => {
    const output = formatHumanReviewSummary('feature', ['test'], null);

    expect(output).not.toContain('Files changed:');
    expect(output).toContain('test: PASS');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/report/humanReview.test.ts`
Expected: FAIL — `formatHumanReviewSummary` is not exported.

- [ ] **Step 3: Implement `formatHumanReviewSummary`**

Append to `src/report/humanReview.ts`:

```ts
export function formatHumanReviewSummary(
  workflowName: string,
  stepNames: string[],
  filesChanged: number | null
): string {
  const total = stepNames.length;
  const lines: string[] = [
    `Workflow "${workflowName}" completed — ${total}/${total} steps succeeded.`,
    '',
  ];

  if (filesChanged !== null) {
    lines.push(`Files changed: ${filesChanged}`, '');
  }

  for (const name of stepNames) {
    lines.push(`${name}: PASS`);
  }

  lines.push(
    '',
    'Please review the changes before committing.',
    '',
    'AgentRail will not commit or push automatically.'
  );

  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/report/humanReview.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/report/humanReview.ts tests/report/humanReview.test.ts
git commit -m "feat: add formatHumanReviewSummary for human review summary"
```

---

### Task 3: Wire the summary into `runWorkflow`'s success path

**Files:**
- Modify: `src/orchestrator/runWorkflow.ts`
- Modify: `tests/orchestrator/runWorkflow.test.ts`

- [ ] **Step 1: Update the existing test's fake `exec` to handle the new `git status` call, and assert the new summary shape**

The current test in `tests/orchestrator/runWorkflow.test.ts` ("runs provider and shell steps in order...") uses a `fakeExec` that returns `{ code: 0, stdout: 'test output', stderr: '' }` for *every* call, including the upcoming `git status --porcelain` call — that would make the git call look like 1 changed file (one non-empty stdout line) with no way to distinguish it, and it also currently asserts on positional `calls[1]`, `calls.length` behavior implicitly via `calls[0]`/`calls[1]`. Update `fakeExec` to branch on `cmd`:

Replace:

```ts
    const fakeExec: ExecFn = async (cmd, args) => {
      calls.push(`exec:${cmd} ${args.join(' ')}`);
      return { code: 0, stdout: 'test output', stderr: '' };
    };
```

with:

```ts
    const fakeExec: ExecFn = async (cmd, args) => {
      calls.push(`exec:${cmd} ${args.join(' ')}`);
      if (cmd === 'git') {
        return { code: 0, stdout: ' M src/a.ts\n M src/b.ts\n', stderr: '' };
      }
      return { code: 0, stdout: 'test output', stderr: '' };
    };
```

Then update the final assertions. Replace:

```ts
    expect(output).toContain('Workflow "feature" completed — 2/2 steps succeeded.');

    expect(readFileSync(join(result.runDir, 'task.md'), 'utf-8')).toBe('add dark mode');
    expect(readFileSync(join(result.runDir, 'plan.md'), 'utf-8')).toBe('plan output');
    expect(readFileSync(join(result.runDir, 'test.md'), 'utf-8')).toBe('test output');
    expect(readFileSync(join(result.runDir, 'final-summary.md'), 'utf-8')).toContain(
      'Workflow "feature" completed — 2/2 steps succeeded.'
    );
```

with:

```ts
    expect(output).toContain('Workflow "feature" completed — 2/2 steps succeeded.');
    expect(output).toContain('Files changed: 2');
    expect(output).toContain('plan: PASS');
    expect(output).toContain('test: PASS');

    expect(readFileSync(join(result.runDir, 'task.md'), 'utf-8')).toBe('add dark mode');
    expect(readFileSync(join(result.runDir, 'plan.md'), 'utf-8')).toBe('plan output');
    expect(readFileSync(join(result.runDir, 'test.md'), 'utf-8')).toBe('test output');
    const finalSummary = readFileSync(join(result.runDir, 'final-summary.md'), 'utf-8');
    expect(finalSummary).toContain('Workflow "feature" completed — 2/2 steps succeeded.');
    expect(finalSummary).toContain('Files changed: 2');
    expect(finalSummary).toContain('plan: PASS');
    expect(finalSummary).toContain('test: PASS');
```

Also add a new test to the same file confirming the files-changed line is omitted when `git` fails:

```ts
  it('omits the files-changed line in the final summary when git status fails', async () => {
    const dir = makeTmpDir();
    const claude = makeFakeAdapter('claude', async () => ({
      code: 0,
      stdout: 'plan output',
      stderr: '',
    }));
    const fakeExec: ExecFn = async () => ({ code: 128, stdout: '', stderr: 'not a git repo' });

    const workflow: Workflow = {
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
    };

    const written: string[] = [];
    const result = await runWorkflow(workflow, 'add dark mode', {
      registry: [claude],
      exec: fakeExec,
      write: (text) => written.push(text),
      cwd: dir,
    });

    expect(result.ok).toBe(true);
    const output = written.join('');
    expect(output).not.toContain('Files changed:');
    expect(output).toContain('plan: PASS');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orchestrator/runWorkflow.test.ts`
Expected: FAIL — output does not yet contain `Files changed:` / `plan: PASS` (current code still uses the old inline summary).

- [ ] **Step 3: Implement the change in `runWorkflow.ts`**

In `src/orchestrator/runWorkflow.ts`, add the import:

```ts
import { getFilesChangedCount, formatHumanReviewSummary } from '../report/humanReview.js';
```

Replace the final block:

```ts
  const summary =
    `Workflow "${workflow.name}" completed — ${total}/${total} steps succeeded.\n\n` +
    'AgentRail does not commit or push automatically. Please review the changes before committing.\n';
  deps.write(summary);
  writeFinalSummary(ctx, summary);

  return { ok: true, stepsRun: total, runId: ctx.runId, runDir: ctx.runDir };
```

with:

```ts
  const filesChanged = await getFilesChangedCount(deps.exec);
  const summary = formatHumanReviewSummary(
    workflow.name,
    workflow.steps.map((s) => s.name),
    filesChanged
  );
  deps.write(summary);
  writeFinalSummary(ctx, summary);

  return { ok: true, stepsRun: total, runId: ctx.runId, runDir: ctx.runDir };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/orchestrator/runWorkflow.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in other test files.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/runWorkflow.ts tests/orchestrator/runWorkflow.test.ts
git commit -m "feat: use human review summary in runWorkflow success path"
```

---

## Post-plan verification

- [ ] Run `npm test` once more from repo root and confirm all suites pass.
- [ ] Run `npm run build` (`tsc`) and confirm no type errors.
