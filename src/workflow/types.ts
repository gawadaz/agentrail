export interface ProviderStep {
  name: string;
  provider: string;
  task: string;
  output?: string;
  context?: string[];
}

export interface ShellStep {
  name: string;
  run: string;
  output?: string;
}

export type WorkflowStep = ProviderStep | ShellStep;

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export function isShellStep(step: WorkflowStep): step is ShellStep {
  return 'run' in step;
}
