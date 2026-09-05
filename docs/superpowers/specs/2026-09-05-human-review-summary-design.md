# MVP Feature 7 — Human Review Summary — Design

## Problem

The product plan's MVP Feature 7 ("Human Review") calls for the final workflow step
to always return control to the developer with a summary like:

```text
Workflow completed.

Files changed: 8
Tests: PASS
Lint: PASS
Build: PASS

AI review:
2 minor findings
0 blockers

Please review the changes before committing.

AgentRail will not commit or push automatically.
```

Currently `runWorkflow` (`src/orchestrator/runWorkflow.ts`) only prints a generic
completion line on success:

```text
Workflow "<name>" completed — <n>/<n> steps succeeded.

AgentRail does not commit or push automatically. Please review the changes before committing.
```

It never reports files changed or per-step status, and never auto-commits (that part
already holds).

## Scope

Deliver a scoped-down version of the mockup, agreed with the user:

- **Files changed**: count via `git status --porcelain` run at the end of a
  successful workflow (not a pre/post-run diff snapshot).
- **Gates**: report every workflow step by name, not just steps matching
  test/lint/build naming conventions.
- **No AI-findings parsing**: do not attempt to parse free-text AI review output
  for a findings/blockers count — too fragile for MVP. The existing behavior of
  writing full step output to `.agentrail/runs/<id>/<step>.md` already gives the
  developer the AI review content to read.
- Applies to the **success path only**. The failure path (`fail()` in
  `runWorkflow.ts`) is unchanged — it already reports the failed step and is
  covered by MVP Feature 8 (Provider Failure Handling), not this feature.

## Design

### `src/report/humanReview.ts` (new module)

```ts
export async function getFilesChangedCount(exec: ExecFn): Promise<number | null>
```
- Runs `git status --porcelain` via the injected `ExecFn` (inherits the process's
  cwd, consistent with how shell steps and provider adapters already execute).
- On exit code `0`: returns the count of non-empty output lines.
- On any failure (non-zero exit, spawn error, timeout): returns `null`. Callers
  treat `null` as "omit this line" rather than as an error — a non-git working
  directory must not fail an otherwise-successful workflow run.

```ts
export function formatHumanReviewSummary(
  workflowName: string,
  stepNames: string[],
  filesChanged: number | null
): string
```
- Builds the final summary text:
  1. `Workflow "<name>" completed — <n>/<n> steps succeeded.`
  2. `Files changed: <n>` — included only when `filesChanged !== null`.
  3. One line per step: `<stepName>: PASS`, in workflow order.
  4. Blank line, then the existing reminder:
     `Please review the changes before committing.` /
     `AgentRail will not commit or push automatically.`
- Pure function, no I/O — fully unit-testable.

### `src/orchestrator/runWorkflow.ts`

On the success path only (after the `for` loop completes with no early return):
- Call `getFilesChangedCount(deps.exec)`.
- Build the summary via `formatHumanReviewSummary(workflow.name, workflow.steps.map(s => s.name), filesChanged)`.
- Replace the current inline summary string with this result; keep writing it via
  `deps.write(summary)` and `writeFinalSummary(ctx, summary)` exactly as today.

Rationale for listing every step as `PASS` unconditionally: the loop returns
immediately (via `fail()`) on the first failing step, so by construction, if
execution reaches the success branch, every step in `workflow.steps` has already
been recorded as `success`. No additional status tracking is required.

## Testing

- `getFilesChangedCount`: unit tests with a mocked `ExecFn` — zero changes, N
  changes, and a failing/non-git-repo case returning `null`.
- `formatHumanReviewSummary`: unit tests for the with-files-changed and
  omitted-files-changed cases, and multi-step ordering.
- `runWorkflow`: update/extend existing success-path test(s) to assert the new
  summary shape is written to `deps.write` and `final-summary.md`.

## Out of scope (explicitly not building)

- Parsing AI review output for a findings/blockers count.
- Distinguishing PASS/FAIL per step in the summary (failure path is handled
  elsewhere and never reaches this code path).
- A pre-run git snapshot to compute "changed during this run" vs. "currently
  dirty" files.
