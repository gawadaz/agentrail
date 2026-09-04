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
