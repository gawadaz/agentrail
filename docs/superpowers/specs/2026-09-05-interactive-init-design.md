# Interactive Provider Selection for `init` — Design Spec

Status: Approved
Date: 2026-09-05
Relates to: [[2026-09-04-provider-discovery-design]] (extends `agentrail init`)

## Goal

Turn `agentrail init` into an interactive command: after scanning, prompt the
user to choose which registered providers they actually want AgentRail to use
in this project, and write only those to `.agentrail/config.yaml`. Today
`init` writes every scanned provider (detected or not) unconditionally.

## Tech stack

No change to the existing stack. Adds one new dependency: `@inquirer/prompts`
(ESM-native, provides a `checkbox` prompt matching this exact interaction).

## Architecture

```
src/
├── program.ts                    # `init` action gains prompt + TTY-check steps
├── prompt/
│   └── selectProviders.ts        # new: checkbox prompt over ProviderStatus[]
├── discovery/…                   # unchanged
├── config/writeConfig.ts         # unchanged (already just writes what it's given)
```

### `selectProviders`

```ts
export type CheckboxPrompt = (choices: {
  name: string;
  value: string;
  checked: boolean;
}[]) => Promise<string[]>;

export function buildChoices(statuses: ProviderStatus[]): Choice[];
// name: "<display name> (detected)" or "<display name> (not detected)"
// value: status.command
// checked: false, always (per approved design)

export async function selectProviders(
  statuses: ProviderStatus[],
  prompt: CheckboxPrompt
): Promise<ProviderStatus[]>;
// Calls prompt(buildChoices(statuses)), returns the subset of `statuses`
// whose `command` is in the returned value list, preserving original order.
```

`buildChoices` is a pure function, independently unit-testable. `selectProviders`
takes the actual `@inquirer/prompts` `checkbox` function as an injected
parameter in production wiring (`cli.ts`), so tests never touch real stdin.

### `program.ts` changes

`ProgramDeps` gains two optional members, defaulted in production wiring
(`cli.ts`) and overridable in tests:

```ts
interface ProgramDeps {
  // ...existing fields...
  isInteractive?: () => boolean;             // default: () => Boolean(process.stdout.isTTY && process.stdin.isTTY)
  promptSelect?: (statuses: ProviderStatus[]) => Promise<ProviderStatus[]>;
  // default wraps selectProviders() with @inquirer/prompts' checkbox
}
```

`init` action becomes:

1. Run `scanAll`, print the report (unchanged).
2. If `.agentrail/config.yaml` exists and `--force` not passed → skip message,
   exit 0 (unchanged existing behavior, checked before prompting so we don't
   bother the user with a prompt whose result would be discarded).
3. If `!deps.isInteractive()` → write an error to stderr ("agentrail init
   requires an interactive terminal to select providers; re-run in a TTY.")
   and exit 1. No config is written.
4. Otherwise call `deps.promptSelect(statuses)` to get the selected subset
   (may be empty — that's valid, produces a `providers: {}` config).
5. Pass the selected subset (not the full `statuses`) to `writeConfig`.

`writeConfig` itself is unchanged — it already just serializes whatever
`ProviderStatus[]` it's handed.

### CLI exit codes (update)

- `agentrail init` in a non-interactive terminal: exits 1, no config written.
  (Previously: `init` never failed except on internal errors — this is a new,
  intentional failure mode per the approved design.)
- All other existing exit-code behavior is unchanged.

### Error handling

- Non-TTY detection happens before any prompt is attempted — no risk of
  inquirer hanging on a closed stdin.
- Empty selection is not an error; it produces a valid, mostly-empty config
  the user can hand-edit later.

### Testing

- `buildChoices`: unit tests over various `ProviderStatus[]` inputs (all
  detected, none detected, mixed) asserting label text, `checked: false`, and
  value mapping.
- `selectProviders`: unit test with a fake `CheckboxPrompt` verifying it
  filters/orders `statuses` correctly from a returned value list, including
  the empty-selection case.
- `program.test.ts` (extends existing suite): three new cases for `init` —
  (a) interactive + non-empty selection → only selected providers reach
  `writeConfig`/output file; (b) non-interactive → stderr message, exit 1, no
  file written; (c) interactive + empty selection → `providers: {}` written,
  exit 0. All via injected `isInteractive`/`promptSelect` fakes, no real
  stdin/inquirer invoked in tests.

## Non-goals (deferred)

- Non-interactive/CI selection flags (`--providers`, `--all`) — explicitly
  deferred per the approved design; today's answer is "requires a TTY,"
  scriptable flags are a future feature if needed.
- Any change to `writeConfig`'s YAML shape beyond which providers appear in
  the map — no new `enabled` field, no schema version bump.
