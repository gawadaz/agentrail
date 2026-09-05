import type { ExecFn, ProviderAdapter } from '../discovery/types.js';
import type { Workflow, ProviderStep, ShellStep } from '../workflow/types.js';
import { isShellStep } from '../workflow/types.js';
import { buildPrompt } from './buildPrompt.js';
import { runShellCommand } from './runShellCommand.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../providers/constants.js';
import {
  createRunContext,
  updateProgress,
  writeStepOutput,
  readContextFiles,
  writeFinalSummary,
} from '../context/runContext.js';

export interface RunWorkflowDeps {
  registry: ProviderAdapter[];
  exec: ExecFn;
  write: (text: string) => void;
  cwd: string;
}

export interface RunWorkflowResult {
  ok: boolean;
  stepsRun: number;
  failedStep?: string;
  runId: string;
  runDir: string;
}

function outputFilename(step: ProviderStep | ShellStep): string {
  return step.output ?? `${step.name}.md`;
}

export async function runWorkflow(
  workflow: Workflow,
  taskDescription: string,
  deps: RunWorkflowDeps
): Promise<RunWorkflowResult> {
  const total = workflow.steps.length;
  const ctx = createRunContext(
    deps.cwd,
    workflow.name,
    taskDescription,
    workflow.steps.map((s) => s.name)
  );

  const fail = (index: number, stepName: string): RunWorkflowResult => {
    updateProgress(ctx, stepName, 'failed');
    writeFinalSummary(
      ctx,
      `Workflow "${workflow.name}" failed at step "${stepName}" (${index + 1}/${total}).\n`
    );
    return { ok: false, stepsRun: index, failedStep: stepName, runId: ctx.runId, runDir: ctx.runDir };
  };

  for (let i = 0; i < total; i++) {
    const step = workflow.steps[i];
    const n = i + 1;
    deps.write(`→ Step ${n}/${total}: ${step.name}\n`);
    updateProgress(ctx, step.name, 'running');

    if (isShellStep(step)) {
      const result = await runShellCommand(step.run, deps.exec, {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });

      if (result.code !== 0) {
        deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
        if (result.stderr) deps.write(result.stderr + '\n');
        return fail(i, step.name);
      }

      if (result.stdout) deps.write(result.stdout + '\n');
      const filename = outputFilename(step);
      writeStepOutput(ctx, filename, result.stdout);
      updateProgress(ctx, step.name, 'success', filename);
      deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
      continue;
    }

    const adapter = deps.registry.find(
      (p) => p.command === step.provider || p.name === step.provider
    );
    if (!adapter) {
      deps.write(
        `✗ Step ${n}/${total} ("${step.name}") failed: provider "${step.provider}" is not registered\n`
      );
      return fail(i, step.name);
    }

    const contextResult = readContextFiles(ctx, step.context ?? []);
    if (!contextResult.ok) {
      deps.write(
        `✗ Step ${n}/${total} ("${step.name}") failed: context file "${contextResult.missing}.md" not found\n`
      );
      return fail(i, step.name);
    }

    const prompt = buildPrompt(workflow.name, taskDescription, step, contextResult.content);
    const result = await adapter.execute(prompt, deps.exec);

    if (result.code !== 0) {
      deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
      if (result.stderr) deps.write(result.stderr + '\n');
      return fail(i, step.name);
    }

    if (result.stdout) deps.write(result.stdout + '\n');
    const filename = outputFilename(step);
    writeStepOutput(ctx, filename, result.stdout);
    updateProgress(ctx, step.name, 'success', filename);
    deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
  }

  const summary =
    `Workflow "${workflow.name}" completed — ${total}/${total} steps succeeded.\n\n` +
    'AgentRail does not commit or push automatically. Please review the changes before committing.\n';
  deps.write(summary);
  writeFinalSummary(ctx, summary);

  return { ok: true, stepsRun: total, runId: ctx.runId, runDir: ctx.runDir };
}
