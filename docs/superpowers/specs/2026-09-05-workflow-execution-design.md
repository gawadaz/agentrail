# Workflow Execution (MVP Feature 3) — Design

## Goal

Implement `agentrail run <workflow> "<task>"`: load a named workflow (already
supported by `loadWorkflow`), execute its steps in order against real
provider CLIs and real shell commands, hand each step's captured output
forward as context for the next step, abort cleanly on the first failure, and
print a plain completion message when all steps succeed.

This is the MVP's third feature, built after Feature 1 (provider discovery)
and Feature 2 (workflow configuration), both already implemented. It is
scoped deliberately narrowly: the following MVP features described in
`AgentRail-product-plan.md` are explicitly **out of scope** for this design
and will be brainstormed/implemented one at a time afterward:

- **Feature 4 — Shared Workflow Context**: the persistent
  `.agentrail/runs/<run-id>/` directory (`task.md`, `requirements.md`,
  `plan.md`, `progress.json`, etc.). This design keeps step output in memory
  only, for the lifetime of the `run` process.
- **Feature 5 — Reusable Task Definitions**: `.agentrail/tasks/*.md` files.
  This design synthesizes prompts directly from the step's `task` name, the
  workflow name, and the user's task description.
- **Feature 7 — Human Review**: the full "Files changed / Tests / Lint /
  Build / AI review findings" summary. This design prints only a minimal
  completion message.
- **Feature 8 — Provider Failure Handling**: the interactive
  Retry/Select-another/Pause/Abort menu. This design aborts immediately on
  any step failure.

## Non-goals

- Streaming provider output live to the terminal (output is captured and
  printed after each step completes, not streamed token-by-token).
- Configurable per-step timeouts (a single hardcoded default is used for
  every provider and shell step).
- Retrying, resuming, or persisting a run.
- Validating that a step's declared `provider` is actually installed or
  authenticated before running (that's `agentrail providers`' job); `run`
  simply looks the provider up in the registry by name and fails the step if
  it isn't found.

## Provider adapter changes

`ProviderAdapter` (`src/discovery/types.ts`) gains one new method, mirroring
the existing `checkAuth(exec)` shape:

```ts
export interface ProviderAdapter {
  // ...existing fields...
  execute: (prompt: string, exec: ExecFn) => Promise<ExecResult>;
}
```

Each adapter implements `execute` by shelling out to its CLI with a
non-interactive prompt flag plus a hardcoded auto-approve/bypass-permissions
flag, so steps can actually edit files and run commands unattended. Per
product decision, agentrail bypasses each CLI's approval prompts by default
for every step — the human review gate is the final workflow step, not a
per-tool-call confirmation:

| Provider    | Command                                                                 |
|-------------|--------------------------------------------------------------------------|
| Claude      | `claude -p "<prompt>" --dangerously-skip-permissions`                    |
| Codex       | `codex exec "<prompt>" --dangerously-bypass-approvals-and-sandbox`       |
| Copilot     | `copilot -p "<prompt>" --allow-all`                                      |
| Antigravity | `agy -p "<prompt>" --dangerously-skip-permissions`                       |

All four use a new shared constant, `PROVIDER_EXECUTE_TIMEOUT_MS = 30 * 60 * 1000`
(30 minutes), passed as `exec`'s `timeoutMs` option — the existing 5-second
discovery-check default is far too short for a real coding task.

## Orchestrator (`src/orchestrator/`)

### `buildPrompt.ts`

Pure function:

```ts
export function buildPrompt(
  workflowName: string,
  taskDescription: string,
  step: ProviderStep,
  priorContext: string
): string
```

Produces a framed prompt along these lines (exact wording finalized during
implementation, covered by tests):

```text
You are running the "<step.task>" step of the "<workflowName>" workflow.

Overall task: <taskDescription>

Prior step output:
<priorContext, or "(none — this is the first step)">
```

### `runShellCommand.ts`

```ts
export async function runShellCommand(
  command: string,
  exec: ExecFn,
  opts?: { timeoutMs?: number }
): Promise<ExecResult>
```

Runs `command` through the platform shell: `sh -c <command>` on POSIX,
`cmd /c <command>` on Windows (detected via `process.platform`, injectable
for tests). Reuses the existing `ExecFn` contract, so it works with both the
real `exec` (`src/discovery/exec.ts`) and fakes in tests.

### `runWorkflow.ts`

```ts
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
): Promise<RunWorkflowResult>
```

Behavior:

1. Initialize `context = ''`.
2. For each step, in order:
   - Print a header line, e.g. `→ Step N/M: <step.name>`.
   - **Shell step** (`isShellStep(step)`): run `runShellCommand(step.run, exec, { timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS })`.
   - **Provider step**: look up `deps.registry.find(p => p.command === step.provider || p.name === step.provider)`.
     - Not found → treat as a failed step with a clear "provider '<x>' is not registered" message; abort.
     - Found → `buildPrompt(...)` then `adapter.execute(prompt, deps.exec)`.
   - Print the step's stdout (and stderr if non-empty) via `deps.write`.
   - If `result.code !== 0`: print `✗ Step N/M ("<name>") failed (exit <code>)` plus captured stderr, return `{ ok: false, stepsRun: N-1, failedStep: step.name }` immediately — no further steps run.
   - Else: append the step's stdout to `context` (e.g. `context += \`\n\n--- ${step.name} ---\n${result.stdout}\``), print `✓ Step N/M ("<name>") completed`, continue.
3. If every step succeeds, print:
   ```
   Workflow "<name>" completed — <M>/<M> steps succeeded.

   AgentRail does not commit or push automatically. Please review the changes before committing.
   ```
   Return `{ ok: true, stepsRun: M }`.

`runWorkflow` never throws for a step failure — failures are represented in
the return value and already printed via `write`, matching the codebase's
existing pattern of collecting results rather than throwing (see
`parseWorkflow`'s error-collection style).

## CLI (`src/program.ts`)

New command:

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

## Testing plan

- **Adapter tests** (extend existing `tests/providers/*.test.ts`): each
  adapter's `execute()` calls the injected `exec` with the exact
  cmd/args/timeout documented above, and returns whatever `exec` resolves.
- **`buildPrompt.test.ts`**: pure input/output table tests, including the
  "first step, no prior context" case.
- **`runShellCommand.test.ts`**: asserts `sh -c`/`cmd /c` dispatch by
  platform (inject `process.platform` or an equivalent seam), and that
  `ExecResult` passes through unchanged.
- **`runWorkflow.test.ts`**: drives a small in-memory workflow (mix of
  provider and shell steps) against fake adapters/exec:
  - happy path: all steps run in order, `context` accumulates, final result
    is `{ ok: true, stepsRun: N }`.
  - a step failing stops the loop before later steps run.
  - an unregistered provider name fails that step immediately.
- **`program.test.ts`**: a `run` command test using fakes, covering both the
  invalid-workflow-name path and a successful run path.

## Open questions

None — all scope boundaries were confirmed during brainstorming.
