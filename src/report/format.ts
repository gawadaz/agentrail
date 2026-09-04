import type { ProviderStatus } from '../discovery/types.js';

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
