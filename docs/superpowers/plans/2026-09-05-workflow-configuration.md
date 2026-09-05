# Workflow Configuration (MVP Feature 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the workflow YAML schema/validator, a loader/lister for `.agentrail/workflows/*.yaml`, an `agentrail workflows` CLI command, and starter workflow templates scaffolded by `init`.

**Architecture:** A new `src/workflow/` module holds the `Workflow`/`WorkflowStep` types, a pure `parseWorkflow` validator (collects all errors, never throws), a `loadWorkflow` that reads+YAML-parses a named workflow file and delegates to `parseWorkflow`, and a `listWorkflows` that enumerates a project's workflow files and validates each via `loadWorkflow`. `src/report/format.ts` gains `formatWorkflowsReport` (same visual style as the existing `formatReport`). `program.ts` gains a `workflows` command. `src/config/writeConfig.ts` gains a step that copies `templates/workflows/*.yaml` into a project's `.agentrail/workflows/`, skipping files that already exist.

**Tech Stack:** TypeScript, Node.js, `js-yaml` (already a dependency), vitest. No new dependencies.

Spec: `docs/superpowers/specs/2026-09-05-workflow-configuration-design.md`

---

### Task 1: Workflow types

**Files:**
- Create: `c:\git\agentrail\src\workflow\types.ts`
- Test: `c:\git\agentrail\tests\workflow\types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workflow/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isShellStep } from '../../src/workflow/types.js';
import type { WorkflowStep } from '../../src/workflow/types.js';

describe('isShellStep', () => {
  it('returns true for a step with a "run" key', () => {
    const step: WorkflowStep = { name: 'lint', run: 'npm run lint' };
    expect(isShellStep(step)).toBe(true);
  });

  it('returns false for a provider step', () => {
    const step: WorkflowStep = { name: 'plan', provider: 'claude', task: 'create-plan' };
    expect(isShellStep(step)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflow/types.test.ts`
Expected: FAIL — `Cannot find module '../../src/workflow/types.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/workflow/types.ts`:

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

export function isShellStep(step: WorkflowStep): step is ShellStep {
  return 'run' in step;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workflow/types.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/workflow/types.ts tests/workflow/types.test.ts
git commit -m "feat: add workflow and workflow step types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `parseWorkflow` — structural validation

**Files:**
- Create: `c:\git\agentrail\src\workflow\parseWorkflow.ts`
- Test: `c:\git\agentrail\tests\workflow\parseWorkflow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workflow/parseWorkflow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseWorkflow } from '../../src/workflow/parseWorkflow.js';

describe('parseWorkflow', () => {
  it('accepts a valid workflow with provider and shell steps', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [
        { name: 'plan', provider: 'claude', task: 'create-plan' },
        { name: 'test', run: 'npm test' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      workflow: {
        name: 'feature',
        steps: [
          { name: 'plan', provider: 'claude', task: 'create-plan' },
          { name: 'test', run: 'npm test' },
        ],
      },
    });
  });

  it('rejects a non-object top level', () => {
    const result = parseWorkflow('not an object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        'workflow must be a YAML mapping (object) at the top level',
      ]);
    }
  });

  it('rejects a missing/empty name', () => {
    const result = parseWorkflow({ name: '', steps: [{ name: 'a', run: 'x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"name" is required and must be a non-empty string');
    }
  });

  it('rejects missing/empty steps', () => {
    const result = parseWorkflow({ name: 'feature', steps: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"steps" is required and must be a non-empty array');
    }
  });

  it('rejects a step missing a name', () => {
    const result = parseWorkflow({ name: 'feature', steps: [{ run: 'npm test' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('step 1: "name" is required and must be a non-empty string');
    }
  });

  it('rejects duplicate step names', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [
        { name: 'test', run: 'npm test' },
        { name: 'test', run: 'npm run test:e2e' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('step 2 ("test"): duplicate step name "test"');
    }
  });

  it('rejects a step with neither run nor provider/task', () => {
    const result = parseWorkflow({ name: 'feature', steps: [{ name: 'mystery' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("mystery"): must have either "run" or both "provider" and "task"'
      );
    }
  });

  it('rejects a step with both run and provider/task', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'both', run: 'npm test', provider: 'claude', task: 'implement' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("both"): must have either "run" or both "provider" and "task", not both'
      );
    }
  });

  it('rejects a provider step missing task', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', provider: 'claude' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "task" is required and must be a non-empty string'
      );
    }
  });

  it('rejects a provider step missing provider', () => {
    const result = parseWorkflow({
      name: 'feature',
      steps: [{ name: 'plan', task: 'create-plan' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'step 1 ("plan"): "provider" is required and must be a non-empty string'
      );
    }
  });

  it('collects multiple errors from multiple steps in one pass', () => {
    const result = parseWorkflow({
      name: '',
      steps: [{ name: 'a' }, { provider: 'claude', task: 'x' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        '"name" is required and must be a non-empty string',
        'step 1 ("a"): must have either "run" or both "provider" and "task"',
        'step 2: "name" is required and must be a non-empty string',
      ]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflow/parseWorkflow.test.ts`
Expected: FAIL — `Cannot find module '../../src/workflow/parseWorkflow.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/workflow/parseWorkflow.ts`:

```ts
import type { Workflow, WorkflowStep } from './types.js';

export type ParseWorkflowResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; errors: string[] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseWorkflow(raw: unknown): ParseWorkflowResult {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['workflow must be a YAML mapping (object) at the top level'] };
  }

  const errors: string[] = [];

  if (!isNonEmptyString(raw.name)) {
    errors.push('"name" is required and must be a non-empty string');
  }

  const rawSteps = raw.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    errors.push('"steps" is required and must be a non-empty array');
    return { ok: false, errors };
  }

  const steps: WorkflowStep[] = [];
  const seenNames = new Set<string>();

  rawSteps.forEach((rawStep, index) => {
    const label = `step ${index + 1}`;

    if (!isPlainObject(rawStep)) {
      errors.push(`${label}: must be a YAML mapping (object)`);
      return;
    }

    const hasName = isNonEmptyString(rawStep.name);
    const stepLabel = hasName ? `${label} ("${rawStep.name}")` : label;

    if (!hasName) {
      errors.push(`${label}: "name" is required and must be a non-empty string`);
    } else if (seenNames.has(rawStep.name as string)) {
      errors.push(`${stepLabel}: duplicate step name "${rawStep.name}"`);
    } else {
      seenNames.add(rawStep.name as string);
    }

    const hasRun = 'run' in rawStep;
    const hasProvider = 'provider' in rawStep;
    const hasTask = 'task' in rawStep;

    if (hasRun && (hasProvider || hasTask)) {
      errors.push(`${stepLabel}: must have either "run" or both "provider" and "task", not both`);
      return;
    }

    if (hasRun) {
      if (!isNonEmptyString(rawStep.run)) {
        errors.push(`${stepLabel}: "run" must be a non-empty string`);
        return;
      }
      if (hasName) {
        steps.push({ name: rawStep.name as string, run: rawStep.run as string });
      }
      return;
    }

    if (hasProvider || hasTask) {
      const providerOk = isNonEmptyString(rawStep.provider);
      const taskOk = isNonEmptyString(rawStep.task);
      if (!providerOk) {
        errors.push(`${stepLabel}: "provider" is required and must be a non-empty string`);
      }
      if (!taskOk) {
        errors.push(`${stepLabel}: "task" is required and must be a non-empty string`);
      }
      if (hasName && providerOk && taskOk) {
        steps.push({
          name: rawStep.name as string,
          provider: rawStep.provider as string,
          task: rawStep.task as string,
        });
      }
      return;
    }

    errors.push(`${stepLabel}: must have either "run" or both "provider" and "task"`);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, workflow: { name: raw.name as string, steps } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workflow/parseWorkflow.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/workflow/parseWorkflow.ts tests/workflow/parseWorkflow.test.ts
git commit -m "feat: add parseWorkflow structural validator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `loadWorkflow` — read + parse a named workflow file

**Files:**
- Create: `c:\git\agentrail\src\workflow\loadWorkflow.ts`
- Test: `c:\git\agentrail\tests\workflow\loadWorkflow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workflow/loadWorkflow.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow } from '../../src/workflow/loadWorkflow.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-loadworkflow-'));
  dirs.push(dir);
  mkdirSync(join(dir, '.agentrail', 'workflows'), { recursive: true });
  return dir;
}

describe('loadWorkflow', () => {
  it('loads and validates an existing workflow file', () => {
    const dir = makeProjectDir();
    writeFileSync(
      join(dir, '.agentrail', 'workflows', 'feature.yaml'),
      'name: feature\nsteps:\n  - name: plan\n    provider: claude\n    task: create-plan\n'
    );

    const result = loadWorkflow(dir, 'feature');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workflow).toEqual({
        name: 'feature',
        steps: [{ name: 'plan', provider: 'claude', task: 'create-plan' }],
      });
      expect(result.path).toContain('feature.yaml');
    }
  });

  it('returns an error when the workflow file does not exist', () => {
    const dir = makeProjectDir();

    const result = loadWorkflow(dir, 'missing');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('Workflow "missing" not found');
    }
  });

  it('returns an error for malformed YAML', () => {
    const dir = makeProjectDir();
    writeFileSync(
      join(dir, '.agentrail', 'workflows', 'broken.yaml'),
      'name: [unterminated\n'
    );

    const result = loadWorkflow(dir, 'broken');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('broken.yaml');
    }
  });

  it('passes through parseWorkflow validation errors', () => {
    const dir = makeProjectDir();
    writeFileSync(
      join(dir, '.agentrail', 'workflows', 'invalid.yaml'),
      'name: invalid\nsteps: []\n'
    );

    const result = loadWorkflow(dir, 'invalid');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"steps" is required and must be a non-empty array');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflow/loadWorkflow.test.ts`
Expected: FAIL — `Cannot find module '../../src/workflow/loadWorkflow.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/workflow/loadWorkflow.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseWorkflow } from './parseWorkflow.js';
import type { Workflow } from './types.js';

export type LoadWorkflowResult =
  | { ok: true; workflow: Workflow; path: string }
  | { ok: false; path: string; errors: string[] };

export function loadWorkflow(cwd: string, name: string): LoadWorkflowResult {
  const path = join(cwd, '.agentrail', 'workflows', `${name}.yaml`);

  if (!existsSync(path)) {
    return { ok: false, path, errors: [`Workflow "${name}" not found at ${path}`] };
  }

  const content = readFileSync(path, 'utf-8');

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path, errors: [`${path}: ${message}`] };
  }

  const result = parseWorkflow(raw);
  if (!result.ok) {
    return { ok: false, path, errors: result.errors };
  }

  return { ok: true, workflow: result.workflow, path };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workflow/loadWorkflow.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/workflow/loadWorkflow.ts tests/workflow/loadWorkflow.test.ts
git commit -m "feat: add loadWorkflow to read and validate a named workflow file

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `listWorkflows` — enumerate and validate all workflows

**Files:**
- Create: `c:\git\agentrail\src\workflow\listWorkflows.ts`
- Test: `c:\git\agentrail\tests\workflow\listWorkflows.test.ts`

Only `.yaml` files are considered (matching every example and template in the
product plan) — this keeps `listWorkflows` a trivial wrapper over
`loadWorkflow`, which already assumes a `.yaml` extension when building its
path; supporting `.yml` too would require `loadWorkflow` to search for either
extension, which isn't needed by any current template or test fixture.

- [ ] **Step 1: Write the failing test**

Create `tests/workflow/listWorkflows.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listWorkflows } from '../../src/workflow/listWorkflows.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-listworkflows-'));
  dirs.push(dir);
  return dir;
}

describe('listWorkflows', () => {
  it('returns an empty array when the workflows directory does not exist', () => {
    const dir = makeTmpDir();
    expect(listWorkflows(dir)).toEqual([]);
  });

  it('lists valid and invalid workflows, sorted by name', () => {
    const dir = makeTmpDir();
    const workflowsDir = join(dir, '.agentrail', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(
      join(workflowsDir, 'feature.yaml'),
      'name: feature\nsteps:\n  - name: plan\n    provider: claude\n    task: create-plan\n'
    );
    writeFileSync(join(workflowsDir, 'broken.yaml'), 'name: broken\nsteps: []\n');
    writeFileSync(join(workflowsDir, 'notes.txt'), 'ignore me');

    const entries = listWorkflows(dir);

    expect(entries).toEqual([
      {
        name: 'broken',
        path: join(workflowsDir, 'broken.yaml'),
        valid: false,
        errors: ['"steps" is required and must be a non-empty array'],
      },
      { name: 'feature', path: join(workflowsDir, 'feature.yaml'), valid: true },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflow/listWorkflows.test.ts`
Expected: FAIL — `Cannot find module '../../src/workflow/listWorkflows.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/workflow/listWorkflows.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkflow } from './loadWorkflow.js';

export interface WorkflowListEntry {
  name: string;
  path: string;
  valid: boolean;
  errors?: string[];
}

export function listWorkflows(cwd: string): WorkflowListEntry[] {
  const dir = join(cwd, '.agentrail', 'workflows');

  if (!existsSync(dir)) {
    return [];
  }

  const names = readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => file.slice(0, -'.yaml'.length))
    .sort();

  return names.map((name) => {
    const result = loadWorkflow(cwd, name);
    if (result.ok) {
      return { name, path: result.path, valid: true };
    }
    return { name, path: result.path, valid: false, errors: result.errors };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workflow/listWorkflows.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/workflow/listWorkflows.ts tests/workflow/listWorkflows.test.ts
git commit -m "feat: add listWorkflows to enumerate and validate project workflows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `formatWorkflowsReport`

**Files:**
- Modify: `c:\git\agentrail\src\report\format.ts`
- Modify: `c:\git\agentrail\tests\report\format.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/report/format.test.ts` (add the import alongside the existing
one, and a new `describe` block):

```ts
import { formatReport, formatWorkflowsReport } from '../../src/report/format.js';
import type { WorkflowListEntry } from '../../src/workflow/listWorkflows.js';
```

```ts
describe('formatWorkflowsReport', () => {
  it('reports when no workflows are found', () => {
    expect(formatWorkflowsReport([])).toBe('No workflows found in .agentrail/workflows/\n');
  });

  it('renders a valid workflow with a checkmark', () => {
    const entries: WorkflowListEntry[] = [
      { name: 'feature', path: '/proj/.agentrail/workflows/feature.yaml', valid: true },
    ];

    expect(formatWorkflowsReport(entries)).toBe('✓ feature\n');
  });

  it('renders an invalid workflow with its errors indented', () => {
    const entries: WorkflowListEntry[] = [
      {
        name: 'broken',
        path: '/proj/.agentrail/workflows/broken.yaml',
        valid: false,
        errors: ['"steps" is required and must be a non-empty array'],
      },
    ];

    const output = formatWorkflowsReport(entries);
    expect(output).toContain('✗ broken');
    expect(output).toContain('  "steps" is required and must be a non-empty array');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/report/format.test.ts`
Expected: FAIL — `formatWorkflowsReport is not exported`

- [ ] **Step 3: Write minimal implementation**

Modify `src/report/format.ts` — add the import and the new function at the
end of the file:

```ts
import type { WorkflowListEntry } from '../workflow/listWorkflows.js';
```

```ts
export function formatWorkflowsReport(entries: WorkflowListEntry[]): string {
  if (entries.length === 0) {
    return 'No workflows found in .agentrail/workflows/\n';
  }

  const lines: string[] = [];

  for (const entry of entries) {
    if (entry.valid) {
      lines.push(`✓ ${entry.name}`);
      continue;
    }
    lines.push(`✗ ${entry.name}`);
    for (const error of entry.errors ?? []) {
      lines.push(`  ${error}`);
    }
  }

  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/report/format.test.ts`
Expected: PASS (6 tests total: 3 existing `formatReport` + 3 new `formatWorkflowsReport`)

- [ ] **Step 5: Commit**

```bash
git add src/report/format.ts tests/report/format.test.ts
git commit -m "feat: add formatWorkflowsReport

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Starter workflow templates + `writeConfig` scaffolding

**Files:**
- Create: `c:\git\agentrail\templates\workflows\feature.yaml`
- Create: `c:\git\agentrail\templates\workflows\bugfix.yaml`
- Create: `c:\git\agentrail\templates\workflows\review.yaml`
- Modify: `c:\git\agentrail\src\config\writeConfig.ts`
- Modify: `c:\git\agentrail\tests\config\writeConfig.test.ts`

- [ ] **Step 1: Create the template files**

Create `templates/workflows/feature.yaml`:

```yaml
name: feature

steps:
  - name: analyze
    provider: gemini
    task: analyze-requirements

  - name: plan
    provider: claude
    task: create-plan

  - name: review-plan
    provider: codex
    task: review-plan

  - name: implement
    provider: claude
    task: implement

  - name: tests
    provider: gemini
    task: write-tests

  - name: code-review
    provider: codex
    task: code-review

  - name: documentation
    provider: gemini
    task: update-documentation

  - name: final-review
    provider: claude
    task: final-review
```

Create `templates/workflows/bugfix.yaml`:

```yaml
name: bugfix

steps:
  - name: analyze-bug
    provider: gemini
    task: analyze-bug

  - name: find-root-cause
    provider: claude
    task: find-root-cause

  - name: propose-fix
    provider: claude
    task: propose-fix

  - name: implement
    provider: claude
    task: implement

  - name: regression-tests
    provider: gemini
    task: write-regression-tests

  - name: review
    provider: codex
    task: code-review
```

Create `templates/workflows/review.yaml`:

```yaml
name: review

steps:
  - name: analyze-diff
    provider: codex
    task: analyze-diff

  - name: code-review
    provider: codex
    task: code-review

  - name: security-review
    provider: claude
    task: security-review

  - name: test-coverage-review
    provider: gemini
    task: test-coverage-review

  - name: summary
    provider: claude
    task: summary
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/config/writeConfig.test.ts`:

```ts
describe('writeConfig template scaffolding', () => {
  it('copies starter workflow templates into .agentrail/workflows on a fresh init', () => {
    const dir = makeTmpDir();

    writeConfig(dir, statuses);

    const workflowsDir = join(dir, '.agentrail', 'workflows');
    expect(existsSync(join(workflowsDir, 'feature.yaml'))).toBe(true);
    expect(existsSync(join(workflowsDir, 'bugfix.yaml'))).toBe(true);
    expect(existsSync(join(workflowsDir, 'review.yaml'))).toBe(true);

    const feature = yaml.load(
      readFileSync(join(workflowsDir, 'feature.yaml'), 'utf-8')
    ) as { name: string };
    expect(feature.name).toBe('feature');
  });

  it('does not overwrite an existing workflow file, even with force', () => {
    const dir = makeTmpDir();
    writeConfig(dir, statuses);

    const featurePath = join(dir, '.agentrail', 'workflows', 'feature.yaml');
    writeFileSync(featurePath, 'name: my-custom-feature\nsteps: []\n');

    writeConfig(dir, statuses, { force: true });

    expect(readFileSync(featurePath, 'utf-8')).toBe('name: my-custom-feature\nsteps: []\n');
  });
});
```

Add `writeFileSync` to the existing `node:fs` import in the test file:

```ts
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/config/writeConfig.test.ts`
Expected: FAIL — `feature.yaml` etc. don't exist (scaffolding not implemented yet)

- [ ] **Step 4: Implement scaffolding in `writeConfig.ts`**

Replace the full contents of `src/config/writeConfig.ts`:

```ts
import { mkdirSync, existsSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { ProviderStatus } from '../discovery/types.js';

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates',
  'workflows'
);

export interface WriteConfigResult {
  wrote: boolean;
  path: string;
  reason?: string;
}

function scaffoldWorkflowTemplates(workflowsDir: string): void {
  if (!existsSync(TEMPLATES_DIR)) {
    return;
  }
  for (const file of readdirSync(TEMPLATES_DIR)) {
    const dest = join(workflowsDir, file);
    if (existsSync(dest)) {
      continue;
    }
    copyFileSync(join(TEMPLATES_DIR, file), dest);
  }
}

export function writeConfig(
  cwd: string,
  statuses: ProviderStatus[],
  opts: { force?: boolean } = {}
): WriteConfigResult {
  const agentrailDir = join(cwd, '.agentrail');
  const configPath = join(agentrailDir, 'config.yaml');

  if (existsSync(configPath) && !opts.force) {
    return {
      wrote: false,
      path: configPath,
      reason: 'config.yaml already exists (use --force to overwrite)',
    };
  }

  const workflowsDir = join(agentrailDir, 'workflows');
  mkdirSync(workflowsDir, { recursive: true });
  mkdirSync(join(agentrailDir, 'tasks'), { recursive: true });
  mkdirSync(join(agentrailDir, 'runs'), { recursive: true });

  scaffoldWorkflowTemplates(workflowsDir);

  const providers: Record<string, Record<string, unknown>> = {};
  for (const status of statuses) {
    if (!status.installed) {
      providers[status.command] = { command: status.command, installed: false };
      continue;
    }
    providers[status.command] = {
      command: status.command,
      installed: true,
      authenticated: status.authenticated,
    };
  }

  writeFileSync(configPath, yaml.dump({ providers }), 'utf-8');

  return { wrote: true, path: configPath };
}
```

`TEMPLATES_DIR` resolves two directories up from `src/config/writeConfig.ts`
(or `dist/config/writeConfig.js` after build — same depth under
`rootDir: src` / `outDir: dist`) to the repo-root `templates/workflows/`
directory, which ships with the package (no `files` allowlist in
`package.json` restricts it).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/config/writeConfig.test.ts`
Expected: PASS (5 tests: 3 existing + 2 new)

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [ ] **Step 7: Commit**

```bash
git add templates/workflows/feature.yaml templates/workflows/bugfix.yaml templates/workflows/review.yaml src/config/writeConfig.ts tests/config/writeConfig.test.ts
git commit -m "feat: scaffold starter workflow templates on init

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `agentrail workflows` CLI command

**Files:**
- Modify: `c:\git\agentrail\src\program.ts`
- Modify: `c:\git\agentrail\tests\program.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/program.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
```

(Add `mkdirSync` and `writeFileSync` to the existing `node:fs` import instead
of a second import statement:)

```ts
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
```

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/program.test.ts`
Expected: FAIL — `unknown command 'workflows'`

- [ ] **Step 3: Add the command to `program.ts`**

Add these imports at the top of `src/program.ts`, alongside the existing ones:

```ts
import { listWorkflows } from './workflow/listWorkflows.js';
import { formatWorkflowsReport } from './report/format.js';
```

Add the new command inside `createProgram`, after the `providers` command and
before the `init` command:

```ts
  program
    .command('workflows')
    .description('List workflows defined in .agentrail/workflows/')
    .action(() => {
      const entries = listWorkflows(cwd());
      write(formatWorkflowsReport(entries));
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/program.test.ts`
Expected: PASS (8 tests total: 1 providers + 4 init + 2 workflows... plus any
pre-existing count — confirm all pass, none failing)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [ ] **Step 6: Commit**

```bash
git add src/program.ts tests/program.test.ts
git commit -m "feat: add agentrail workflows command

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no skipped/failed tests.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Smoke-test the built CLI**

Run (from a throwaway temp directory, e.g. `cd $(mktemp -d)`):

```bash
node c:/git/agentrail/dist/cli.js workflows
```

Expected: `No workflows found in .agentrail/workflows/`

- [ ] **Step 4: Report status**

Confirm to the user that:
- `.agentrail/workflows/<name>.yaml` files are now parsed and structurally
  validated (provider steps need `provider`+`task`; shell steps need `run`;
  never both/neither; step names must be unique).
- `agentrail workflows` lists every workflow in the project with a ✓/✗ and
  validation errors for invalid ones.
- `agentrail init` now scaffolds `feature`/`bugfix`/`review` starter
  workflows into a fresh project, without ever overwriting a workflow file
  the user has already edited.
