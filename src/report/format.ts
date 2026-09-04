import type { ProviderStatus } from '../discovery/types.js';
import type { WorkflowListEntry } from '../workflow/listWorkflows.js';

export function formatReport(statuses: ProviderStatus[]): string {
  const lines: string[] = ['Scanning installed AI coding providers...', ''];

  for (const status of statuses) {
    if (!status.installed) {
      lines.push(`✗ ${status.name}`);
      lines.push('  Not detected');
      lines.push('');
      continue;
    }

    lines.push(`✓ ${status.name}`);
    lines.push(`  Command: ${status.command}`);
    lines.push(`  Installed: yes${status.version ? ` (${status.version})` : ''}`);
    const authSuffix = status.authNote ? ` (${status.authNote})` : '';
    lines.push(`  Authenticated: ${status.authenticated}${authSuffix}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function formatWorkflowsReport(entries: WorkflowListEntry[]): string {
  if (entries.length === 0) {
    return 'No workflows found in .agentrail/workflows/\n';
  }

  const lines: string[] = [];

  for (const entry of entries) {
    if (entry.valid) {
      lines.push(`✓ ${entry.name}`);
      continue;
    }
    lines.push(`✗ ${entry.name}`);
    for (const error of entry.errors ?? []) {
      lines.push(`  ${error}`);
    }
  }

  return lines.join('\n') + '\n';
}
