import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { writeConfig } from '../../src/config/writeConfig.js';
import { resolveTemplatesDir } from '../../src/config/writeConfig.js';
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

describe('writeConfig template scaffolding', () => {
  it('copies starter workflow templates into .agentrail/workflows on a fresh init', () => {
    const dir = makeTmpDir();

    writeConfig(dir, statuses);

    const workflowsDir = join(dir, '.agentrail', 'workflows');
    expect(existsSync(join(workflowsDir, 'feature.yaml'))).toBe(true);
    expect(existsSync(join(workflowsDir, 'bugfix.yaml'))).toBe(true);
    expect(existsSync(join(workflowsDir, 'review.yaml'))).toBe(true);

    const feature = yaml.load(
      readFileSync(join(workflowsDir, 'feature.yaml'), 'utf-8')
    ) as { name: string };
    expect(feature.name).toBe('feature');
  });

  it('resolves templates when they sit directly beside the module (bundled skill layout)', () => {
    const fakeSkillDir = makeTmpDir();
    const wf = join(fakeSkillDir, 'templates', 'workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'feature.yaml'), 'name: feature\nsteps: []\n');

    const resolved = resolveTemplatesDir(fakeSkillDir);

    expect(resolved).toBe(wf);
  });

  it('does not overwrite an existing workflow file, even with force', () => {
    const dir = makeTmpDir();
    writeConfig(dir, statuses);

    const featurePath = join(dir, '.agentrail', 'workflows', 'feature.yaml');
    writeFileSync(featurePath, 'name: my-custom-feature\nsteps: []\n');

    writeConfig(dir, statuses, { force: true });

    expect(readFileSync(featurePath, 'utf-8')).toBe('name: my-custom-feature\nsteps: []\n');
  });
});
