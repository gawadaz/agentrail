export interface ProviderStep {
  name: string;
  provider: string;
  task: string;
}

export interface ShellStep {
  name: string;
  run: string;
}

export type WorkflowStep = ProviderStep | ShellStep;

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export function isShellStep(step: WorkflowStep): step is ShellStep {
  return 'run' in step;
}
