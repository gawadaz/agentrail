import type { ProviderStep } from '../workflow/types.js';

export function buildPrompt(
  workflowName: string,
  taskDescription: string,
  step: ProviderStep,
  priorContext: string
): string {
  const context = priorContext || '(none — this is the first step)';

  return (
    `You are running the "${step.task}" step of the "${workflowName}" workflow.\n\n` +
    `Overall task: ${taskDescription}\n\n` +
    `Prior step output:\n` +
    context
  );
}
