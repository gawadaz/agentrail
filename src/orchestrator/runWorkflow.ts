import type { ExecFn, ProviderAdapter } from '../discovery/types.js';
import type { Workflow } from '../workflow/types.js';
import { isShellStep } from '../workflow/types.js';
import { buildPrompt } from './buildPrompt.js';
import { runShellCommand } from './runShellCommand.js';
import { PROVIDER_EXECUTE_TIMEOUT_MS } from '../providers/constants.js';

export interface RunWorkflowDeps {
  registry: ProviderAdapter[];
  exec: ExecFn;
  write: (text: string) => void;
}

export interface RunWorkflowResult {
  ok: boolean;
  stepsRun: number;
  failedStep?: string;
}

export async function runWorkflow(
  workflow: Workflow,
  taskDescription: string,
  deps: RunWorkflowDeps
): Promise<RunWorkflowResult> {
  const total = workflow.steps.length;
  let context = '';

  for (let i = 0; i < total; i++) {
    const step = workflow.steps[i];
    const n = i + 1;
    deps.write(`→ Step ${n}/${total}: ${step.name}\n`);

    if (isShellStep(step)) {
      const result = await runShellCommand(step.run, deps.exec, {
        timeoutMs: PROVIDER_EXECUTE_TIMEOUT_MS,
      });

      if (result.code !== 0) {
        deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
        if (result.stderr) deps.write(result.stderr + '\n');
        return { ok: false, stepsRun: i, failedStep: step.name };
      }

      if (result.stdout) deps.write(result.stdout + '\n');
      context += `\n\n--- ${step.name} ---\n${result.stdout}`;
      deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
      continue;
    }

    const adapter = deps.registry.find((p) => p.command === step.provider || p.name === step.provider);
    if (!adapter) {
      deps.write(`✗ Step ${n}/${total} ("${step.name}") failed: provider "${step.provider}" is not registered\n`);
      return { ok: false, stepsRun: i, failedStep: step.name };
    }

    const prompt = buildPrompt(workflow.name, taskDescription, step, context);
    const result = await adapter.execute(prompt, deps.exec);

    if (result.code !== 0) {
      deps.write(`✗ Step ${n}/${total} ("${step.name}") failed (exit ${result.code})\n`);
      if (result.stderr) deps.write(result.stderr + '\n');
      return { ok: false, stepsRun: i, failedStep: step.name };
    }

    if (result.stdout) deps.write(result.stdout + '\n');
    context += `\n\n--- ${step.name} ---\n${result.stdout}`;
    deps.write(`✓ Step ${n}/${total} ("${step.name}") completed\n`);
  }

  deps.write(
    `Workflow "${workflow.name}" completed — ${total}/${total} steps succeeded.\n\n` +
      'AgentRail does not commit or push automatically. Please review the changes before committing.\n'
  );

  return { ok: true, stepsRun: total };
}
