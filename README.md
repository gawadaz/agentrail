# AgentRail

**Workflow-as-code orchestration for the AI coding subscriptions you already pay for.**

AgentRail lets you define a deterministic development workflow in a YAML file and
run each stage on a *specific*, locally-installed AI coding CLI that you choose.
No automatic model routing, no magic — you decide which provider plans, which one
implements, which one reviews, and where deterministic shell checks run.

> Think "GitHub Actions for local AI coding agents." Your workflow, your
> subscriptions, your rules.

---

## Why

Developers often pay for several AI coding tools — Claude Code, Codex, Copilot,
and others — but spend most of the month on a single preferred one while quota
sits unused elsewhere. AgentRail makes provider allocation explicit and
repeatable, so routine stages (requirements, tests, docs, review) can be
deliberately assigned to secondary subscriptions.

### Principles

- **Local-first** — drives the authenticated CLIs already on your machine.
- **Workflow-as-code** — workflows live in your repo and are committed to Git.
- **Explicit routing** — every AI step names its provider. No silent fallback.
- **Human-owned Git** — AgentRail never commits or pushes. You review and own the
  final Git operation.

---

## Requirements

- Node.js >= 18
- One or more supported provider CLIs installed and authenticated (see below)

### Supported providers

| Provider           | CLI command | Auth check                                            |
| ------------------ | ----------- | ----------------------------------------------------- |
| Claude Code        | `claude`    | `ANTHROPIC_API_KEY` or `~/.claude/.credentials.json`  |
| Codex              | `codex`     | `codex login status`                                  |
| Antigravity CLI    | `agy`       | `agy auth status`                                     |
| GitHub Copilot CLI | `copilot`   | `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`  |

A provider only needs to be installed for the steps that reference it.

---

## Installation

```bash
git clone https://github.com/<org>/agentrail.git
cd agentrail
npm install
npm run build
npm link      # exposes the `agentrail` command globally
```

During development you can also run the CLI directly from source:

```bash
npm run dev -- <command> [args]
```

---

## Quick start

```bash
# 1. From the root of the project you want to work in:
agentrail init

#    Scans for providers, lets you pick which to enable, and scaffolds
#    .agentrail/ with config.yaml and starter workflows.

# 2. See what was created:
agentrail workflows

# 3. Run a workflow against a task:
agentrail run feature "Implement appointment cancellation support"

# 4. Review the changes AgentRail's providers made, then commit yourself:
git diff
git add -A && git commit -m "Implement appointment cancellation"
```

---

## Commands

### `agentrail init`

Scans the machine for supported providers, prompts you to select which ones to
enable, and scaffolds the `.agentrail/` directory:

```text
.agentrail/
├── config.yaml            # enabled providers + detected auth status
├── workflows/             # starter workflows (feature, bugfix, review)
│   ├── feature.yaml
│   ├── bugfix.yaml
│   └── review.yaml
├── tasks/
└── runs/                  # one directory per workflow run
```

| Option    | Description                              |
| --------- | ---------------------------------------- |
| `--force` | Overwrite an existing `config.yaml`.     |

Requires an interactive terminal (it prompts for provider selection).

```text
$ agentrail init
Scanning installed AI coding providers...

✓ Claude Code
  Command: claude
  Installed: yes (2.0.1)
  Authenticated: yes (credentials file found)

✓ Codex
  Command: codex
  Installed: yes (0.9.0)
  Authenticated: yes

✗ GitHub Copilot CLI
  Not detected

? Select providers to enable › claude, codex
Wrote /path/to/repo/.agentrail/config.yaml
```

### `agentrail providers`

Scans for installed and authenticated providers and prints a report. Read-only —
does not write any files. Useful for debugging setup.

```text
$ agentrail providers
Scanning installed AI coding providers...

✓ Claude Code
  Command: claude
  Installed: yes (2.0.1)
  Authenticated: yes (ANTHROPIC_API_KEY set)

✗ Antigravity CLI
  Not detected
```

### `agentrail workflows`

Lists workflows defined in `.agentrail/workflows/` and validates each one.

```text
$ agentrail workflows
✓ bugfix
✓ feature
✗ review
  step 2 ("code-review"): duplicate step name "code-review"
```

### `agentrail run <workflow> "<task>"`

Runs a workflow end to end. For each step, AgentRail:

1. loads and validates the workflow
2. creates a run directory under `.agentrail/runs/<timestamp>/`
3. writes `task.md` and `progress.json`
4. executes each step in order, passing only the declared context files to
   provider steps
5. captures each step's output to a file in the run directory
6. stops before any commit/push and prints a review summary

```text
$ agentrail run feature "Add CSV export to the reports page"
→ Step 1/8: analyze
✓ Step 1/8 ("analyze") completed
→ Step 2/8: plan
✓ Step 2/8 ("plan") completed
...
Workflow "feature" completed — 8/8 steps succeeded.

AgentRail does not commit or push automatically. Please review the changes before committing.
Run files written to /path/to/repo/.agentrail/runs/2026-09-07T142530
```

If a step fails, the run stops, `progress.json` records the failure, and
`final-summary.md` explains which step failed. The process exits with code `1`.

---

## Writing workflows

A workflow is a YAML file in `.agentrail/workflows/<name>.yaml` with a `name` and
an ordered list of `steps`. Each step is either a **provider step** or a **shell
step**.

### Provider step

Runs an AI CLI. Requires `provider` and `task`.

```yaml
- name: plan
  provider: claude          # provider CLI command or display name
  task: create-plan         # task label, passed into the prompt
  output: plan.md           # optional; defaults to <step-name>.md
  context:                  # optional; names of earlier outputs to feed in
    - task
    - requirements
```

- `provider` matches a registered adapter by its `command` (e.g. `claude`,
  `codex`, `agy`, `copilot`) or display name (e.g. `Claude Code`).
- `context` lists earlier step outputs by base name (without `.md`). Those files
  are read from the run directory and included in the prompt. Referencing a file
  that does not exist yet fails the step.
- Each provider is invoked non-interactively with permission prompts bypassed so
  the workflow can run unattended.

### Shell step

Runs a deterministic command — build, lint, type-check, tests. Requires `run`.

```yaml
- name: tests
  run: npm test
  output: test-output.txt   # optional

- name: build
  run: npm run build
```

A non-zero exit code fails the workflow. `context` is not allowed on shell steps.

### Full example

```yaml
name: feature

steps:
  - name: analyze
    provider: codex
    task: analyze-requirements
    output: requirements.md
    context: [task]

  - name: plan
    provider: claude
    task: create-plan
    output: plan.md
    context: [task, requirements]

  - name: implement
    provider: claude
    task: implement
    context: [task, requirements, plan]

  - name: tests
    run: npm test

  - name: code-review
    provider: codex
    task: code-review
    output: review.md
    context: [task, plan]
```

### Validation rules

- `name` is required and must be unique across steps.
- A step has **either** `run` **or** both `provider` and `task` — never both.
- `output` and each `context` entry must be non-empty strings.

Run `agentrail workflows` to check all workflows at once.

---

## Run directory

Each `agentrail run` writes an isolated directory the orchestrator owns:

```text
.agentrail/runs/2026-09-07T142530/
├── task.md              # the task description you passed
├── progress.json        # workflow name, start time, per-step status
├── requirements.md      # step outputs (named by `output` or <step>.md)
├── plan.md
├── review.md
└── final-summary.md     # completion or failure summary
```

Providers never talk to each other directly. The orchestrator passes each step
only the context files its workflow entry declares, which keeps handoffs
deterministic and limits context bloat.

---

## Development

```bash
npm run build     # compile TypeScript to dist/
npm test          # run the vitest suite
npm run dev -- providers   # run the CLI from source
```

---

## Roadmap

Planned, not yet implemented:

- `agentrail status` / `agentrail resume` for inspecting and continuing runs
- Interactive provider-failure handling (retry / switch / pause / abort)
- Reusable task-definition files in `.agentrail/tasks/`
- Provider usage / quota visibility

Out of scope: automatic model routing, cloud execution, dashboards, and
autonomous agent teams. AgentRail stays deliberately small.

---

## License

See [LICENSE](LICENSE).
