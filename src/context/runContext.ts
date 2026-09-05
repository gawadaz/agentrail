import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RunContext {
  runId: string;
  runDir: string;
}

export interface ProgressStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  output?: string;
}

interface ProgressFile {
  workflow: string;
  task: string;
  startedAt: string;
  steps: ProgressStep[];
}

function formatRunId(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function progressPath(ctx: RunContext): string {
  return join(ctx.runDir, 'progress.json');
}

function readProgress(ctx: RunContext): ProgressFile {
  return JSON.parse(readFileSync(progressPath(ctx), 'utf-8')) as ProgressFile;
}

function writeProgress(ctx: RunContext, progress: ProgressFile): void {
  writeFileSync(progressPath(ctx), JSON.stringify(progress, null, 2), 'utf-8');
}

export function createRunContext(
  cwd: string,
  workflowName: string,
  task: string,
  stepNames: string[],
  now: () => Date = () => new Date()
): RunContext {
  const date = now();
  const runId = formatRunId(date);
  const runDir = join(cwd, '.agentrail', 'runs', runId);
  mkdirSync(runDir, { recursive: true });

  writeFileSync(join(runDir, 'task.md'), task, 'utf-8');

  const ctx: RunContext = { runId, runDir };
  writeProgress(ctx, {
    workflow: workflowName,
    task,
    startedAt: date.toISOString(),
    steps: stepNames.map((name) => ({ name, status: 'pending' })),
  });

  return ctx;
}

export function updateProgress(
  ctx: RunContext,
  stepName: string,
  status: ProgressStep['status'],
  output?: string
): void {
  const progress = readProgress(ctx);
  const step = progress.steps.find((s) => s.name === stepName);
  if (step) {
    step.status = status;
    if (output !== undefined) step.output = output;
  }
  writeProgress(ctx, progress);
}

export function writeStepOutput(ctx: RunContext, filename: string, content: string): void {
  writeFileSync(join(ctx.runDir, filename), content, 'utf-8');
}

export type ReadContextResult =
  | { ok: true; content: Map<string, string> }
  | { ok: false; missing: string };

export function readContextFiles(ctx: RunContext, names: string[]): ReadContextResult {
  const content = new Map<string, string>();
  for (const name of names) {
    const filename = `${name}.md`;
    const path = join(ctx.runDir, filename);
    if (!existsSync(path)) {
      return { ok: false, missing: name };
    }
    content.set(filename, readFileSync(path, 'utf-8'));
  }
  return { ok: true, content };
}

export function writeFinalSummary(ctx: RunContext, text: string): void {
  writeFileSync(join(ctx.runDir, 'final-summary.md'), text, 'utf-8');
}
