# Interactive Init Provider Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `agentrail init` prompt the user (checkbox list, all unchecked, `@inquirer/prompts`) to choose which registered providers to enable, and write only the chosen ones to `.agentrail/config.yaml`. Require a real TTY; error out otherwise.

**Architecture:** A new pure `buildChoices` function turns `ProviderStatus[]` into inquirer checkbox choices; `selectProviders` wraps it with an injected prompt function and returns the filtered `ProviderStatus[]`. `program.ts`'s `init` action gains injectable `isInteractive`/`promptSelect` deps (mirroring the existing `exec`/`cwd`/`stdout` injection pattern), calls them between the scan and `writeConfig`, and errors (exit 1, no file written) when not interactive. `cli.ts` wires the real TTY check and real `@inquirer/prompts` checkbox in production; tests always inject fakes.

**Tech Stack:** TypeScript, Node.js, commander, `@inquirer/prompts` (new), vitest.

---

### Task 1: Add `@inquirer/prompts` dependency

**Files:**
- Modify: `c:\git\agentrail\package.json`

- [ ] **Step 1: Add the dependency**

Edit the `"dependencies"` block in `package.json` to include `@inquirer/prompts`:

```json
  "dependencies": {
    "@inquirer/prompts": "^8.7.1",
    "commander": "^12.1.0",
    "js-yaml": "^4.1.0"
  },
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: lockfile updates, `node_modules/@inquirer/prompts` exists, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @inquirer/prompts dependency

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `buildChoices` — pure choice-list builder

**Files:**
- Create: `c:\git\agentrail\src\prompt\selectProviders.ts`
- Test: `c:\git\agentrail\tests\prompt\selectProviders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/prompt/selectProviders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildChoices } from '../../src/prompt/selectProviders.js';
import type { ProviderStatus } from '../../src/discovery/types.js';

const statuses: ProviderStatus[] = [
  { name: 'Claude Code', command: 'claude', installed: true, authenticated: 'yes' },
  { name: 'Gemini CLI', command: 'gemini', installed: false, authenticated: 'unknown' },
];

describe('buildChoices', () => {
  it('labels detected providers and marks every choice unchecked', () => {
    const choices = buildChoices(statuses);

    expect(choices).toEqual([
      { name: 'Claude Code (detected)', value: 'claude', checked: false },
      { name: 'Gemini CLI (not detected)', value: 'gemini', checked: false },
    ]);
  });

  it('returns an empty list for an empty input', () => {
    expect(buildChoices([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt/selectProviders.test.ts`
Expected: FAIL — `Cannot find module '../../src/prompt/selectProviders.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/prompt/selectProviders.ts`:

```ts
import type { ProviderStatus } from '../discovery/types.js';

export interface ProviderChoice {
  name: string;
  value: string;
  checked: boolean;
}

export function buildChoices(statuses: ProviderStatus[]): ProviderChoice[] {
  return statuses.map((status) => ({
    name: `${status.name} (${status.installed ? 'detected' : 'not detected'})`,
    value: status.command,
    checked: false,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompt/selectProviders.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/prompt/selectProviders.ts tests/prompt/selectProviders.test.ts
git commit -m "feat: add buildChoices for provider checkbox prompt

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `selectProviders` — filter statuses by prompt result

**Files:**
- Modify: `c:\git\agentrail\src\prompt\selectProviders.ts`
- Test: `c:\git\agentrail\tests\prompt\selectProviders.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/prompt/selectProviders.test.ts`:

```ts
import { selectProviders } from '../../src/prompt/selectProviders.js';

describe('selectProviders', () => {
  it('returns only the statuses whose command was selected, preserving order', async () => {
    const fakePrompt = async () => ['gemini', 'claude'];

    const result = await selectProviders(statuses, fakePrompt);

    expect(result).toEqual([statuses[0], statuses[1]]);
  });

  it('returns an empty array when nothing is selected', async () => {
    const fakePrompt = async () => [];

    const result = await selectProviders(statuses, fakePrompt);

    expect(result).toEqual([]);
  });

  it('passes buildChoices output to the prompt function', async () => {
    let received: unknown;
    const fakePrompt = async (choices: unknown) => {
      received = choices;
      return [];
    };

    await selectProviders(statuses, fakePrompt);

    expect(received).toEqual(buildChoices(statuses));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt/selectProviders.test.ts`
Expected: FAIL — `selectProviders is not exported` / `is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `src/prompt/selectProviders.ts`:

```ts
export type CheckboxPrompt = (choices: ProviderChoice[]) => Promise<string[]>;

export async function selectProviders(
  statuses: ProviderStatus[],
  prompt: CheckboxPrompt
): Promise<ProviderStatus[]> {
  const selectedCommands = await prompt(buildChoices(statuses));
  const selectedSet = new Set(selectedCommands);
  return statuses.filter((status) => selectedSet.has(status.command));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompt/selectProviders.test.ts`
Expected: PASS (5 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/prompt/selectProviders.ts tests/prompt/selectProviders.test.ts
git commit -m "feat: add selectProviders to filter statuses by user selection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire interactive selection into `init` (program.ts)

**Files:**
- Modify: `c:\git\agentrail\src\program.ts`
- Modify: `c:\git\agentrail\tests\program.test.ts`

This task changes `init`'s behavior, so the two existing `agentrail init` tests in
`tests/program.test.ts` must be updated in the same step as the new tests —
they will otherwise fail once `isInteractive` defaults to a real TTY check
(false under vitest) and `init` starts requiring it.

- [ ] **Step 1: Replace the `agentrail init` describe block with updated + new tests**

In `tests/program.test.ts`, replace the entire `describe('agentrail init', ...)` block
(lines 45-81) with:

```ts
describe('agentrail init', () => {
  it('writes .agentrail/config.yaml with only the selected providers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      isInteractive: () => true,
      promptSelect: async (statuses) => statuses,
    });

    await program.parseAsync(['node', 'agentrail', 'init']);

    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(true);
    expect(output.join('')).toContain('Wrote');
  });

  it('writes an empty providers map when nothing is selected', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      isInteractive: () => true,
      promptSelect: async () => [],
    });

    await program.parseAsync(['node', 'agentrail', 'init']);

    const content = readFileSync(join(dir, '.agentrail', 'config.yaml'), 'utf-8');
    expect(yaml.load(content)).toEqual({ providers: {} });
  });

  it('skips writing when config.yaml already exists and --force is not passed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const makeProgram = () =>
      createProgram({
        exec: fakeExec,
        registry: fakeRegistry,
        cwd: () => dir,
        stdout: (t) => output.push(t),
        isInteractive: () => true,
        promptSelect: async (statuses) => statuses,
      });

    await makeProgram().parseAsync(['node', 'agentrail', 'init']);
    output.length = 0;
    await makeProgram().parseAsync(['node', 'agentrail', 'init']);

    expect(output.join('')).toContain('Skipped');
  });

  it('errors without writing when not run in an interactive terminal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
      stderr: (t) => errors.push(t),
      isInteractive: () => false,
      promptSelect: async (statuses) => statuses,
    });

    await expect(
      program.exitOverride().parseAsync(['node', 'agentrail', 'init'])
    ).rejects.toThrow();

    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(false);
    expect(errors.join('')).toContain('interactive terminal');
  });
});
```

Add `readFileSync` to the existing `node:fs` import and add a `yaml` import at
the top of the file:

```ts
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
```
```ts
import yaml from 'js-yaml';
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npx vitest run tests/program.test.ts`
Expected: FAIL — `createProgram` doesn't accept `isInteractive`/`promptSelect`/`stderr`
yet (TS type error or the init command still writes unconditionally / doesn't
error on `isInteractive: () => false`).

- [ ] **Step 3: Update `program.ts`**

Replace the full contents of `src/program.ts`:

```ts
import { Command } from 'commander';
import { scanAll } from './discovery/scan.js';
import { formatReport } from './report/format.js';
import { writeConfig } from './config/writeConfig.js';
import type { ExecFn, ProviderAdapter, ProviderStatus } from './discovery/types.js';

export interface ProgramDeps {
  exec: ExecFn;
  registry: ProviderAdapter[];
  cwd?: () => string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  isInteractive?: () => boolean;
  promptSelect?: (statuses: ProviderStatus[]) => Promise<ProviderStatus[]>;
}

export function createProgram(deps: ProgramDeps): Command {
  const cwd = deps.cwd ?? (() => process.cwd());
  const write = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const writeErr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const isInteractive =
    deps.isInteractive ??
    (() => Boolean(process.stdout.isTTY && process.stdin.isTTY));
  const promptSelect =
    deps.promptSelect ??
    (() => {
      throw new Error('promptSelect must be provided to run agentrail init');
    });

  const program = new Command();
  program
    .name('agentrail')
    .description('Workflow-as-code orchestration for local AI coding CLIs');

  program
    .command('providers')
    .description('Scan for installed and authenticated AI coding providers')
    .action(async () => {
      const statuses = await scanAll(deps.registry, deps.exec);
      write(formatReport(statuses));
    });

  program
    .command('init')
    .description('Scan for providers and scaffold .agentrail/config.yaml')
    .option('--force', 'overwrite an existing .agentrail/config.yaml')
    .action(async (opts: { force?: boolean }) => {
      const statuses = await scanAll(deps.registry, deps.exec);
      write(formatReport(statuses));

      if (!isInteractive()) {
        writeErr(
          'agentrail init requires an interactive terminal to select providers; re-run in a TTY.\n'
        );
        program.error('init requires an interactive terminal');
        return;
      }

      const selected: ProviderStatus[] = await promptSelect(statuses);

      const result = writeConfig(cwd(), selected, { force: opts.force });
      if (result.wrote) {
        write(`Wrote ${result.path}\n`);
      } else {
        write(`Skipped: ${result.reason}\n`);
      }
    });

  return program;
}
```

`writeConfig` already contains the "exists and not forced" check and returns
`{ wrote: false, reason: '...already exists...' }` in that case, so `init`
doesn't need to duplicate that logic — it only needs to gate the *prompt* on
interactivity; `writeConfig` still decides whether the write itself happens.

`program.error(...)` throws a `CommanderError`, which by default calls
`process.exit(1)`. Tests use `program.exitOverride()` so the error is thrown
as a rejected promise instead of killing the test process, matching the test
written in Step 1.

The thrown-default for `promptSelect` is intentional: `program.ts` stays
decoupled from `@inquirer/prompts` (that import lives only in `cli.ts`, per
the design spec), and any caller that reaches the prompt step without
supplying one has a wiring bug that should fail loudly rather than silently
no-op.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/program.test.ts`
Expected: PASS (5 tests: providers report, init-writes-selected,
init-empty-selection, init-skip-existing, init-non-interactive-errors)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, all existing suites (`writeConfig`, `program`, discovery/report
tests) still green.

- [ ] **Step 6: Commit**

```bash
git add src/program.ts tests/program.test.ts
git commit -m "feat: prompt for provider selection in agentrail init

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the real checkbox prompt into `cli.ts`

**Files:**
- Modify: `c:\git\agentrail\src\cli.ts`

- [ ] **Step 1: Update `cli.ts`**

Replace the full contents of `src/cli.ts`:

```ts
#!/usr/bin/env node
import { checkbox } from '@inquirer/prompts';
import { createProgram } from './program.js';
import { realExec } from './discovery/exec.js';
import { providerRegistry } from './providers/registry.js';
import { selectProviders } from './prompt/selectProviders.js';
import type { ProviderStatus } from './discovery/types.js';

createProgram({
  exec: realExec,
  registry: providerRegistry,
  promptSelect: (statuses: ProviderStatus[]) =>
    selectProviders(statuses, (choices) =>
      checkbox({ message: 'Select providers to enable', choices })
    ),
}).parseAsync(process.argv);
```

- [ ] **Step 2: Build and smoke-check**

Run: `npm run build`
Expected: compiles with no TypeScript errors.

Run: `node dist/cli.js init` in a real terminal (not through this tool, since
this tool's shell is non-interactive — ask the user to try it, or verify only
that `node dist/cli.js init < /dev/null` in this tool exits 1 with the
"requires an interactive terminal" message, confirming the TTY guard works
end-to-end).

Run: `node dist/cli.js init` via the Bash tool with stdin redirected from
`/dev/null` (this tool's shell is not a TTY, so this should hit the new
error path):

Run: `node dist/cli.js init < /dev/null`
Expected: prints the scan report, then `agentrail init requires an
interactive terminal to select providers; re-run in a TTY.` to stderr, exits
with a non-zero code, and does not create `.agentrail/`.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: wire real checkbox prompt into cli entrypoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no skipped/failed tests.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Report status**

Confirm to the user that `agentrail init` now requires a TTY and prompts for
provider selection, that CI/non-interactive usage now fails fast with a clear
message, and that `config.yaml` only contains providers the user selected.
