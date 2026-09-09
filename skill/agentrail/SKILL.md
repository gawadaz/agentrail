---
name: agentrail
description: >-
  Use when the user wants to run a multi-step development workflow across several
  AI coding CLIs (Claude, Codex, and others) with an explicit provider chosen for
  each step — planning on one model, implementation on another, review on a third.
  Also triggers on "set up an agentrail workflow", "run my feature workflow",
  "run the bugfix workflow", and wanting to spread work across AI subscriptions to
  avoid burning one provider's quota.
---

# AgentRail

AgentRail runs a deterministic, developer-owned workflow where every AI step is
assigned to a specific local coding CLI. It manages shared context between steps,
runs deterministic shell quality-gates, handles provider failures explicitly (no
silent fallback), and always stops before commit/push so the developer owns Git.

## Locating the CLI

AgentRail ships as a single bundled file. Run it with `node <cli>` where `<cli>`
is the first of these that exists (check with a shell test):

1. `./.claude/skills/agentrail/cli.js` — installed into the current repo
2. `~/.claude/skills/agentrail/cli.js` — installed globally

If neither exists, tell the user to reinstall:
`curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh`
(add `-s -- --global` for a global install).

In the commands below, `AGENTRAIL` stands for `node <cli>`.

## First-time setup in a project

1. Check whether `.agentrail/` exists in the project root.
2. If it does not, the project needs initialising. Run `AGENTRAIL init`.
   - `init` is interactive — it prompts the user to select which detected
     providers to enable. If the current shell is not an interactive terminal,
     do NOT try to run it. Instead tell the user to run
     `node <cli> init` themselves in a terminal, then continue once
     `.agentrail/config.yaml` exists.
3. `init` scaffolds `.agentrail/config.yaml` and starter workflows
   (`feature`, `bugfix`, `review`) under `.agentrail/workflows/`.

## Running a workflow

1. `AGENTRAIL providers` — show which provider CLIs are installed and
   authenticated. If a provider a workflow needs is missing, surface that first.
2. `AGENTRAIL workflows` — list and validate the workflows in
   `.agentrail/workflows/`.
3. `AGENTRAIL run <workflow> "<task description>"` — execute the workflow.
   Stream the output to the user as it runs.

## On completion

- The CLI prints the run directory, e.g.
  `Run files written to .agentrail/runs/<timestamp>`.
- Read `<run-dir>/final-summary.md` and summarise it for the user.
- Point the user at the changed files and the run directory. Suggest they review
  with `git diff` before committing.

## On step failure

The CLI stops at the first failing step and exits non-zero. When that happens:

- Show the user the failing step name and the stderr the CLI printed.
- Ask how they want to proceed (fix the issue and re-run, edit the workflow,
  skip, or abort).
- NEVER silently retry or switch the step to a different provider. Explicit user
  control over provider assignment is a core principle.

## Hard rule: never commit or push

AgentRail stops before Git on purpose. Do not run `git commit` or `git push` as
part of executing a workflow. The developer reviews the result and owns the
final Git operation.

## Workflow YAML reference

Workflows live at `.agentrail/workflows/<name>.yaml`: a `name` plus an ordered
list of `steps`. Each step is one of:

- **Provider step** — `provider` (CLI command or display name) and `task` (a
  label passed into the prompt). Optional `output` (defaults to `<step-name>.md`)
  and `context` (list of earlier step outputs, by base name without `.md`, fed
  into the prompt).
- **Shell step** — `run` (a shell command; non-zero exit fails the workflow).
  Optional `output`. No `context`.

A step has either `run`, or both `provider` and `task` — never both. See
`templates/workflows/` next to this file for complete examples.
