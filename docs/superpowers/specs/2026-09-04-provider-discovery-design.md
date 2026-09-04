# Provider Discovery — Design Spec

Status: Approved
Date: 2026-09-04
Relates to: AgentRail-product-plan.md §8 (MVP Feature 1 — Provider Discovery)

## Goal

Implement `agentrail providers` and `agentrail init`, which scan the developer's
machine for the three MVP-supported AI coding CLIs (Claude Code, Codex, Gemini
CLI), report installed/callable/authenticated status for each, and (for `init`
only) scaffold a starter `.agentrail/config.yaml` from the results.

This is MVP Feature 1 only. Workflow parsing, execution, and context handoff
(Features 2+) are out of scope.

## Tech stack

Node.js + TypeScript. CLI built with `commander`. Shell invocation via Node's
built-in `child_process` (no extra process-exec dependency needed for this
feature). Tests with `vitest`.

## Architecture

```
src/
├── cli.ts                  # commander entrypoint: `providers`, `init` subcommands
├── discovery/
│   ├── scan.ts              # scanAll(adapters, opts) -> ProviderStatus[]
│   ├── exec.ts               # timeout-wrapped process exec helper
│   └── types.ts              # ProviderAdapter, ProviderStatus types
├── providers/
│   ├── registry.ts           # exports the 3 MVP adapters in order
│   ├── claude/adapter.ts
│   ├── codex/adapter.ts
│   └── gemini/adapter.ts
├── report/
│   └── format.ts             # renders ProviderStatus[] as the console report
└── config/
    └── writeConfig.ts        # writes .agentrail/config.yaml (init only)
```

### Types

```ts
type AuthStatus = 'yes' | 'no' | 'unknown';

interface ProviderStatus {
  name: string;            // display name, e.g. "Claude Code"
  command: string;         // e.g. "claude"
  installed: boolean;      // command found on PATH and --version succeeded
  version?: string;        // parsed from --version output, if available
  authenticated: AuthStatus;
  error?: string;          // populated when installed=false, human-readable reason
}

interface ProviderAdapter {
  name: string;
  command: string;
  versionArgs: string[];
  parseVersion?: (stdout: string) => string | undefined;
  checkAuth: (exec: ExecFn) => Promise<AuthStatus>;
}
```

`ExecFn` is an injectable `(cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<{ code: number; stdout: string; stderr: string }>`.
Adapters never call `child_process` directly — they receive an `exec` function,
which makes them unit-testable without real CLIs installed.

### Discovery flow

1. `scanAll` iterates the 3 registered adapters (order: Claude, Codex, Gemini —
   matches product-plan §8 example ordering).
2. For each adapter:
   a. Run `adapter.command adapter.versionArgs` (default timeout 5000ms).
      - Command not found / non-zero relevant exit / timeout → `installed: false`,
        `authenticated: 'unknown'`, skip auth check, record `error`.
      - Success → `installed: true`, parse version if a parser is given.
   b. If installed, call `adapter.checkAuth(exec)` to get `AuthStatus`.
3. Return the array of `ProviderStatus`, order preserved. No adapter failure
   throws — every failure mode resolves to a status object.

### Provider adapter specifics

- **Claude Code** (`claude`)
  - Installed check: `claude --version`.
  - Auth check: no scriptable status subcommand exists today. Heuristic:
    - `authenticated: 'yes'` if `ANTHROPIC_API_KEY` env var is set, OR the
      credentials file exists at `$CLAUDE_CONFIG_DIR/.credentials.json`
      (default `~/.claude/.credentials.json`).
    - Otherwise `'no'`.
    - This is a presence heuristic, not a live credential check (a stale/expired
      token still reports `'yes'`). The report footnotes this explicitly.

- **Codex** (`codex`)
  - Installed check: `codex --version`.
  - Auth check: run `codex login status`. Exit code `0` → `'yes'`; exit code `1`
    → `'no'`; any other exit code, or the subcommand itself being unrecognized
    → `'unknown'`.

- **Gemini CLI** (`gemini`)
  - Installed check: `gemini --version`.
  - Auth check: run `gemini auth status`. Same exit-code convention as Codex:
    `0` → `'yes'`, `1` → `'no'`, anything else/unrecognized → `'unknown'`.

### Report format (`agentrail providers` and the scan portion of `agentrail init`)

Matches product-plan §8 style:

```
Scanning installed AI coding providers...

✓ Claude Code
  Command: claude
  Installed: yes
  Authenticated: yes (heuristic: credentials file found)

✓ Codex
  Command: codex
  Installed: yes
  Authenticated: no

✗ Gemini CLI
  Not detected
```

- `✓`/`✗` prefix keyed off `installed`.
- When `installed: false`, print only "Not detected" (+ short reason if useful),
  no auth line.
- When `authenticated: 'unknown'`, print `Authenticated: unknown`.
- Claude's line gets a trailing `(heuristic: ...)` note explaining which signal
  matched, since it's not a real status check.

### `agentrail init` behavior

1. Run the same scan as `providers` and print the report.
2. If `.agentrail/config.yaml` already exists, do not overwrite it unless
   `--force` is passed; print a message and exit 0 (non-destructive default,
   per the project's human-owned-changes principle).
3. Otherwise, create `.agentrail/` (and `workflows/`, `tasks/`, `runs/`
   subdirectories per product-plan §9 structure — empty for now, later features
   populate them) and write `.agentrail/config.yaml`:

```yaml
providers:
  claude:
    command: claude
    installed: true
    authenticated: yes
  codex:
    command: codex
    installed: true
    authenticated: no
  gemini:
    command: gemini
    installed: false
```

Only fields that are meaningful are included (no `authenticated` key when not
installed). This config is a discovery snapshot for the user to edit — later
features (workflow config) will read/extend it, but this feature only writes
the `providers:` section.

### CLI exit codes

- `agentrail providers`: always exits 0 (it's a read-only report; "no providers
  found" is informational, not an error).
- `agentrail init`: exits 0 on success (including the "config already exists,
  skipped" case). Exits 1 only on unexpected internal errors (e.g. can't write
  to disk).

### Error handling

- Every `exec` call is wrapped with a timeout (default 5000ms, configurable per
  call) so a hanging CLI can't block the whole scan.
- `ENOENT` (command not found) is treated identically to "not installed" — not
  a thrown error.
- Adapter `checkAuth` implementations must never throw; any unexpected error
  inside them is caught by `scanAll` and downgraded to `authenticated: 'unknown'`.

### Testing

- `discovery/scan.ts` and each provider adapter take an injectable `ExecFn`, so
  tests simulate: not-installed (ENOENT), installed+authed, installed+not
  authed, installed+ambiguous auth, and timeout — without needing real `claude`/
  `codex`/`gemini` binaries in CI.
- Follow TDD: write these adapter/scan tests first, then the report formatter
  tests (given a `ProviderStatus[]`, assert exact output string), then wire up
  the CLI.
- One integration-style test runs the actual `agentrail providers` CLI entry
  with fully mocked adapters to confirm end-to-end wiring.

## Non-goals (deferred to later features)

- Workflow YAML parsing/validation (Feature 2).
- `agentrail run`, run context/persistence (Features 3–4).
- Any provider *invocation* for actual task execution — this feature only
  probes CLIs for presence/version/auth, it never sends a real prompt.
