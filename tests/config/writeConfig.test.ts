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
