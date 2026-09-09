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

    const listing = execFileSync('node', [cliPath, 'workflows'], {
      encoding: 'utf-8',
      cwd: outDir,
    });
    expect(listing).toContain('No workflows found');
  });
});
