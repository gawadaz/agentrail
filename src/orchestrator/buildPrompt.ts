import type { ProviderStep } from '../workflow/types.js';

export function buildPrompt(
  workflowName: string,
  taskDescription: string,
  step: ProviderStep,
  context: Map<string, string>
): string {
  const contextText =
    context.size === 0
      ? '(none — this is the first step)'
      : Array.from(context.entries())
          .map(([filename, content]) => `--- ${filename} ---\n${content}`)
          .join('\n\n');

  return (
    `You are running the "${step.task}" step of the "${workflowName}" workflow.\n\n` +
    `Overall task: ${taskDescription}\n\n` +
    `Context:\n\n` +
    contextText
  );
}
