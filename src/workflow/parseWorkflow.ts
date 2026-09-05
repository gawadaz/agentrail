import type { Workflow, WorkflowStep } from './types.js';

export type ParseWorkflowResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; errors: string[] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

export function parseWorkflow(raw: unknown): ParseWorkflowResult {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['workflow must be a YAML mapping (object) at the top level'] };
  }

  const errors: string[] = [];

  if (!isNonEmptyString(raw.name)) {
    errors.push('"name" is required and must be a non-empty string');
  }

  const rawSteps = raw.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    errors.push('"steps" is required and must be a non-empty array');
    return { ok: false, errors };
  }

  const steps: WorkflowStep[] = [];
  const seenNames = new Set<string>();

  rawSteps.forEach((rawStep, index) => {
    const label = `step ${index + 1}`;

    if (!isPlainObject(rawStep)) {
      errors.push(`${label}: must be a YAML mapping (object)`);
      return;
    }

    const hasName = isNonEmptyString(rawStep.name);
    const stepLabel = hasName ? `${label} ("${rawStep.name}")` : label;

    if (!hasName) {
      errors.push(`${label}: "name" is required and must be a non-empty string`);
    } else if (seenNames.has(rawStep.name as string)) {
      errors.push(`${stepLabel}: duplicate step name "${rawStep.name}"`);
    } else {
      seenNames.add(rawStep.name as string);
    }

    const hasRun = 'run' in rawStep;
    const hasProvider = 'provider' in rawStep;
    const hasTask = 'task' in rawStep;

    if (hasRun && (hasProvider || hasTask)) {
      errors.push(`${stepLabel}: must have either "run" or both "provider" and "task", not both`);
      return;
    }

    if (hasRun) {
      if (!isNonEmptyString(rawStep.run)) {
        errors.push(`${stepLabel}: "run" must be a non-empty string`);
        return;
      }
      if ('context' in rawStep) {
        errors.push(`${stepLabel}: "context" is only valid on provider steps, not "run" steps`);
        return;
      }
      let output: string | undefined;
      if ('output' in rawStep) {
        if (!isNonEmptyString(rawStep.output)) {
          errors.push(`${stepLabel}: "output" must be a non-empty string`);
          return;
        }
        output = rawStep.output;
      }
      if (hasName) {
        steps.push({
          name: rawStep.name as string,
          run: rawStep.run as string,
          ...(output !== undefined ? { output } : {}),
        });
      }
      return;
    }

    if (hasProvider || hasTask) {
      const providerOk = isNonEmptyString(rawStep.provider);
      const taskOk = isNonEmptyString(rawStep.task);
      if (!providerOk) {
        errors.push(`${stepLabel}: "provider" is required and must be a non-empty string`);
      }
      if (!taskOk) {
        errors.push(`${stepLabel}: "task" is required and must be a non-empty string`);
      }

      let output: string | undefined;
      if ('output' in rawStep) {
        if (!isNonEmptyString(rawStep.output)) {
          errors.push(`${stepLabel}: "output" must be a non-empty string`);
        } else {
          output = rawStep.output;
        }
      }

      let context: string[] | undefined;
      if ('context' in rawStep) {
        if (!isStringArray(rawStep.context)) {
          errors.push(`${stepLabel}: "context" must be an array of non-empty strings`);
        } else {
          context = rawStep.context;
        }
      }

      if (hasName && providerOk && taskOk && !errors.some((e) => e.startsWith(stepLabel))) {
        steps.push({
          name: rawStep.name as string,
          provider: rawStep.provider as string,
          task: rawStep.task as string,
          ...(output !== undefined ? { output } : {}),
          ...(context !== undefined ? { context } : {}),
        });
      }
      return;
    }

    errors.push(`${stepLabel}: must have either "run" or both "provider" and "task"`);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, workflow: { name: raw.name as string, steps } };
}
