# AgentRail as an Installable Claude Code Skill — Design

**Date:** 2026-09-07
**Status:** Approved

## Problem

AgentRail is a working CLI, but there is no low-friction way for a developer to
start using it inside Claude Code. Today they must clone the repo, `npm install`,
`npm run build`, and `npm link`. Developers already work with Claude Code skills
and expect a one-command install that drops a skill into a project (or globally)
and makes it immediately usable.

## Goal

Ship AgentRail as a self-contained Claude Code skill that installs with a single
command into either `./.claude/skills/agentrail/` (current repo) or
`~/.claude/skills/agentrail/` (global), with no post-download build or dependency
install step, and works offline once downloaded.

## Non-Goals

- Claude Code plugin / marketplace packaging (deferred; may come later)
- Publishing `agentrail` to npm
- Homebrew, Scoop, or other OS package managers
- Skill auto-update
- A persistent `agentrail` shim on `PATH`
- Any change to `src/` behaviour — the CLI is complete; this is packaging only

## Architecture

Three pieces, all in this repository:

| Piece | Path | Purpose |
|---|---|---|
| Bundle build | `scripts/build-skill.mjs` | esbuild bundles `src/cli.ts` + all runtime deps into a single `skill/agentrail/cli.js`; copies `templates/` alongside it |
| Skill payload | `skill/agentrail/` | `SKILL.md` (committed) + `cli.js` + `templates/` (build artifacts) — exactly the tree that lands in `.claude/skills/agentrail/` |
| Installer | `install.sh`, `install.ps1` (repo root) | Download the latest release tarball and extract the payload into the target skills directory |

### Release flow

On a `v*` git tag, GitHub Actions:

1. `npm ci`
2. `npm test`
3. `node scripts/build-skill.mjs`
4. `tar czf agentrail-skill.tar.gz -C skill/agentrail .`
5. Attaches `agentrail-skill.tar.gz` to the GitHub Release for that tag.

The tarball's top level is the *contents* of `skill/agentrail/` (so
`SKILL.md`, `cli.js`, `templates/` are at the root of the archive).

## Components

### 1. `scripts/build-skill.mjs`

A Node ESM script (no test framework, run directly):

- Runs esbuild programmatically with:
  - `entryPoints: ['src/cli.ts']`
  - `outfile: 'skill/agentrail/cli.js'`
  - `bundle: true`
  - `platform: 'node'`
  - `format: 'esm'`
  - `target: 'node18'`
  - `banner: { js: '#!/usr/bin/env node' }`
  - `minify: false` (keep stack traces readable)
  - `external: []` — everything (`commander`, `js-yaml`, `@inquirer/prompts` and
    their transitive deps) is bundled
- After bundling, recursively copies `templates/` → `skill/agentrail/templates/`
  (removing any stale copy first)
- `chmod 0755` on `cli.js`
- Exits non-zero on any esbuild error

`esbuild` is added to `devDependencies`.

### 2. `skill/agentrail/SKILL.md`

Hand-written and committed. It is identical on every machine — no install-time
rewriting.

**Frontmatter:**

```yaml
---
name: agentrail
description: Use when the user wants to run a multi-step development workflow across
  several AI coding CLIs (Claude, Codex, etc.) with explicit per-step provider
  assignment — planning on one model, implementation on another, review on a third.
  Also for "set up an agentrail workflow", "run my feature workflow", spreading
  work across AI subscriptions to avoid burning one provider's quota.
---
```

**Body outline:**

1. **What AgentRail is** — one paragraph: workflow-as-code, deterministic,
   explicit per-step provider routing, no silent fallback, human owns Git.
2. **Locating the CLI** — run `node <path>/cli.js <args>` where `<path>` is the
   first of these that exists:
   - `./.claude/skills/agentrail/cli.js` (repo-local install)
   - `~/.claude/skills/agentrail/cli.js` (global install)
   Claude checks both; if neither exists, tell the user to re-run the installer.
3. **First-time setup** — if `.agentrail/` is absent in the project, run
   `cli.js init`. `init` needs an interactive TTY to pick providers; if the
   current shell is not interactive, instruct the user to run
   `node <path>/cli.js init` themselves in a terminal, then continue.
4. **Discovering and running** — `cli.js providers` to check availability,
   `cli.js workflows` to list, `cli.js run <workflow> "<task>"` to execute.
   Stream the output to the user.
5. **On completion** — read and summarise `<run-dir>/final-summary.md`; point the
   user at the run directory (printed by the CLI) and the changed files.
6. **On step failure** — the CLI stops and exits non-zero. Show the user the
   failing step name and stderr. Ask how to proceed. Never silently retry or
   switch providers.
7. **Hard rule** — AgentRail stops before commit/push. Claude must not
   `git commit` or `git push` as part of running a workflow. The developer owns
   the final Git operation.
8. **Workflow YAML reference** — brief cheatsheet: provider step
   (`provider` + `task`, optional `output`, optional `context`) vs shell step
   (`run`, optional `output`); point to `templates/` in the skill directory for
   full examples.

### 3. `install.sh`

POSIX `sh` (not bash-only). Behaviour:

1. Parse args:
   - `--global` → target `~/.claude/skills/agentrail`
   - (default) → target `./.claude/skills/agentrail`
   - `--version vX.Y.Z` → pin a release (default: latest)
   - `$AGENTRAIL_SKILL_DIR` env var overrides the target dir entirely
2. Check `node --version` ≥ 18. If missing or older, print a clear warning that
   the skill will not run without it, but continue the install.
3. Resolve the download URL:
   - latest: `https://github.com/gawadaz/agentrail/releases/latest/download/agentrail-skill.tar.gz`
   - pinned: `.../releases/download/<version>/agentrail-skill.tar.gz`
4. Download to a temp file with `curl -fsSL` (error out clearly on network/404).
5. Remove any existing target dir (clean replace, not merge), recreate it,
   extract the tarball into it.
6. Print next steps: reload Claude Code; then ask Claude to "set up an AgentRail
   workflow" or "run my feature workflow".

Uninstall is a documented one-liner: `rm -rf .claude/skills/agentrail` (or the
`~/.claude/...` path).

### 4. `install.ps1`

PowerShell equivalent of `install.sh`:

- `-Global` switch → `~/.claude/skills/agentrail` (`$HOME` on Windows)
- `-Version vX.Y.Z` to pin
- `$env:AGENTRAIL_SKILL_DIR` override
- `node --version` check with the same warn-and-continue behaviour
- `Invoke-WebRequest` to download; `tar -xzf` (present on Windows 10+/11) to
  extract
- Same clean-replace and next-steps output

Invocation: `irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1 | iex`
(with args: `& ([scriptblock]::Create((irm .../install.ps1))) -Global`).

### 5. `.github/workflows/release.yml`

Triggered on `push` tags matching `v*`. Steps as in the Release flow above.
Uses `softprops/action-gh-release` (or `gh release upload`) to attach the
tarball. `npm test` must pass before the release is published.

## Repo Changes Summary

**New files:**

- `skill/agentrail/SKILL.md`
- `scripts/build-skill.mjs`
- `install.sh`
- `install.ps1`
- `.github/workflows/release.yml`

**Changed files:**

- `package.json` — add `esbuild` devDep; add scripts:
  - `"build:skill": "node scripts/build-skill.mjs"`
- `.gitignore` — add `skill/agentrail/cli.js` and `skill/agentrail/templates/`
  (only `SKILL.md` is committed under `skill/`)
- `README.md` — new "Install as a Claude Code skill" section with the `curl` /
  `irm` one-liners for repo-local and global installs, kept alongside the
  existing "from source" instructions
- `vitest.config.ts` / test suite — add the build smoke test (below)

**Untouched:** everything in `src/`.

## Testing

1. **Build smoke test** (vitest, added to the existing suite):
   - Run `scripts/build-skill.mjs` (or its core function) into a temp output dir
   - Assert `cli.js` exists and starts with the shebang
   - Assert `templates/feature.yaml` was copied
   - Spawn `node <temp>/cli.js --help` → exit 0, output contains `agentrail`
   - Spawn `node <temp>/cli.js providers` → exit 0 (adapters may all report "not
     detected" in CI; that is still exit 0)
   - This catches ESM interop breakage and missing bundled deps.

2. **Installer** — tested manually against:
   - a real GitHub release once the first tag is cut
   - a `file://` or local `--version` path during development
   Documented as a manual checklist in this spec; not automated (shell/PowerShell
   installer CI is not worth the harness for this project size).

3. `npm test` otherwise unchanged.

### Manual installer checklist

- [ ] `sh install.sh` in a clean repo → `.claude/skills/agentrail/{SKILL.md,cli.js,templates/}` present
- [ ] `sh install.sh --global` → same tree under `~/.claude/skills/agentrail/`
- [ ] Re-running the installer cleanly replaces the previous install
- [ ] `node .claude/skills/agentrail/cli.js providers` runs
- [ ] `install.ps1` produces the same tree on Windows
- [ ] Missing Node → warning printed, install still completes
- [ ] Bad `--version` → clear error, no partial install left behind

## Open Questions

None. All resolved during brainstorming:

- Skill format: plain `SKILL.md` (not a plugin) — plugin deferred
- CLI delivery: bundled with the skill (single-file esbuild bundle)
- Install mechanism: curl/irm one-liner pulling a CI-built release tarball
- CLI path resolution: SKILL.md tries repo-local then global path
- Packaging: single-file esbuild bundle (no `node_modules`, no post-download step)
