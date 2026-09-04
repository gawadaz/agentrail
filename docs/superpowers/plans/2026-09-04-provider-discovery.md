# Provider Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `agentrail providers` and `agentrail init`, which scan the machine for Claude Code, Codex, and Gemini CLI, report install/version/auth status, and (init only) scaffold `.agentrail/config.yaml`.

**Architecture:** Injectable-`ExecFn` provider adapters (claude/codex/gemini) feed a pure `scanAll` discovery function; results flow through a pure report formatter and an fs-based config writer; a `createProgram(deps)` factory wires everything into a commander CLI so every layer is unit-testable without real CLIs installed.

**Tech Stack:** Node.js + TypeScript (NodeNext modules), commander, js-yaml, vitest, tsx.

Spec: `docs/superpowers/specs/2026-09-04-provider-discovery-design.md`

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "agentrail",
  "version": "0.1.0",
  "description": "Workflow-as-code orchestration for the AI coding subscriptions you already pay for.",
  "type": "module",
  "bin": {
    "agentrail": "./dist/cli.js"
  },
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsx src/cli.ts"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write .gitignore**

```text
node_modules/
dist/
.agentrail/
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold TypeScript project (package.json, tsconfig, vitest)"
```

---

### Task 2: Core discovery types

**Files:**
- Create: `src/discovery/types.ts`

- [ ] **Step 1: Write the types file**

```ts
export type AuthStatus = 'yes' | 'no' | 'unknown';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ExecFn = (
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number }
) => Promise<ExecResult>;

export interface ProviderStatus {
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  authenticated: AuthStatus;
  authNote?: string;
  error?: string;
}

export interface AuthCheckResult {
  status: AuthStatus;
  note?: string;
}

export interface ProviderAdapter {
  name: string;
  command: string;
  versionArgs: string[];
  parseVersion?: (stdout: string) => string | undefined;
  checkAuth: (exec: ExecFn) => Promise<AuthCheckResult>;
}
```

There are no behaviors to test in a pure type file — this task has no test step. Every other task that consumes these types is where the behavior gets verified.

- [ ] **Step 2: Commit**

```bash
git add src/discovery/types.ts
git commit -m "feat: add discovery core types"
```

---

### Task 3: Timeout-wrapped process exec helper

**Files:**
- Create: `src/discovery/exec.ts`
- Test: `tests/discovery/exec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { realExec } from '../../src/discovery/exec.js';

describe('realExec', () => {
  it('captures stdout and exit code for a successful command', async () => {
    const result = await realExec(process.execPath, ['-e', 'console.log("hello")']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('resolves with code -1 when the command does not exist', async () => {
    const result = await realExec('this-command-does-not-exist-xyz', []);
    expect(result.code).toBe(-1);
  });

  it('times out long-running commands', async () => {
    const result = await realExec(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      { timeoutMs: 200 }
    );
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain('Timed out');
  }, 2000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discovery/exec.test.ts`
Expected: FAIL — `src/discovery/exec.ts` does not exist / `realExec` is not exported.

- [ ] **Step 3: Write the implementation**

```ts
import { spawn } from 'node:child_process';
import type { ExecFn, ExecResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 5000;

export const realExec: ExecFn = (cmd, args, opts) => {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ExecResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(cmd, args, { shell: false });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ code: -1, stdout, stderr: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/discovery/exec.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/discovery/exec.ts tests/discovery/exec.test.ts
git commit -m "feat: add timeout-wrapped process exec helper"
```

---

### Task 4: Claude Code provider adapter

**Files:**
- Create: `src/providers/claude/adapter.ts`
- Test: `tests/providers/claude.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createClaudeAdapter } from '../../src/providers/claude/adapter.js';

const noopExec = async () => ({ code: 0, stdout: '', stderr: '' });

describe('claude adapter', () => {
  it('has the expected command and name', () => {
    const adapter = createClaudeAdapter();
    expect(adapter.name).toBe('Claude Code');
    expect(adapter.command).toBe('claude');
    expect(adapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes when ANTHROPIC_API_KEY is set', async () => {
    const adapter = createClaudeAdapter({
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      existsSync: () => false,
      homedir: () => '/home/test',
    });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
    expect(result.note).toContain('ANTHROPIC_API_KEY');
  });

  it('reports authenticated yes when the credentials file exists', async () => {
    const adapter = createClaudeAdapter({
      env: {},
      existsSync: (path: string) => path.endsWith('.credentials.json'),
      homedir: () => '/home/test',
    });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('yes');
    expect(result.note).toContain('credentials file');
  });

  it('reports authenticated no when neither signal is present', async () => {
    const adapter = createClaudeAdapter({
      env: {},
      existsSync: () => false,
      homedir: () => '/home/test',
    });
    const result = await adapter.checkAuth(noopExec);
    expect(result.status).toBe('no');
  });

  it('honors CLAUDE_CONFIG_DIR when checking for credentials', async () => {
    let checkedPath = '';
    const adapter = createClaudeAdapter({
      env: { CLAUDE_CONFIG_DIR: '/custom/dir' },
      existsSync: (path: string) => {
        checkedPath = path;
        return true;
      },
      homedir: () => '/home/test',
    });
    await adapter.checkAuth(noopExec);
    expect(checkedPath).toContain('/custom/dir');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers/claude.test.ts`
Expected: FAIL — `src/providers/claude/adapter.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import { existsSync as realExistsSync } from 'node:fs';
import { homedir as realHomedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAdapter } from '../../discovery/types.js';

export interface ClaudeAdapterDeps {
  existsSync: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
}

export function createClaudeAdapter(
  deps: Partial<ClaudeAdapterDeps> = {}
): ProviderAdapter {
  const existsSync = deps.existsSync ?? realExistsSync;
  const env = deps.env ?? process.env;
  const homedir = deps.homedir ?? realHomedir;

  return {
    name: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
    async checkAuth() {
      if (env.ANTHROPIC_API_KEY) {
        return { status: 'yes', note: 'ANTHROPIC_API_KEY set' };
      }

      const credentialsPath = env.CLAUDE_CONFIG_DIR
        ? join(env.CLAUDE_CONFIG_DIR, '.credentials.json')
        : join(homedir(), '.claude', '.credentials.json');

      if (existsSync(credentialsPath)) {
        return { status: 'yes', note: 'credentials file found' };
      }

      return { status: 'no', note: 'no credentials file or ANTHROPIC_API_KEY' };
    },
  };
}

export const claudeAdapter = createClaudeAdapter();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers/claude.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude/adapter.ts tests/providers/claude.test.ts
git commit -m "feat: add claude provider adapter"
```

---

### Task 5: Codex provider adapter

**Files:**
- Create: `src/providers/codex/adapter.ts`
- Test: `tests/providers/codex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { codexAdapter } from '../../src/providers/codex/adapter.js';

describe('codex adapter', () => {
  it('has the expected command and name', () => {
    expect(codexAdapter.name).toBe('Codex');
    expect(codexAdapter.command).toBe('codex');
    expect(codexAdapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes on exit code 0', async () => {
    const result = await codexAdapter.checkAuth(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('yes');
  });

  it('reports authenticated no on exit code 1', async () => {
    const result = await codexAdapter.checkAuth(async () => ({
      code: 1,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('no');
  });

  it('reports authenticated unknown on an unexpected exit code', async () => {
    const result = await codexAdapter.checkAuth(async () => ({
      code: 127,
      stdout: '',
      stderr: 'unknown subcommand',
    }));
    expect(result.status).toBe('unknown');
    expect(result.note).toContain('127');
  });

  it('calls "codex login status"', async () => {
    let calledWith: [string, string[]] | undefined;
    await codexAdapter.checkAuth(async (cmd, args) => {
      calledWith = [cmd, args];
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(calledWith).toEqual(['codex', ['login', 'status']]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers/codex.test.ts`
Expected: FAIL — `src/providers/codex/adapter.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { ProviderAdapter } from '../../discovery/types.js';

export const codexAdapter: ProviderAdapter = {
  name: 'Codex',
  command: 'codex',
  versionArgs: ['--version'],
  parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
  async checkAuth(exec) {
    const result = await exec('codex', ['login', 'status'], { timeoutMs: 5000 });
    if (result.code === 0) return { status: 'yes' };
    if (result.code === 1) return { status: 'no' };
    return { status: 'unknown', note: `unexpected exit code ${result.code}` };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers/codex.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/codex/adapter.ts tests/providers/codex.test.ts
git commit -m "feat: add codex provider adapter"
```

---

### Task 6: Gemini CLI provider adapter

**Files:**
- Create: `src/providers/gemini/adapter.ts`
- Test: `tests/providers/gemini.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { geminiAdapter } from '../../src/providers/gemini/adapter.js';

describe('gemini adapter', () => {
  it('has the expected command and name', () => {
    expect(geminiAdapter.name).toBe('Gemini CLI');
    expect(geminiAdapter.command).toBe('gemini');
    expect(geminiAdapter.versionArgs).toEqual(['--version']);
  });

  it('reports authenticated yes on exit code 0', async () => {
    const result = await geminiAdapter.checkAuth(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('yes');
  });

  it('reports authenticated no on exit code 1', async () => {
    const result = await geminiAdapter.checkAuth(async () => ({
      code: 1,
      stdout: '',
      stderr: '',
    }));
    expect(result.status).toBe('no');
  });

  it('reports authenticated unknown on an unexpected exit code', async () => {
    const result = await geminiAdapter.checkAuth(async () => ({
      code: 127,
      stdout: '',
      stderr: 'unknown subcommand',
    }));
    expect(result.status).toBe('unknown');
  });

  it('calls "gemini auth status"', async () => {
    let calledWith: [string, string[]] | undefined;
    await geminiAdapter.checkAuth(async (cmd, args) => {
      calledWith = [cmd, args];
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(calledWith).toEqual(['gemini', ['auth', 'status']]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers/gemini.test.ts`
Expected: FAIL — `src/providers/gemini/adapter.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { ProviderAdapter } from '../../discovery/types.js';

export const geminiAdapter: ProviderAdapter = {
  name: 'Gemini CLI',
  command: 'gemini',
  versionArgs: ['--version'],
  parseVersion: (stdout) => stdout.trim().split('\n')[0]?.trim() || undefined,
  async checkAuth(exec) {
    const result = await exec('gemini', ['auth', 'status'], { timeoutMs: 5000 });
    if (result.code === 0) return { status: 'yes' };
    if (result.code === 1) return { status: 'no' };
    return { status: 'unknown', note: `unexpected exit code ${result.code}` };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers/gemini.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/gemini/adapter.ts tests/providers/gemini.test.ts
git commit -m "feat: add gemini provider adapter"
```

---

### Task 7: Provider registry

**Files:**
- Create: `src/providers/registry.ts`
- Test: `tests/providers/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { providerRegistry } from '../../src/providers/registry.js';

describe('providerRegistry', () => {
  it('lists exactly the 3 MVP providers in product-plan order', () => {
    expect(providerRegistry.map((a) => a.command)).toEqual([
      'claude',
      'codex',
      'gemini',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/providers/registry.test.ts`
Expected: FAIL — `src/providers/registry.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { ProviderAdapter } from '../discovery/types.js';
import { claudeAdapter } from './claude/adapter.js';
import { codexAdapter } from './codex/adapter.js';
import { geminiAdapter } from './gemini/adapter.js';

export const providerRegistry: ProviderAdapter[] = [
  claudeAdapter,
  codexAdapter,
  geminiAdapter,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/providers/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/registry.ts tests/providers/registry.test.ts
git commit -m "feat: add provider registry"
```

---

### Task 8: scanAll discovery function

**Files:**
- Create: `src/discovery/scan.ts`
- Test: `tests/discovery/scan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { scanAll } from '../../src/discovery/scan.js';
import type { ExecFn, ProviderAdapter } from '../../src/discovery/types.js';

function makeAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'Fake',
    command: 'fake',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim(),
    checkAuth: async () => ({ status: 'yes' }),
    ...overrides,
  };
}

describe('scanAll', () => {
  it('reports not installed when the version command fails', async () => {
    const adapter = makeAdapter({ command: 'missing' });
    const exec: ExecFn = async () => ({ code: -1, stdout: '', stderr: 'not found' });

    const [status] = await scanAll([adapter], exec);

    expect(status.installed).toBe(false);
    expect(status.authenticated).toBe('unknown');
    expect(status.error).toBe('not found');
  });

  it('reports installed, version, and auth status when the version command succeeds', async () => {
    const adapter = makeAdapter({
      checkAuth: async () => ({ status: 'yes', note: 'test note' }),
    });
    const exec: ExecFn = async (cmd, args) => {
      if (args[0] === '--version') return { code: 0, stdout: '1.2.3\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    };

    const [status] = await scanAll([adapter], exec);

    expect(status.installed).toBe(true);
    expect(status.version).toBe('1.2.3');
    expect(status.authenticated).toBe('yes');
    expect(status.authNote).toBe('test note');
  });

  it('downgrades a throwing checkAuth to unknown instead of failing the scan', async () => {
    const adapter = makeAdapter({
      checkAuth: async () => {
        throw new Error('boom');
      },
    });
    const exec: ExecFn = async () => ({ code: 0, stdout: '1.0.0', stderr: '' });

    const [status] = await scanAll([adapter], exec);

    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe('unknown');
    expect(status.authNote).toBe('boom');
  });

  it('preserves adapter order in the results', async () => {
    const a = makeAdapter({ name: 'A', command: 'a' });
    const b = makeAdapter({ name: 'B', command: 'b' });
    const exec: ExecFn = async () => ({ code: 0, stdout: '1.0.0', stderr: '' });

    const results = await scanAll([a, b], exec);

    expect(results.map((r) => r.name)).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discovery/scan.test.ts`
Expected: FAIL — `src/discovery/scan.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { ExecFn, ProviderAdapter, ProviderStatus } from './types.js';

export async function scanAll(
  adapters: ProviderAdapter[],
  exec: ExecFn
): Promise<ProviderStatus[]> {
  const results: ProviderStatus[] = [];
  for (const adapter of adapters) {
    results.push(await scanOne(adapter, exec));
  }
  return results;
}

async function scanOne(
  adapter: ProviderAdapter,
  exec: ExecFn
): Promise<ProviderStatus> {
  const versionResult = await exec(adapter.command, adapter.versionArgs, {
    timeoutMs: 5000,
  });

  if (versionResult.code !== 0) {
    return {
      name: adapter.name,
      command: adapter.command,
      installed: false,
      authenticated: 'unknown',
      error: versionResult.stderr || `exit code ${versionResult.code}`,
    };
  }

  const version = adapter.parseVersion?.(versionResult.stdout);

  let authenticated: ProviderStatus['authenticated'] = 'unknown';
  let authNote: string | undefined;
  try {
    const authResult = await adapter.checkAuth(exec);
    authenticated = authResult.status;
    authNote = authResult.note;
  } catch (err) {
    authenticated = 'unknown';
    authNote = err instanceof Error ? err.message : 'auth check threw';
  }

  return {
    name: adapter.name,
    command: adapter.command,
    installed: true,
    version,
    authenticated,
    authNote,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/discovery/scan.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/discovery/scan.ts tests/discovery/scan.test.ts
git commit -m "feat: add scanAll discovery function"
```

---

### Task 9: Report formatter

**Files:**
- Create: `src/report/format.ts`
- Test: `tests/report/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { formatReport } from '../../src/report/format.js';
import type { ProviderStatus } from '../../src/discovery/types.js';

describe('formatReport', () => {
  it('renders an installed, authenticated provider', () => {
    const statuses: ProviderStatus[] = [
      {
        name: 'Claude Code',
        command: 'claude',
        installed: true,
        version: '1.2.3',
        authenticated: 'yes',
        authNote: 'credentials file found',
      },
    ];

    const output = formatReport(statuses);

    expect(output).toContain('Scanning installed AI coding providers...');
    expect(output).toContain('✓ Claude Code');
    expect(output).toContain('Command: claude');
    expect(output).toContain('Installed: yes (1.2.3)');
    expect(output).toContain('Authenticated: yes (credentials file found)');
  });

  it('renders a not-detected provider without an auth line', () => {
    const statuses: ProviderStatus[] = [
      {
        name: 'Gemini CLI',
        command: 'gemini',
        installed: false,
        authenticated: 'unknown',
        error: 'command not found',
      },
    ];

    const output = formatReport(statuses);

    expect(output).toContain('✗ Gemini CLI');
    expect(output).toContain('Not detected');
    expect(output).not.toContain('Authenticated:');
  });

  it('renders unknown auth status plainly when there is no note', () => {
    const statuses: ProviderStatus[] = [
      {
        name: 'Codex',
        command: 'codex',
        installed: true,
        authenticated: 'unknown',
      },
    ];

    const output = formatReport(statuses);

    expect(output).toContain('Authenticated: unknown');
    expect(output).not.toContain('Authenticated: unknown (');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/report/format.test.ts`
Expected: FAIL — `src/report/format.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import type { ProviderStatus } from '../discovery/types.js';

export function formatReport(statuses: ProviderStatus[]): string {
  const lines: string[] = ['Scanning installed AI coding providers...', ''];

  for (const status of statuses) {
    if (!status.installed) {
      lines.push(`✗ ${status.name}`);
      lines.push('  Not detected');
      lines.push('');
      continue;
    }

    lines.push(`✓ ${status.name}`);
    lines.push(`  Command: ${status.command}`);
    lines.push(`  Installed: yes${status.version ? ` (${status.version})` : ''}`);
    const authSuffix = status.authNote ? ` (${status.authNote})` : '';
    lines.push(`  Authenticated: ${status.authenticated}${authSuffix}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/report/format.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/report/format.ts tests/report/format.test.ts
git commit -m "feat: add provider status report formatter"
```

---

### Task 10: Config writer

**Files:**
- Create: `src/config/writeConfig.ts`
- Test: `tests/config/writeConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { writeConfig } from '../../src/config/writeConfig.js';
import type { ProviderStatus } from '../../src/discovery/types.js';

const dirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-config-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const statuses: ProviderStatus[] = [
  { name: 'Claude Code', command: 'claude', installed: true, authenticated: 'yes' },
  { name: 'Codex', command: 'codex', installed: true, authenticated: 'no' },
  { name: 'Gemini CLI', command: 'gemini', installed: false, authenticated: 'unknown' },
];

describe('writeConfig', () => {
  it('creates .agentrail/{config.yaml,workflows,tasks,runs} when none exist', () => {
    const dir = makeTmpDir();

    const result = writeConfig(dir, statuses);

    expect(result.wrote).toBe(true);
    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.agentrail', 'workflows'))).toBe(true);
    expect(existsSync(join(dir, '.agentrail', 'tasks'))).toBe(true);
    expect(existsSync(join(dir, '.agentrail', 'runs'))).toBe(true);

    const content = yaml.load(
      readFileSync(join(dir, '.agentrail', 'config.yaml'), 'utf-8')
    ) as { providers: Record<string, Record<string, unknown>> };

    expect(content.providers.claude).toEqual({
      command: 'claude',
      installed: true,
      authenticated: 'yes',
    });
    expect(content.providers.gemini).toEqual({
      command: 'gemini',
      installed: false,
    });
  });

  it('does not overwrite an existing config.yaml without force', () => {
    const dir = makeTmpDir();
    writeConfig(dir, statuses);

    const second = writeConfig(dir, statuses);

    expect(second.wrote).toBe(false);
    expect(second.reason).toContain('already exists');
  });

  it('overwrites an existing config.yaml when force is true', () => {
    const dir = makeTmpDir();
    writeConfig(dir, statuses);

    const second = writeConfig(dir, statuses, { force: true });

    expect(second.wrote).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/writeConfig.test.ts`
Expected: FAIL — `src/config/writeConfig.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { ProviderStatus } from '../discovery/types.js';

export interface WriteConfigResult {
  wrote: boolean;
  path: string;
  reason?: string;
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

  mkdirSync(join(agentrailDir, 'workflows'), { recursive: true });
  mkdirSync(join(agentrailDir, 'tasks'), { recursive: true });
  mkdirSync(join(agentrailDir, 'runs'), { recursive: true });

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/writeConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/writeConfig.ts tests/config/writeConfig.test.ts
git commit -m "feat: add .agentrail/config.yaml writer"
```

---

### Task 11: CLI wiring (program.ts + cli.ts)

**Files:**
- Create: `src/program.ts`
- Create: `src/cli.ts`
- Test: `tests/program.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProgram } from '../src/program.js';
import type { ExecFn, ProviderAdapter } from '../src/discovery/types.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const fakeRegistry: ProviderAdapter[] = [
  {
    name: 'Fake Provider',
    command: 'fakecli',
    versionArgs: ['--version'],
    parseVersion: (stdout) => stdout.trim(),
    checkAuth: async () => ({ status: 'yes' }),
  },
];

const fakeExec: ExecFn = async (cmd) =>
  cmd === 'fakecli'
    ? { code: 0, stdout: '1.0.0', stderr: '' }
    : { code: -1, stdout: '', stderr: 'not found' };

describe('agentrail providers', () => {
  it('prints a report for the registered providers', async () => {
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'providers']);

    const text = output.join('');
    expect(text).toContain('✓ Fake Provider');
    expect(text).toContain('Authenticated: yes');
  });
});

describe('agentrail init', () => {
  it('writes .agentrail/config.yaml in the given cwd', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentrail-cli-'));
    dirs.push(dir);
    const output: string[] = [];
    const program = createProgram({
      exec: fakeExec,
      registry: fakeRegistry,
      cwd: () => dir,
      stdout: (t) => output.push(t),
    });

    await program.parseAsync(['node', 'agentrail', 'init']);

    expect(existsSync(join(dir, '.agentrail', 'config.yaml'))).toBe(true);
    expect(output.join('')).toContain('Wrote');
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
      });

    await makeProgram().parseAsync(['node', 'agentrail', 'init']);
    output.length = 0;
    await makeProgram().parseAsync(['node', 'agentrail', 'init']);

    expect(output.join('')).toContain('Skipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/program.test.ts`
Expected: FAIL — `src/program.ts` does not exist.

- [ ] **Step 3: Write src/program.ts**

```ts
import { Command } from 'commander';
import { scanAll } from './discovery/scan.js';
import { formatReport } from './report/format.js';
import { writeConfig } from './config/writeConfig.js';
import type { ExecFn, ProviderAdapter } from './discovery/types.js';

export interface ProgramDeps {
  exec: ExecFn;
  registry: ProviderAdapter[];
  cwd?: () => string;
  stdout?: (text: string) => void;
}

export function createProgram(deps: ProgramDeps): Command {
  const cwd = deps.cwd ?? (() => process.cwd());
  const write = deps.stdout ?? ((text: string) => process.stdout.write(text));

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

      const result = writeConfig(cwd(), statuses, { force: opts.force });
      if (result.wrote) {
        write(`Wrote ${result.path}\n`);
      } else {
        write(`Skipped: ${result.reason}\n`);
      }
    });

  return program;
}
```

- [ ] **Step 4: Write src/cli.ts**

```ts
#!/usr/bin/env node
import { createProgram } from './program.js';
import { realExec } from './discovery/exec.js';
import { providerRegistry } from './providers/registry.js';

createProgram({ exec: realExec, registry: providerRegistry }).parseAsync(
  process.argv
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/program.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/program.ts src/cli.ts tests/program.test.ts
git commit -m "feat: wire up agentrail providers and init CLI commands"
```

---

### Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All test files pass (exec, claude, codex, gemini, registry, scan, format, writeConfig, program).

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: `dist/` populated, no TypeScript errors.

- [ ] **Step 3: Manual smoke test — providers command**

Run: `node dist/cli.js providers`
Expected: Prints "Scanning installed AI coding providers..." followed by one block per provider (claude/codex/gemini), each showing `✓`/`✗`, install status, and (if installed) an `Authenticated:` line. Exact yes/no/unknown values depend on what's actually installed on this machine — verify the output is well-formed, not specific values.

- [ ] **Step 4: Manual smoke test — init command**

Run: `mkdir -p /tmp/agentrail-smoke && cd /tmp/agentrail-smoke && node <path-to-repo>/dist/cli.js init`
Expected: Same report printed, then `.agentrail/config.yaml` (+ `workflows/`, `tasks/`, `runs/`) created in `/tmp/agentrail-smoke`. Running it a second time without `--force` should print a `Skipped:` message and leave the file untouched.

- [ ] **Step 5: Clean up smoke test directory**

Run: `rm -rf /tmp/agentrail-smoke`

- [ ] **Step 6: Commit any final fixups (only if smoke testing revealed issues)**

If Steps 3–4 surfaced a bug, fix it, re-run the affected unit tests, then:

```bash
git add -A
git commit -m "fix: address issue found during provider discovery smoke test"
```

If no issues were found, skip this step — there is nothing to commit.
