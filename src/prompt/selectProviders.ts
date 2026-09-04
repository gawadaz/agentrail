import type { ProviderStatus } from '../discovery/types.js';

export interface ProviderChoice {
  name: string;
  value: string;
  checked: boolean;
}

export function buildChoices(statuses: ProviderStatus[]): ProviderChoice[] {
  return statuses.map((status) => ({
    name: `${status.name} (${status.installed ? 'detected' : 'not detected'})`,
    value: status.command,
    checked: false,
  }));
}

export type CheckboxPrompt = (choices: ProviderChoice[]) => Promise<string[]>;

export async function selectProviders(
  statuses: ProviderStatus[],
  prompt: CheckboxPrompt
): Promise<ProviderStatus[]> {
  const selectedCommands = await prompt(buildChoices(statuses));
  const selectedSet = new Set(selectedCommands);
  return statuses.filter((status) => selectedSet.has(status.command));
}
