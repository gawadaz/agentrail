# Installable Claude Code Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package AgentRail as a self-contained Claude Code skill installable into a repo or globally with a single `curl`/`irm` command.

**Architecture:** An esbuild step bundles `src/cli.ts` and all runtime deps into one `skill/agentrail/cli.js`; `templates/` is copied next to it. A committed `skill/agentrail/SKILL.md` instructs Claude to run `node <skill-dir>/cli.js`. `install.sh` / `install.ps1` download a CI-built release tarball (`SKILL.md` + `cli.js` + `templates/`) into `.claude/skills/agentrail/` or `~/.claude/skills/agentrail/`. A GitHub Actions workflow builds and attaches the tarball on `v*` tags.

**Tech Stack:** Node ≥ 18, TypeScript, esbuild, vitest, GitHub Actions, POSIX sh, PowerShell.

**Spec:** `docs/superpowers/specs/2026-09-07-installable-skill-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/build-skill.mjs` | Bundle CLI + copy templates into an output dir; exports `buildSkill(outDir)` and runs it when invoked directly |
| `src/config/writeConfig.ts` | (modify) Resolve the workflow-templates dir from candidate locations so it works in both the tsc `dist/` layout and the bundled skill layout |
| `skill/agentrail/SKILL.md` | Committed skill instructions + frontmatter |
| `skill/agentrail/cli.js`, `skill/agentrail/templates/` | Build artifacts (gitignored) |
| `tests/scripts/buildSkill.test.ts` | Smoke test: build into a temp dir, exercise the bundled CLI |
| `install.sh` | POSIX installer: resolve target dir, download release tarball, extract |
| `install.ps1` | PowerShell installer, same behaviour |
| `.github/workflows/release.yml` | On `v*` tag: test, build skill, tar, attach to Release |
| `.gitignore` | (modify) ignore the two build artifacts under `skill/agentrail/` |
| `README.md` | (modify) add "Install as a Claude Code skill" section |

---

## Task 1: esbuild dependency and skill-build script

**Files:**
- Modify: `package.json`
- Create: `scripts/build-skill.mjs`

- [ ] **Step 1: Install esbuild as a dev dependency**

Run: `npm install --save-dev esbuild@^0.24.0`
Expected: `package.json` gains `"esbuild": "^0.24.0"` under `devDependencies`; exit 0.

- [ ] **Step 2: Add the `build:skill` npm script**

In `package.json`, add to the `"scripts"` object (after `"build"`):

```json
    "build:skill": "node scripts/build-skill.mjs",
```

- [ ] **Step 3: Write `scripts/build-skill.mjs`**

Create `scripts/build-skill.mjs`:

```js
import { build } from 'esbuild';
import { cpSync, rmSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bundle the CLI and copy workflow templates into `outDir`.
 * Produces: <outDir>/cli.js  and  <outDir>/templates/workflows/*.yaml
 */
export async function buildSkill(outDir) {
  const target = resolve(outDir);
  mkdirSync(target, { recursive: true });

  const cliPath = join(target, 'cli.js');
  await build({
    entryPoints: [join(repoRoot, 'src', 'cli.ts')],
    outfile: cliPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
    minify: false,
    logLevel: 'silent',
  });
  chmodSync(cliPath, 0o755);

  const templatesSrc = join(repoRoot, 'templates');
  const templatesDest = join(target, 'templates');
  rmSync(templatesDest, { recursive: true, force: true });
  cpSync(templatesSrc, templatesDest, { recursive: true });

  return { cliPath, templatesDest };
}

// Run when invoked directly: `node scripts/build-skill.mjs [outDir]`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-skill.mjs')) {
  const outDir = process.argv[2] ?? join(repoRoot, 'skill', 'agentrail');
  buildSkill(outDir)
    .then(({ cliPath }) => {
      console.log(`Built skill CLI -> ${cliPath}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run the build once manually**

Run: `npm run build:skill`
Expected: exit 0; prints `Built skill CLI -> .../skill/agentrail/cli.js`; files `skill/agentrail/cli.js` and `skill/agentrail/templates/workflows/feature.yaml` exist.

- [ ] **Step 5: Verify the bundled CLI runs**

Run: `node skill/agentrail/cli.js --help`
Expected: exit 0; output contains `agentrail` and lists the `providers`, `workflows`, `run`, `init` commands.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/build-skill.mjs
git commit -m "build: add esbuild skill-bundle script"
```

---

## Task 2: Make template resolution work in the bundled layout

**Problem:** `src/config/writeConfig.ts` resolves templates as `<dir-of-this-file>/../../templates/workflows`. That is correct for the tsc `dist/config/` layout but wrong for the bundled `skill/agentrail/cli.js` layout (where templates sit at `skill/agentrail/templates/workflows`) and for a global install. Fix it to try candidate locations.

**Files:**
- Modify: `src/config/writeConfig.ts:7-13`
- Test: `tests/config/writeConfig.test.ts`

- [ ] **Step 1: Write a failing test for bundled-layout resolution**

Add this test to `tests/config/writeConfig.test.ts` inside the `describe('writeConfig template scaffolding', ...)` block:

```ts
  it('resolves templates when they sit directly beside the module (bundled skill layout)', () => {
    // Simulate the bundled layout: a dir containing a fake compiled module plus
    // ./templates/workflows/*.yaml, and confirm resolveTemplatesDir finds it.
    const fakeSkillDir = makeTmpDir();
    const wf = join(fakeSkillDir, 'templates', 'workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'feature.yaml'), 'name: feature\nsteps: []\n');

    const resolved = resolveTemplatesDir(fakeSkillDir);

    expect(resolved).toBe(wf);
  });
```

Add `mkdirSync` to the `node:fs` import at the top of the test file, and add this import:

```ts
import { resolveTemplatesDir } from '../../src/config/writeConfig.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/config/writeConfig.test.ts -t "bundled skill layout"`
Expected: FAIL — `resolveTemplatesDir` is not exported / not a function.

- [ ] **Step 3: Implement `resolveTemplatesDir`**

In `src/config/writeConfig.ts`, replace the current `TEMPLATES_DIR` constant (lines 7-13):

```ts
const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates',
  'workflows'
);
```

with:

```ts
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the bundled workflow templates. Order of candidates:
 *   1. <moduleDir>/templates/workflows        — bundled skill layout (cli.js + templates/)
 *   2. <moduleDir>/../../templates/workflows   — tsc dist/ layout (dist/config/writeConfig.js)
 * Falls back to candidate 2 so callers still get a stable path to log.
 */
export function resolveTemplatesDir(moduleDir: string = MODULE_DIR): string {
  const candidates = [
    join(moduleDir, 'templates', 'workflows'),
    join(moduleDir, '..', '..', 'templates', 'workflows'),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[1];
}

const TEMPLATES_DIR = resolveTemplatesDir();
```

`existsSync` is already imported in this file. Leave the rest of the file unchanged — `scaffoldWorkflowTemplates` keeps using `TEMPLATES_DIR`.

- [ ] **Step 4: Run the new test and the full file**

Run: `npx vitest run tests/config/writeConfig.test.ts`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Rebuild the skill and confirm `init` finds templates in the bundle**

```bash
npm run build:skill
mkdir -p /tmp/agentrail-tmpl-check && cd /tmp/agentrail-tmpl-check
node <repo>/skill/agentrail/cli.js workflows
```

(Replace `<repo>` with the absolute repo path.) Expected: exit 0, prints `No workflows found in .agentrail/workflows/` (there is no `.agentrail/` here — that is the correct output and proves the bundle loads without a template-path crash). Then clean up: `rm -rf /tmp/agentrail-tmpl-check`.

- [ ] **Step 6: Run the whole test suite**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/config/writeConfig.ts tests/config/writeConfig.test.ts
git commit -m "fix: resolve workflow templates from candidate dirs for bundled skill"
```

---

## Task 3: Build smoke test

**Files:**
- Create: `tests/scripts/buildSkill.test.ts`

- [ ] **Step 1: Write the smoke test**

Create `tests/scripts/buildSkill.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSkill } from '../../scripts/build-skill.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'agentrail-skill-'));

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('buildSkill', () => {
  it('bundles cli.js with a node shebang and copies workflow templates', async () => {
    const { cliPath } = await buildSkill(outDir);

    expect(existsSync(cliPath)).toBe(true);
    const source = readFileSync(cliPath, 'utf-8');
    expect(source.startsWith('#!/usr/bin/env node')).toBe(true);

    expect(existsSync(join(outDir, 'templates', 'workflows', 'feature.yaml'))).toBe(true);
    expect(existsSync(join(outDir, 'templates', 'workflows', 'bugfix.yaml'))).toBe(true);
    expect(existsSync(join(outDir, 'templates', 'workflows', 'review.yaml'))).toBe(true);
  });

  it('produces a runnable bundle with no missing dependencies', async () => {
    const { cliPath } = await buildSkill(outDir);

    const help = execFileSync('node', [cliPath, '--help'], { encoding: 'utf-8' });
    expect(help).toContain('agentrail');
    expect(help).toContain('workflows');
    expect(help).toContain('run');

    // `workflows` in a dir with no .agentrail/ must exit 0 (not crash on template paths)
    const listing = execFileSync('node', [cliPath, 'workflows'], {
      encoding: 'utf-8',
      cwd: outDir,
    });
    expect(listing).toContain('No workflows found');
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `npx vitest run tests/scripts/buildSkill.test.ts`
Expected: PASS — both tests.

- [ ] **Step 3: Confirm the full suite still passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/scripts/buildSkill.test.ts
git commit -m "test: smoke-test the bundled skill build"
```

---

## Task 4: SKILL.md

**Files:**
- Create: `skill/agentrail/SKILL.md`

- [ ] **Step 1: Write `skill/agentrail/SKILL.md`**

Create `skill/agentrail/SKILL.md` with exactly this content:

```markdown
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
```

- [ ] **Step 2: Sanity-check the frontmatter**

Run: `node -e "const m=require('fs').readFileSync('skill/agentrail/SKILL.md','utf8'); const fm=m.split('---')[1]; if(!/name:\s*agentrail/.test(fm)||!/description:/.test(fm)) throw new Error('bad frontmatter'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add skill/agentrail/SKILL.md
git commit -m "feat: add AgentRail SKILL.md"
```

---

## Task 5: Gitignore build artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append the artifact paths**

Add these lines to the end of `.gitignore`:

```gitignore
skill/agentrail/cli.js
skill/agentrail/templates/
```

- [ ] **Step 2: Verify only SKILL.md is tracked under skill/**

Run: `npm run build:skill && git status --porcelain skill/`
Expected: no output (SKILL.md already committed; `cli.js` and `templates/` ignored).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore bundled skill artifacts"
```

---

## Task 6: `install.sh`

**Files:**
- Create: `install.sh`

- [ ] **Step 1: Write `install.sh`**

Create `install.sh` (make it `chmod +x` after):

```sh
#!/bin/sh
# AgentRail skill installer.
#   curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh -s -- --global
set -eu

REPO="gawadaz/agentrail"
VERSION="latest"
SCOPE="local"

while [ $# -gt 0 ]; do
  case "$1" in
    --global) SCOPE="global" ;;
    --local) SCOPE="local" ;;
    --version) shift; VERSION="${1:-latest}" ;;
    --version=*) VERSION="${1#--version=}" ;;
    -h|--help)
      echo "Usage: install.sh [--global] [--version vX.Y.Z]"
      exit 0 ;;
    *) echo "install.sh: unknown option '$1'" >&2; exit 2 ;;
  esac
  shift
done

if [ -n "${AGENTRAIL_SKILL_DIR:-}" ]; then
  TARGET="$AGENTRAIL_SKILL_DIR"
elif [ "$SCOPE" = "global" ]; then
  TARGET="$HOME/.claude/skills/agentrail"
else
  TARGET="$(pwd)/.claude/skills/agentrail"
fi

# Node check — warn, do not abort.
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
    echo "warning: Node $(node -v) detected; AgentRail needs Node >= 18 to run." >&2
  fi
else
  echo "warning: Node.js not found on PATH; AgentRail needs Node >= 18 to run." >&2
fi

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/$REPO/releases/latest/download/agentrail-skill.tar.gz"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/agentrail-skill.tar.gz"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading AgentRail skill ($VERSION)..."
if ! curl -fsSL "$URL" -o "$TMP/skill.tar.gz"; then
  echo "error: failed to download $URL" >&2
  echo "       check the version exists at https://github.com/$REPO/releases" >&2
  exit 1
fi

rm -rf "$TARGET"
mkdir -p "$TARGET"
tar -xzf "$TMP/skill.tar.gz" -C "$TARGET"

echo "Installed AgentRail skill to $TARGET"
echo
echo "Next steps:"
echo "  1. Reload Claude Code so it picks up the new skill."
echo "  2. Ask Claude: \"set up an AgentRail workflow\" or \"run my feature workflow\"."
echo
echo "Uninstall: rm -rf \"$TARGET\""
```

- [ ] **Step 2: Make it executable and shellcheck it if available**

```bash
chmod +x install.sh
command -v shellcheck >/dev/null 2>&1 && shellcheck install.sh || echo "shellcheck not installed, skipping"
```

Expected: `chmod` succeeds; shellcheck (if present) reports no errors.

- [ ] **Step 3: Test the arg parsing and a bad download**

```bash
sh ./install.sh --help
sh ./install.sh --nonsense; echo "exit=$?"
sh ./install.sh --version v0.0.0-does-not-exist; echo "exit=$?"
```

Expected: `--help` prints usage and exits 0; `--nonsense` prints "unknown option" and `exit=2`; the bad version prints the download error and `exit=1` (no directory created).

- [ ] **Step 4: Verify the extract layout the installer relies on**

```bash
npm run build:skill
mkdir -p /tmp/agentrail-rel
tar -czf /tmp/agentrail-rel/agentrail-skill.tar.gz -C skill/agentrail .
rm -rf /tmp/agentrail-install && mkdir -p /tmp/agentrail-install
tar -xzf /tmp/agentrail-rel/agentrail-skill.tar.gz -C /tmp/agentrail-install
test -f /tmp/agentrail-install/SKILL.md && test -f /tmp/agentrail-install/cli.js && \
  test -f /tmp/agentrail-install/templates/workflows/feature.yaml && echo "extract layout OK"
node /tmp/agentrail-install/cli.js --help >/dev/null && echo "bundled cli OK"
rm -rf /tmp/agentrail-install /tmp/agentrail-rel
```

Expected: `extract layout OK` and `bundled cli OK`.

- [ ] **Step 5: Commit**

```bash
git add install.sh
git commit -m "feat: add install.sh for the AgentRail skill"
```

---

## Task 7: `install.ps1`

**Files:**
- Create: `install.ps1`

- [ ] **Step 1: Write `install.ps1`**

Create `install.ps1`:

```powershell
<#
  AgentRail skill installer (Windows / PowerShell).
    irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1 | iex
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1))) -Global
#>
[CmdletBinding()]
param(
  [switch]$Global,
  [string]$Version = 'latest'
)

$ErrorActionPreference = 'Stop'
$repo = 'gawadaz/agentrail'

if ($env:AGENTRAIL_SKILL_DIR) {
  $target = $env:AGENTRAIL_SKILL_DIR
} elseif ($Global) {
  $target = Join-Path $HOME '.claude/skills/agentrail'
} else {
  $target = Join-Path (Get-Location) '.claude/skills/agentrail'
}

# Node check — warn, do not abort.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $major = [int](& node -p 'process.versions.node.split(".")[0]')
  if ($major -lt 18) {
    Write-Warning "Node $(& node -v) detected; AgentRail needs Node >= 18 to run."
  }
} else {
  Write-Warning 'Node.js not found on PATH; AgentRail needs Node >= 18 to run.'
}

if ($Version -eq 'latest') {
  $url = "https://github.com/$repo/releases/latest/download/agentrail-skill.tar.gz"
} else {
  $url = "https://github.com/$repo/releases/download/$Version/agentrail-skill.tar.gz"
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("agentrail-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$archive = Join-Path $tmp 'skill.tar.gz'

try {
  Write-Host "Downloading AgentRail skill ($Version)..."
  try {
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
  } catch {
    Write-Error "Failed to download $url. Check the version exists at https://github.com/$repo/releases"
    exit 1
  }

  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  & tar -xzf $archive -C $target
  if ($LASTEXITCODE -ne 0) { Write-Error 'tar extraction failed'; exit 1 }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host "Installed AgentRail skill to $target"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Reload Claude Code so it picks up the new skill.'
Write-Host '  2. Ask Claude: "set up an AgentRail workflow" or "run my feature workflow".'
Write-Host ''
Write-Host "Uninstall: Remove-Item -Recurse -Force `"$target`""
```

- [ ] **Step 2: Parse-check the script**

Run: `pwsh -NoProfile -Command "[void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path ./install.ps1), [ref]$null, [ref]$null); 'parse ok'"`
(If `pwsh` is unavailable, use `powershell` instead.)
Expected: prints `parse ok`.

- [ ] **Step 3: Test the extract path locally**

```powershell
npm run build:skill
$rel = Join-Path $env:TEMP 'agentrail-rel'; New-Item -ItemType Directory -Force $rel | Out-Null
tar -czf (Join-Path $rel 'agentrail-skill.tar.gz') -C skill/agentrail .
$dst = Join-Path $env:TEMP 'agentrail-install'
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
New-Item -ItemType Directory -Force $dst | Out-Null
tar -xzf (Join-Path $rel 'agentrail-skill.tar.gz') -C $dst
Test-Path (Join-Path $dst 'SKILL.md'); Test-Path (Join-Path $dst 'cli.js')
node (Join-Path $dst 'cli.js') --help | Select-String agentrail
Remove-Item -Recurse -Force $dst, $rel
```

Expected: two `True` lines and a line containing `agentrail`.

- [ ] **Step 4: Commit**

```bash
git add install.ps1
git commit -m "feat: add install.ps1 for the AgentRail skill"
```

---

## Task 8: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm test

      - name: Build skill bundle
        run: npm run build:skill

      - name: Package skill tarball
        run: tar -czf agentrail-skill.tar.gz -C skill/agentrail .

      - name: Attach to release
        uses: softprops/action-gh-release@v2
        with:
          files: agentrail-skill.tar.gz
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Lint the YAML**

Run: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release.yml','utf8')); console.log('yaml ok')"`
Expected: prints `yaml ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build and attach skill tarball on version tags"
```

---

## Task 9: README install section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the Installation section intro**

The current `README.md` has:

```
## Installation

```bash
git clone https://github.com/<org>/agentrail.git
```

Replace that exact three-line span (`## Installation` heading, blank line, ` ```bash ` fence, `git clone https://github.com/<org>/agentrail.git`) with:

```
## Installation

### As a Claude Code skill (recommended)

Install into the current repo:

```bash
curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh
```

Globally (available in every project):

```bash
curl -fsSL https://raw.githubusercontent.com/gawadaz/agentrail/main/install.sh | sh -s -- --global
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1 | iex
# global install:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/gawadaz/agentrail/main/install.ps1))) -Global
```

This drops a self-contained skill into `.claude/skills/agentrail/` (or
`~/.claude/skills/agentrail/`). Requires Node.js >= 18 on your PATH. Reload
Claude Code, then ask it to "set up an AgentRail workflow". Uninstall with
`rm -rf .claude/skills/agentrail`.

### From source

```bash
git clone https://github.com/gawadaz/agentrail.git
```

This also corrects the leftover `<org>` placeholder to `gawadaz`.

- [ ] **Step 2: Verify the README renders**

Run: `node -e "const s=require('fs').readFileSync('README.md','utf8'); const f=(s.match(/\`\`\`/g)||[]).length; if(f%2) throw new Error('unbalanced code fences: '+f); console.log('fences balanced')"`
Expected: prints `fences balanced`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document skill install in README"
```

---

## Task 10: Final verification

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf skill/agentrail/cli.js skill/agentrail/templates
npm ci
npm test
npm run build:skill
```

Expected: `npm test` all green; `build:skill` exits 0; `skill/agentrail/cli.js` and `skill/agentrail/templates/workflows/*.yaml` regenerated.

- [ ] **Step 2: End-to-end dry run of the packaged skill**

```bash
tar -czf /tmp/agentrail-skill.tar.gz -C skill/agentrail .
rm -rf /tmp/e2e && mkdir -p /tmp/e2e/.claude/skills/agentrail
tar -xzf /tmp/agentrail-skill.tar.gz -C /tmp/e2e/.claude/skills/agentrail
cd /tmp/e2e
node .claude/skills/agentrail/cli.js providers
node .claude/skills/agentrail/cli.js workflows
cd - && rm -rf /tmp/e2e /tmp/agentrail-skill.tar.gz
```

Expected: `providers` prints the scan report and exits 0; `workflows` prints `No workflows found in .agentrail/workflows/` and exits 0.

- [ ] **Step 3: Confirm git status is clean**

Run: `git status --porcelain`
Expected: no output (all artifacts ignored, all source committed). Pre-existing untracked files (`install.cmd`, `{}`, `.claude/`) are out of scope — leave them.

---

## Manual test checklist (post-merge, needs a real GitHub release)

- [ ] Cut a `v0.2.0` tag; the `release` workflow attaches `agentrail-skill.tar.gz`
- [ ] `curl -fsSL .../install.sh | sh` in a clean repo → `.claude/skills/agentrail/{SKILL.md,cli.js,templates/}` present
- [ ] `... | sh -s -- --global` → same tree under `~/.claude/skills/agentrail/`
- [ ] Re-running the installer cleanly replaces the previous install
- [ ] `install.ps1` produces the same tree on Windows
- [ ] Node absent → warning printed, install still completes
- [ ] Bad `--version` → clear error, no partial install left behind
- [ ] In Claude Code: "set up an agentrail workflow" triggers the skill and runs `init`
