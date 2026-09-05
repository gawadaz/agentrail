# Shared Workflow Context (MVP Feature 4) — Design

## Problem

`runWorkflow` currently accumulates all step output into a single in-memory
string and hands the whole thing to every subsequent provider step as "prior
context." Nothing is written to disk. This has two problems the product plan
calls out directly:

1. There's no persisted run history — a crashed or interrupted run leaves
   nothing behind to inspect or resume from.
2. Every step receives the *entire* accumulated history, not just what it
   actually needs, which causes context bloat and makes handoffs
   nondeterministic as workflows grow.

## Goal

Give the AgentRail orchestrator ownership of workflow state via a persisted
run directory (`.agentrail/runs/<run-id>/`), and let each workflow step
declare exactly which named context files it needs, per the product plan's
example:

```text
Gemini writes requirements.md
        ↓
Claude receives: task.md, requirements.md
        ↓
Claude writes plan.md
```

## Data model changes

### `src/workflow/types.ts`

`ProviderStep` gains two optional fields:

- `output?: string` — the filename (with extension, e.g. `"requirements.md"`)
  this step's stdout is written to in the run directory. Defaults to
  `` `${step.name}.md` `` when omitted.
- `context?: string[]` — base names (without extension, e.g. `"requirements"`)
  of prior steps' output files this step needs read into its prompt. Each
  name resolves to `<name>.md` in the run directory. Defaults to `[]` when
  omitted, meaning the step receives only the overall task description with
  no prior file context.

`ShellStep` gains one optional field:

- `output?: string` — same meaning as above, defaults to `` `${step.name}.md` ``.
  Shell steps have no `context` field — they don't build a prompt, so there is
  nothing to inject prior files into.

### `src/workflow/parseWorkflow.ts`

Validate, when present:

- `output`: must be a non-empty string.
- `context`: must be an array where every element is a non-empty string.

Both remain optional; omitting them preserves current default behavior
(output to `<step-name>.md`, no injected context).

## New module: `src/context/runContext.ts`

Owns all run-directory I/O. Uses real `node:fs` calls directly (matching the
existing style of `writeConfig.ts` / `loadWorkflow.ts` — no fs abstraction
layer), and is tested against real temp directories the same way
`writeConfig.test.ts` and `loadWorkflow.test.ts` are.

```ts
export interface RunContext {
  runId: string;
  runDir: string; // absolute path to .agentrail/runs/<run-id>/
}

export interface ProgressStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  output?: string;
}

export function createRunContext(
  cwd: string,
  workflowName: string,
  task: string,
  stepNames: string[],
  now?: () => Date
): RunContext;

export function updateProgress(ctx: RunContext, stepName: string, status: ProgressStep['status']): void;

export function writeStepOutput(ctx: RunContext, filename: string, content: string): void;

export type ReadContextResult =
  | { ok: true; content: Map<string, string> }
  | { ok: false; missing: string };

export function readContextFiles(ctx: RunContext, names: string[]): ReadContextResult;

export function writeFinalSummary(ctx: RunContext, text: string): void;
```

Behavior:

- `createRunContext` generates a run id from the current time as
  `YYYY-MM-DDTHHmmss` (colons are invalid in Windows paths, so time is
  rendered without them), creates `.agentrail/runs/<run-id>/`, writes
  `task.md` (just the raw task string), and writes an initial
  `progress.json`:

  ```json
  {
    "workflow": "feature",
    "task": "add dark mode",
    "startedAt": "2026-09-05T14:30:22.000Z",
    "steps": [
      { "name": "analyze", "status": "pending" },
      { "name": "plan", "status": "pending" }
    ]
  }
  ```

  The `now` parameter is injectable for deterministic tests; defaults to
  `() => new Date()`.

- `updateProgress` reads `progress.json`, updates the named step's `status`
  (and sets `output` to the filename once known), and rewrites the file.
- `writeStepOutput` writes `<runDir>/<filename>` (creating parent dirs isn't
  needed since `filename` is always a flat basename — workflow authors don't
  control path traversal here, `output` is validated as a non-empty string
  but not sanitized against `/`; see Security note below).
- `readContextFiles` resolves each name to `<runDir>/<name>.md`; returns the
  first missing file as `{ ok: false, missing: name }` (name without
  extension, matching what the workflow author wrote in `context:`) so the
  caller can produce a clear error, or `{ ok: true, content }` with a
  `Map<string, string>` keyed by the `<name>.md` filename → file content.
- `writeFinalSummary` writes `<runDir>/final-summary.md`.

**Security note:** `output` and `context` values come from the workflow YAML
file, which lives in the developer's own repo (same trust level as the
workflow's `run:` shell commands, which already execute arbitrary shell). No
new sanitization is introduced beyond what `parseWorkflow` already does
(non-empty string checks) — this matches the trust boundary of the rest of
the tool.

## `src/orchestrator/buildPrompt.ts` change

Replace the `priorContext: string` parameter with `context: Map<string, string>`:

```ts
export function buildPrompt(
  workflowName: string,
  taskDescription: string,
  step: ProviderStep,
  context: Map<string, string>
): string
```

Rendering: if `context.size === 0`, keep the existing
`(none — this is the first step)` placeholder. Otherwise render each entry as
a `--- <filename> ---` block, joined in insertion order (the order the step
declared them in `context: [...]`):

```text
You are running the "create-plan" step of the "feature" workflow.

Overall task: add dark mode

Context:

--- requirements.md ---
1. Support system dark mode
2. ...
```

## `src/orchestrator/runWorkflow.ts` change

`runWorkflow` gains a `cwd` in its deps (to build the run context) and no
longer accumulates an in-memory context string. New flow per step:

1. `updateProgress(ctx, step.name, 'running')`
2. **Shell step:** run via `runShellCommand`; on success, `writeStepOutput`
   with the step's resolved output filename and stdout;
   `updateProgress(ctx, step.name, 'success')`. On failure,
   `updateProgress(ctx, step.name, 'failed')`, write `final-summary.md`, and
   return the existing failure result shape.
3. **Provider step:** resolve the adapter (existing "not registered" check
   unchanged); call `readContextFiles(ctx, step.context ?? [])` — if it
   returns `{ ok: false, missing }`, write a failure line
   (`Step N/Total ("name") failed: context file "<missing>.md" not found`),
   `updateProgress(ctx, step.name, 'failed')`, write `final-summary.md`,
   return failure. Otherwise `buildPrompt(..., content)`, execute, on success
   `writeStepOutput` + `updateProgress('success')`, on failure
   `updateProgress('failed')` + write `final-summary.md` + return failure.
4. After all steps succeed: write the existing completion message to both
   stdout (`deps.write`, unchanged) and `final-summary.md`
   (`writeFinalSummary`).

`RunWorkflowResult` gains `runId: string` and `runDir: string` so the CLI can
tell the developer where the run's files live.

## `src/program.ts` change

The `run` command passes `cwd()` into `runWorkflow`'s deps, and after
completion (success or failure) prints the run directory path, e.g.:

```text
Run files written to .agentrail/runs/2026-09-05T143022/
```

## Out of scope (future features, not this one)

- `agentrail status` / `agentrail resume` commands that actually *read*
  `progress.json` to resume a run — this feature only makes the data exist.
- Any validation that a step's `context` names refer to *earlier* steps in
  the workflow (ordering is not statically checked; a forward reference just
  fails at runtime with the existing missing-file error, which is sufficient
  for MVP).
- Updating `templates/workflows/*.yaml` to use the new `output`/`context`
  fields — the templates still reference the now-removed `gemini` provider
  (a pre-existing issue unrelated to this feature) and are left untouched.

## Testing plan

- `tests/context/runContext.test.ts`: tmpdir-based, covers
  `createRunContext` (directory + task.md + initial progress.json shape),
  `updateProgress` (status transitions persisted correctly), `writeStepOutput`,
  `readContextFiles` (found + missing cases), `writeFinalSummary`.
- `tests/orchestrator/buildPrompt.test.ts`: update existing tests for the
  `Map` signature; add a multi-file context-rendering case.
- `tests/orchestrator/runWorkflow.test.ts`: update existing tests (now need a
  `cwd` in deps, real tmpdir); add cases for context-file injection and for
  the missing-context-file failure path.
- `tests/program.test.ts`: update the existing "runs a workflow end to end"
  test to assert the run-directory line is printed.
