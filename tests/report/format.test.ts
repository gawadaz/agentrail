import { describe, it, expect } from 'vitest';
import { formatReport, formatWorkflowsReport } from '../../src/report/format.js';
import type { ProviderStatus } from '../../src/discovery/types.js';
import type { WorkflowListEntry } from '../../src/workflow/listWorkflows.js';

describe('formatReport', () => {
  it('renders an installed, authenticated provider', () => {
    const statuses: ProviderStatus[] = [
      {
        name: 'Claude Code',
        command: 'claude',
        installed: true,
        version: '1.2.3',
        authenticated: 'yes',
        authNote: 'credentials file found',
      },
    ];

    const output = formatReport(statuses);

    expect(output).toContain('Scanning installed AI coding providers...');
    expect(output).toContain('✓ Claude Code');
    expect(output).toContain('Command: claude');
    expect(output).toContain('Installed: yes (1.2.3)');
    expect(output).toContain('Authenticated: yes (credentials file found)');
  });

  it('renders a not-detected provider without an auth line', () => {
    const statuses: ProviderStatus[] = [
      {
        name: 'Gemini CLI',
        command: 'gemini',
        installed: false,
        authenticated: 'unknown',
        error: 'command not found',
      },
    ];

    const output = formatReport(statuses);

    expect(output).toContain('✗ Gemini CLI');
    expect(output).toContain('Not detected');
    expect(output).not.toContain('Authenticated:');
  });

  it('renders unknown auth status plainly when there is no note', () => {
    const statuses: ProviderStatus[] = [
      {
        name: 'Codex',
        command: 'codex',
        installed: true,
        authenticated: 'unknown',
      },
    ];

    const output = formatReport(statuses);

    expect(output).toContain('Authenticated: unknown');
    expect(output).not.toContain('Authenticated: unknown (');
  });
});

describe('formatWorkflowsReport', () => {
  it('reports when no workflows are found', () => {
    expect(formatWorkflowsReport([])).toBe('No workflows found in .agentrail/workflows/\n');
  });

  it('renders a valid workflow with a checkmark', () => {
    const entries: WorkflowListEntry[] = [
      { name: 'feature', path: '/proj/.agentrail/workflows/feature.yaml', valid: true },
    ];

    expect(formatWorkflowsReport(entries)).toBe('✓ feature\n');
  });

  it('renders an invalid workflow with its errors indented', () => {
    const entries: WorkflowListEntry[] = [
      {
        name: 'broken',
        path: '/proj/.agentrail/workflows/broken.yaml',
        valid: false,
        errors: ['"steps" is required and must be a non-empty array'],
      },
    ];

    const output = formatWorkflowsReport(entries);
    expect(output).toContain('✗ broken');
    expect(output).toContain('  "steps" is required and must be a non-empty array');
  });
});
