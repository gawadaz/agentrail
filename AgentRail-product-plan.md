# AgentRail Product Plan

## 1. Product Vision

**AgentRail** is an open-source, local-first skill that lets developers orchestrate the AI coding subscriptions they already pay for.

The core problem is simple:

> Developers often subscribe to multiple AI coding tools such as Claude Code, Codex, Gemini CLI, and GitHub Copilot, but typically overuse one preferred provider while leaving quota unused on the others.

AgentRail lets the developer explicitly decide which AI provider handles each stage of a development workflow.

Instead of relying on automatic AI routing, AgentRail follows a deterministic, developer-owned workflow.

Example:

```text
Requirements analysis  → Gemini
Planning               → Claude
Plan review            → Codex
Implementation         → Claude
Unit tests             → Gemini
Code review            → Codex
Documentation          → Gemini
Final review           → Claude
Human review           → Commit / Push
```

The developer controls the allocation.

---

## 2. Positioning

### Core positioning

> **Workflow-as-code for your AI coding subscriptions.**

Alternative positioning:

> **GitHub Actions for local AI coding agents.**

### Core promise

Use the AI subscriptions you already pay for without wasting quota on one preferred provider.

### Key principles

1. **Local-first**  
   Use the authenticated AI CLIs already installed on the developer's machine.

2. **Workflow-as-code**  
   Workflows are configuration files stored inside the repository and committed to Git.

3. **Explicit routing**  
   Developers decide exactly which provider executes each AI task.

4. **Provider-neutral tasks**  
   Reusable workflow tasks should work across Claude, Codex, Gemini, and future providers whenever possible.

5. **Human-owned Git**  
   AgentRail does not commit or push code automatically. The developer reviews the result and owns the final Git operation.

6. **No silent fallback**  
   If a provider fails or reaches its quota, agentrail asks the user what to do rather than silently moving the task to another model.

---

## 3. Product Differentiation

The market already contains several multi-agent orchestration tools.

Closest competitors include:

- Orchestrator
- AGTX
- Hydra
- Stringbean
- c9r Agent Orchestrator

Many of these products focus on:

- automatic model routing
- multi-agent collaboration
- autonomous task execution
- dashboards and TUIs
- task queues
- worktree management
- agent-to-agent communication
- dynamic model selection

AgentRail should intentionally remain simpler.

### AgentRail is NOT

- a new AI coding IDE
- a task management board
- a cloud orchestration platform
- an automatic model router
- an AI agent that decides which other agent should work
- a replacement for Claude Code, Codex, Gemini, or Copilot
- a daemon-heavy orchestration system

### agentrail IS

A lightweight orchestration skill that developers can add to the AI coding environment they already use.

The main differentiation is:

> **No AI routing. No magic. Your workflow, your subscriptions, your rules.**

---

## 4. Target User

Initial target user:

- individual software developers
- technical founders
- solo developers
- AI-heavy developers
- developers already paying for two or more AI coding subscriptions

Typical user profile:

```text
Claude Code subscription
Codex subscription
Gemini subscription
GitHub Copilot subscription
```

But the developer may spend most of the month using only one.

AgentRail gives the user a way to deliberately distribute work.

---

## 5. Distribution Model

AgentRail should be a **public GitHub repository**.

The repository contains an installable AI skill and its orchestration logic.

Example:

```text
github.com/<org>/agentrail
```

The developer installs agentrail locally and then uses it from their existing AI coding environment.

Possible interaction:

```text
Use agentrail to implement this feature using my feature workflow.
```

or:

```bash
agentrail run feature "Implement appointment cancellation"
```

The exact installation mechanism can evolve depending on the supported host environments.

---

# 6. MVP

## MVP Goal

Prove that a developer can define a deterministic workflow and reliably execute different stages using different locally installed AI coding CLIs.

The MVP should focus on:

- simplicity
- reliability
- context handoff
- explicit provider selection

Avoid building a sophisticated agent platform.

---

## 7. MVP Providers

Support only three providers initially:

- Claude Code
- OpenAI Codex CLI
- Gemini CLI

Copilot and additional providers can be added later.

---

## 8. MVP Feature 1 — Provider Discovery

During initialization, agentrail scans the developer's machine for supported AI providers.

Example:

```text
$ agentrail init

Scanning installed AI coding providers...

✓ Claude Code
  Command: claude
  Installed: yes
  Authenticated: yes

✓ Codex
  Command: codex
  Installed: yes
  Authenticated: yes

✓ Gemini CLI
  Command: gemini
  Installed: yes
  Authenticated: yes

✗ GitHub Copilot
  Not detected
```

The discovery process should ideally check:

- executable exists
- CLI version
- provider is callable
- authentication status where detectable

---

## 9. MVP Feature 2 — Workflow Configuration

The developer defines workflows inside the repository.

Example directory:

```text
.agentrail/
├── config.yaml
├── workflows/
│   ├── feature.yaml
│   ├── bugfix.yaml
│   └── review.yaml
├── tasks/
└── runs/
```

Example workflow:

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

The provider must always be explicitly selected.

---

## 10. MVP Feature 3 — Command-Oriented Workflow Execution

Initial execution model:

```bash
agentrail run <workflow> "<task>"
```

Example:

```bash
agentrail run feature "Implement appointment cancellation support"
```

The orchestrator should:

1. load the workflow
2. create a run
3. create feature/task context
4. execute the first workflow step
5. capture its output
6. update shared context
7. execute the next step
8. continue until the workflow finishes
9. present a final review summary
10. stop before commit/push

---

## 11. MVP Feature 4 — Shared Workflow Context

Agents should not directly communicate with each other.

The AgentRail orchestrator owns the workflow state.

Example run directory:

```text
.agentrail/runs/<run-id>/
├── task.md
├── requirements.md
├── plan.md
├── decisions.md
├── progress.json
├── review.md
└── final-summary.md
```

Each provider receives only the context needed for its current task.

Example:

```text
Gemini writes requirements.md
        ↓
Claude receives:
- task.md
- requirements.md
        ↓
Claude writes plan.md
        ↓
Codex receives:
- task.md
- requirements.md
- plan.md
        ↓
Codex writes review.md
```

This reduces context degradation and keeps agent handoffs deterministic.

---

## 12. MVP Feature 5 — Reusable Task Definitions

Separate workflow orchestration from task instructions.

Example:

```text
.agentrail/tasks/
├── analyze-requirements.md
├── create-plan.md
├── review-plan.md
├── implement.md
├── write-tests.md
├── code-review.md
└── update-documentation.md
```

Example task definition:

```markdown
# Code Review

Review the implementation against the task requirements and approved plan.

Focus on:

- correctness
- regressions
- security
- maintainability
- missing tests

Do not modify source files.

Write findings to `review.md`.
```

This makes workflow tasks reusable across different workflows.

---

## 13. MVP Feature 6 — Shell / Quality-Gate Steps

Not every workflow stage requires AI.

Support deterministic shell commands.

Example:

```yaml
- name: lint
  run: npm run lint

- name: tests
  run: npm test

- name: build
  run: npm run build
```

This should be handled directly by the orchestrator.

Typical quality gates:

- build
- lint
- type checking
- unit tests
- E2E tests

---

## 14. MVP Feature 7 — Human Review

The final step should always return control to the developer.

Example:

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

The developer owns:

```bash
git diff
git add
git commit
git push
```

---

## 15. MVP Feature 8 — Provider Failure Handling

If a provider cannot continue:

```text
Step 5/8 — Generate tests

Gemini CLI failed:
Usage limit reached.

Choose:

[R] Retry
[S] Select another installed provider
[P] Pause workflow
[A] Abort
```

Important:

AgentRail should **never silently switch providers**.

Explicit user control is a core design principle.

---

# 16. MVP Commands

Keep the CLI surface very small.

```bash
agentrail init
agentrail providers
agentrail workflows
agentrail run <workflow> "<task>"
agentrail status
agentrail resume
```

Possible future commands:

```bash
agentrail usage
agentrail add-workflow
agentrail validate
agentrail history
```

---

# 17. MVP Non-Goals

Do NOT build these in V1:

- automatic model selection
- AI-based provider routing
- cloud execution
- web dashboard
- Kanban board
- TUI
- Jira integration
- Linear integration
- GitHub Issues integration
- automatic PR creation
- automatic commit
- automatic push
- provider performance ranking
- sophisticated quota tracking
- distributed workers
- multi-machine orchestration
- provider-to-provider chat
- complex DAG workflows
- conditional branches
- automatic implementation/review loops
- IDE extensions

These can be evaluated after validating the core workflow.

---

# 18. Suggested Repository Structure

```text
agentrail/
├── README.md
├── LICENSE
├── SKILL.md
├── package.json
│
├── src/
│   ├── orchestrator/
│   ├── workflow/
│   ├── context/
│   ├── discovery/
│   └── providers/
│       ├── claude/
│       ├── codex/
│       └── gemini/
│
├── templates/
│   ├── workflows/
│   │   ├── feature.yaml
│   │   ├── bugfix.yaml
│   │   └── code-review.yaml
│   │
│   └── tasks/
│       ├── analyze-requirements.md
│       ├── create-plan.md
│       ├── implement.md
│       ├── write-tests.md
│       └── code-review.md
│
├── schemas/
│   └── workflow.schema.json
│
├── examples/
└── tests/
```

---

# 19. Architecture Principles

## Orchestrator owns the lifecycle

```text
              ┌──────────────┐
              │   agentrail    │
              │ Orchestrator │
              └──────┬───────┘
                     │
         ┌───────────┼───────────┐
         ↓           ↓           ↓
      Claude       Codex       Gemini
         │           │           │
         └───────────┼───────────┘
                     ↓
               Workflow Context
```

Agents do not directly delegate tasks to other providers.

Everything passes through agentrail.

---

## Provider adapters

Each provider should implement a common internal interface.

Conceptually:

```text
execute(prompt, context, permissions)
```

Provider-specific adapters handle:

- CLI command
- prompt input
- output parsing
- exit codes
- timeout handling
- provider session behavior

This allows additional providers to be added later.

---

# 20. Competitive Strategy

## Do not compete on autonomy

Competitors such as Hydra and larger orchestration platforms are already focused on autonomous agent teams.

AgentRail should prioritize deterministic workflows.

## Do not compete on automatic quota routing

Orchestrator already has strong quota-aware routing.

AgentRail should use quota utilization as the **motivation** for explicit workflow allocation, not as the primary routing algorithm.

## Differentiate from AGTX

AGTX is the closest conceptual competitor.

AGTX provides:

- multi-agent task management
- lifecycle orchestration
- TUI
- worktrees
- sessions
- plugins
- configurable agents

AgentRail should differentiate through simplicity.

### AGTX

> AI development task management and multi-agent environment.

### agentrail

> Add deterministic multi-provider workflows to the AI coding environment you already use.

No separate development environment is required.

---

# 21. Initial Default Workflows

Provide a few high-quality templates.

## Feature Development

```text
Analyze
  ↓
Plan
  ↓
Plan Review
  ↓
Implement
  ↓
Tests
  ↓
Quality Checks
  ↓
Code Review
  ↓
Documentation
  ↓
Human Review
```

## Bug Fix

```text
Analyze bug
  ↓
Find root cause
  ↓
Propose fix
  ↓
Implement
  ↓
Regression tests
  ↓
Review
  ↓
Human Review
```

## Code Review

```text
Analyze diff
  ↓
Code review
  ↓
Security review
  ↓
Test coverage review
  ↓
Summary
```

---

# 22. Next Steps

## Step 1 — Validate the idea further

Before implementation, perform a focused comparison against:

- AGTX
- Orchestrator
- Stringbean

Answer:

- What exact workflows can they define?
- Can provider selection be explicit for every step?
- How difficult is setup?
- Can they run entirely inside an existing coding-agent workflow?
- How are context handoffs handled?
- How reusable are their workflows?
- What do users complain about?

Deliverable:

```text
competitive-analysis.md
```

---

## Step 2 — Define the V1 workflow specification

Design the minimal YAML schema.

Example:

```yaml
name: feature

steps:
  - name: plan
    provider: claude
    task: create-plan

  - name: implement
    provider: codex
    task: implement

  - name: tests
    provider: gemini
    task: write-tests

  - name: test
    run: npm test
```

Do not add advanced features until real workflows require them.

Deliverable:

```text
workflow-spec.md
```

---

## Step 3 — Define the provider contract

Create a common adapter specification for:

- Claude Code
- Codex CLI
- Gemini CLI

Define:

- detection
- invocation
- prompt passing
- context passing
- output capture
- errors
- auth checks
- timeouts

Deliverable:

```text
provider-contract.md
```

---

## Step 4 — Build a proof of concept

Do not build the full product yet.

Create one hard-coded workflow:

```text
Gemini → Claude → Codex
```

Example task:

```text
Analyze requirements → create plan → review plan
```

The goal is to prove:

- provider CLIs can be invoked reliably
- context can move between agents
- results can be captured consistently
- provider failures can be handled

---

## Step 5 — Add workflow parsing

Replace the hard-coded workflow with YAML.

Example:

```bash
agentrail run feature "Add user cancellation support"
```

---

## Step 6 — Add run context and persistence

Create:

```text
.agentrail/runs/<id>/
```

Persist:

- task
- current workflow step
- outputs
- failures
- generated artifacts

This enables:

```bash
agentrail status
agentrail resume
```

---

## Step 7 — Add provider discovery

Implement:

```bash
agentrail providers
```

and:

```bash
agentrail init
```

Detect supported local CLIs and create starter configuration.

---

## Step 8 — Build default workflows

Ship:

- feature
- bugfix
- code-review

Keep them opinionated but easy to customize.

---

## Step 9 — Test on real development work

Use agentrail on real GitHub repositories and real development stories.

Measure:

- completion reliability
- handoff quality
- context loss
- provider failures
- developer interventions
- workflow duration
- usability

Most importantly:

> Does using agentrail actually reduce consumption of the developer's preferred subscription?

---

## Step 10 — Release publicly

Publish the GitHub repository with:

- strong README
- 5-minute quick start
- architecture explanation
- example workflows
- supported providers
- contribution guide
- roadmap

Initial positioning:

> **Stop wasting your AI subscriptions.**

Secondary message:

> Define which AI handles planning, implementation, testing, review, and documentation — then run the whole development workflow locally.

---

# 23. Post-MVP Roadmap

Only after validating the MVP should these be considered.

### Phase 2

- provider usage/quota visibility
- workflow marketplace
- shared public workflows
- workflow validation
- more providers
- custom provider adapters
- optional Git worktree isolation
- per-step file permissions
- configurable human checkpoints

### Phase 3

- conditional workflow steps
- reviewer/fixer loops
- parallel stages
- GitHub Issue input
- Jira / Linear adapters
- IDE integrations
- optional automatic routing
- team workflow sharing

---

# 24. Success Criteria for MVP

The MVP is successful if a developer can:

1. install agentrail
2. run `agentrail init`
3. detect Claude, Codex, and Gemini locally
4. configure a workflow in less than 5 minutes
5. explicitly assign providers to workflow stages
6. run one command
7. have multiple providers successfully execute their assigned tasks
8. retain useful context between providers
9. recover from a failed step
10. review the final result before manually committing

The strongest validation signal would be:

> Developers start intentionally assigning routine work to their secondary AI subscriptions instead of consuming their preferred model for everything.

---

# 25. MVP Summary

The first version of AgentRail should do only this:

```text
Install skill
   ↓
Discover local AI CLIs
   ↓
Define workflow
   ↓
Assign provider to every AI step
   ↓
Run workflow
   ↓
Manage shared context
   ↓
Execute deterministic quality checks
   ↓
Handle failures explicitly
   ↓
Return final changes to developer
   ↓
Human reviews and commits
```

That is enough to validate the core thesis without building another large multi-agent platform.
