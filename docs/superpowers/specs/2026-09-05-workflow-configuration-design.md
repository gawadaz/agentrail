# Workflow Configuration (MVP Feature 2) — Design Spec

Status: Approved
Date: 2026-09-05
Relates to: [[2026-09-04-provider-discovery-design]], [[2026-09-05-interactive-init-design]]

## Goal

Give AgentRail a workflow YAML schema, a parser/validator, a loader that reads
`.agentrail/workflows/<name>.yaml`, an `agentrail workflows` list command, and
starter workflow templates scaffolded by `init`. This is purely the
configuration layer — no step execution (Feature 3), no task-file content
(Feature 5), no cross-checking `provider` against installed/registered
providers (deferred).

## Architecture

```
src/
├── workflow/
│   ├── types.ts          # Workflow, ProviderStep, ShellStep, WorkflowStep
│   ├── parseWorkflow.ts  # validate raw parsed YAML -> Workflow | errors
│   ├── loadWorkflow.ts   # read + YAML-parse + parseWorkflow a named workflow
│   └── listWorkflows.ts  # enumerate + validate all workflows in a project
├── report/
│   └── format.ts         # gains formatWorkflowsReport alongside formatReport
├── config/
│   └── writeConfig.ts    # gains template-copying step
├── program.ts             # gains `workflows` command
templates/
└── workflows/
    ├── feature.yaml
    ├── bugfix.yaml
    └── review.yaml
```

### Types (`src/workflow/types.ts`)

```ts
export interface ProviderStep {
  name: string;
  provider: string;
  task: string;
}

export interface ShellStep {
  name: string;
  run: string;
}

export type WorkflowStep = ProviderStep | ShellStep;

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export function isShellStep(step: WorkflowStep): step is ShellStep;
```

A step is a shell step iff it has a `run` key. A step must have exactly one
of `{provider, task}` or `{run}` — never a mix, never neither.

### `parseWorkflow` (`src/workflow/parseWorkflow.ts`)

```ts
export type ParseWorkflowResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; errors: string[] };

export function parseWorkflow(raw: unknown): ParseWorkflowResult;
```

Validates a value already parsed from YAML (i.e. a plain JS value, not a
string). Collects **all** applicable errors rather than stopping at the
first, so a user fixing a workflow file sees every problem in one pass.

Checks:

- Top level must be a plain object.
- `name`: required, non-empty string.
- `steps`: required, array, non-empty.
- Per step (index used in error messages when `name` is missing/invalid):
  - `name`: required, non-empty string.
  - Duplicate step names across the workflow → error.
  - Exactly one of:
    - shell: `run` is a non-empty string, and `provider`/`task` are absent.
    - provider: `provider` and `task` are both non-empty strings, and `run`
      is absent.
  - Neither present, or both present (`run` alongside `provider`/`task`) →
    error.

Error message format: plain, human-readable strings like
`"step 2 (\"tests\"): must have either \"run\" or both \"provider\" and \"task\", not both"`.
No error codes/schema — this is an internal validator, not a public API.

### `loadWorkflow` (`src/workflow/loadWorkflow.ts`)

```ts
export type LoadWorkflowResult =
  | { ok: true; workflow: Workflow; path: string }
  | { ok: false; path: string; errors: string[] };

export function loadWorkflow(cwd: string, name: string): LoadWorkflowResult;
```

Resolves `<cwd>/.agentrail/workflows/<name>.yaml`. If the file doesn't exist,
returns `errors: ['Workflow "<name>" not found at <path>']`. If `js-yaml`
throws (`YAMLException`), returns `errors: ['<path>: <yaml error message>']`.
Otherwise delegates the parsed value to `parseWorkflow` and passes through
its result. Synchronous (matches `writeConfig`'s sync fs style already in
the codebase).

### `listWorkflows` (`src/workflow/listWorkflows.ts`)

```ts
export interface WorkflowListEntry {
  name: string;       // filename without extension
  path: string;
  valid: boolean;
  errors?: string[];
}

export function listWorkflows(cwd: string): WorkflowListEntry[];
```

Reads `<cwd>/.agentrail/workflows/`, considers `*.yaml`/`*.yml` files,
reuses `loadWorkflow` (by filename-derived name) per entry so listing
doubles as validation. Sorted by filename. If the directory doesn't exist,
returns `[]` (not an error — a project may not have run `init` with
workflows yet).

### `formatWorkflowsReport` (`src/report/format.ts`)

Added alongside the existing `formatReport`. Renders one line per workflow:
`✓ <name>` for valid, `✗ <name>` plus indented error lines for invalid.
Mirrors the existing provider report's visual style. Empty list → a single
line noting no workflows were found.

### `program.ts` — `workflows` command

```ts
program
  .command('workflows')
  .description('List workflows defined in .agentrail/workflows/')
  .action(() => {
    const entries = listWorkflows(cwd());
    write(formatWorkflowsReport(entries));
  });
```

No new `ProgramDeps` members needed — `listWorkflows` takes a `cwd` string
directly (no fs injection point in the codebase's existing style; discovery
uses `ExecFn` injection because it shells out, but plain fs reads like
`writeConfig` are called directly in tests via a temp dir).

### `writeConfig` — template scaffolding

After the existing `mkdirSync` calls, `writeConfig` copies each file from
`templates/workflows/` into `<agentrailDir>/workflows/`, **skipping any
destination file that already exists** — this is unconditional (independent
of the `force` option, which continues to govern only `config.yaml`
overwrite behavior). This keeps re-running `init` safe for a project with
hand-edited workflow files.

Template directory resolution: `path.join(fileURLToPath(import.meta.url), '..', '..', '..', 'templates', 'workflows')`
from `src/config/writeConfig.ts` (two `..` to repo root from `src/config/`,
then into `templates/workflows`). Symmetric under compiled output, since
`tsconfig.json` has `rootDir: src`, `outDir: dist` — `dist/config/writeConfig.js`
sits at the same depth as `src/config/writeConfig.ts`, so the same relative
path reaches the repo-root `templates/` directory in both dev (`tsx`) and
built (`dist/`) execution, whether run from the repo itself or as an
installed npm package (no `files` allowlist in `package.json`, so
`templates/` ships by default).

### Templates (`templates/workflows/*.yaml`)

Three files matching the product plan's example workflows (§21):

- `feature.yaml`: analyze (gemini) → plan (claude) → review-plan (codex) →
  implement (claude) → tests (gemini) → code-review (codex) →
  documentation (gemini) → final-review (claude).
- `bugfix.yaml`: analyze-bug (gemini) → find-root-cause (claude) →
  propose-fix (claude) → implement (claude) → regression-tests (gemini) →
  review (codex).
- `review.yaml`: analyze-diff (codex) → code-review (codex) →
  security-review (claude) → test-coverage-review (gemini) → summary
  (claude).

Each step's `task` value is a kebab-case identifier matching the step's
purpose (task file *content* is Feature 5 — these are just references).

## Testing

- `parseWorkflow`: valid workflow; missing/empty `name`; missing/empty
  `steps`; step missing `name`; duplicate step names; step with neither
  `run` nor `provider`/`task`; step with both; step with `provider` but no
  `task` (and vice versa); multiple simultaneous errors collected together.
- `loadWorkflow`: valid file; missing file; malformed YAML; file that parses
  but fails `parseWorkflow` validation (errors passed through).
- `listWorkflows`: empty/missing directory; mix of valid and invalid files;
  sorted order.
- `formatWorkflowsReport`: empty list; all valid; mix with error detail
  rendering.
- `writeConfig`: existing tests still pass; new case asserts template files
  are copied on a fresh init; new case asserts an existing workflow file in
  the destination is left untouched (content unchanged) even with
  `--force`.
- `program.test.ts`: new case for the `workflows` command's output using a
  temp `.agentrail/workflows/` fixture dir.

All new tests use real temp directories (consistent with `writeConfig.test.ts`'s
existing style) rather than mocking `fs`.

## Non-goals (deferred)

- Executing any step (Feature 3 — Command-Oriented Workflow Execution).
- Task file definitions/content (Feature 5 — Reusable Task Definitions).
- Validating `provider` values against the provider registry or a project's
  `config.yaml` — purely structural validation for now.
- JSON Schema file (`schemas/workflow.schema.json` from the suggested repo
  structure) — the TypeScript validator in `parseWorkflow` is the source of
  truth for MVP; a standalone schema file can be generated later if an
  external tool needs it.
- A `run`-step shell-syntax validator (e.g. checking the command exists) —
  `run` is stored as an opaque string; execution-time concerns belong to
  Feature 6.
