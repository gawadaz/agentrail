import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRunContext,
  updateProgress,
  writeStepOutput,
  readContextFiles,
  writeFinalSummary,
} from '../../src/context/runContext.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-runcontext-'));
  dirs.push(dir);
  return dir;
}

const fixedNow = () => new Date(2026, 8, 5, 14, 30, 22);

describe('createRunContext', () => {
  it('creates the run directory, task.md, and initial progress.json', () => {
    const dir = makeTmpDir();

    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan', 'implement'], fixedNow);

    expect(ctx.runId).toBe('2026-09-05T143022');
    expect(ctx.runDir).toBe(join(dir, '.agentrail', 'runs', '2026-09-05T143022'));
    expect(existsSync(ctx.runDir)).toBe(true);
    expect(readFileSync(join(ctx.runDir, 'task.md'), 'utf-8')).toBe('add dark mode');

    const progress = JSON.parse(readFileSync(join(ctx.runDir, 'progress.json'), 'utf-8'));
    expect(progress.workflow).toBe('feature');
    expect(progress.task).toBe('add dark mode');
    expect(progress.startedAt).toBe(fixedNow().toISOString());
    expect(progress.steps).toEqual([
      { name: 'plan', status: 'pending' },
      { name: 'implement', status: 'pending' },
    ]);
  });
});

describe('updateProgress', () => {
  it('updates a step status and output in progress.json', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    updateProgress(ctx, 'plan', 'running');
    let progress = JSON.parse(readFileSync(join(ctx.runDir, 'progress.json'), 'utf-8'));
    expect(progress.steps[0]).toEqual({ name: 'plan', status: 'running' });

    updateProgress(ctx, 'plan', 'success', 'plan.md');
    progress = JSON.parse(readFileSync(join(ctx.runDir, 'progress.json'), 'utf-8'));
    expect(progress.steps[0]).toEqual({ name: 'plan', status: 'success', output: 'plan.md' });
  });
});

describe('writeStepOutput', () => {
  it('writes a file into the run directory', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    writeStepOutput(ctx, 'plan.md', '1. do the thing');

    expect(readFileSync(join(ctx.runDir, 'plan.md'), 'utf-8')).toBe('1. do the thing');
  });
});

describe('readContextFiles', () => {
  it('returns file contents keyed by filename when all names exist', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['analyze', 'plan'], fixedNow);
    writeStepOutput(ctx, 'requirements.md', '1. support dark mode');

    const result = readContextFiles(ctx, ['requirements']);

    expect(result).toEqual({
      ok: true,
      content: new Map([['requirements.md', '1. support dark mode']]),
    });
  });

  it('returns the first missing name when a context file does not exist', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    const result = readContextFiles(ctx, ['requirements']);

    expect(result).toEqual({ ok: false, missing: 'requirements' });
  });

  it('returns an empty map for an empty names list', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    const result = readContextFiles(ctx, []);

    expect(result).toEqual({ ok: true, content: new Map() });
  });
});

describe('writeFinalSummary', () => {
  it('writes final-summary.md into the run directory', () => {
    const dir = makeTmpDir();
    const ctx = createRunContext(dir, 'feature', 'add dark mode', ['plan'], fixedNow);

    writeFinalSummary(ctx, 'Workflow "feature" completed — 1/1 steps succeeded.\n');

    expect(readFileSync(join(ctx.runDir, 'final-summary.md'), 'utf-8')).toBe(
      'Workflow "feature" completed — 1/1 steps succeeded.\n'
    );
  });
});
