import { Command } from 'commander';
import { scanAll } from './discovery/scan.js';
import { formatReport } from './report/format.js';
import { writeConfig } from './config/writeConfig.js';
import { listWorkflows } from './workflow/listWorkflows.js';
import { formatWorkflowsReport } from './report/format.js';
import { loadWorkflow } from './workflow/loadWorkflow.js';
import { runWorkflow } from './orchestrator/runWorkflow.js';
import type { ExecFn, ProviderAdapter, ProviderStatus } from './discovery/types.js';

export interface ProgramDeps {
  exec: ExecFn;
  registry: ProviderAdapter[];
  cwd?: () => string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  isInteractive?: () => boolean;
  promptSelect?: (statuses: ProviderStatus[]) => Promise<ProviderStatus[]>;
}

export function createProgram(deps: ProgramDeps): Command {
  const cwd = deps.cwd ?? (() => process.cwd());
  const write = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const writeErr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const isInteractive =
    deps.isInteractive ??
    (() => Boolean(process.stdout.isTTY && process.stdin.isTTY));
  const promptSelect =
    deps.promptSelect ??
    (() => {
      throw new Error('promptSelect must be provided to run agentrail init');
    });

  const program = new Command();
  program
    .name('agentrail')
    .description('Workflow-as-code orchestration for local AI coding CLIs');

  program
    .command('providers')
    .description('Scan for installed and authenticated AI coding providers')
    .action(async () => {
      const statuses = await scanAll(deps.registry, deps.exec);
      write(formatReport(statuses));
    });

  program
    .command('workflows')
    .description('List workflows defined in .agentrail/workflows/')
    .action(() => {
      const entries = listWorkflows(cwd());
      write(formatWorkflowsReport(entries));
    });

  program
    .command('run')
    .description('Run a workflow against real provider CLIs and shell commands')
    .argument('<workflow>', 'workflow name (from .agentrail/workflows/<name>.yaml)')
    .argument('<task>', 'task description passed to every provider step')
    .action(async (workflowName: string, task: string) => {
      const loaded = loadWorkflow(cwd(), workflowName);
      if (!loaded.ok) {
        writeErr(loaded.errors.join('\n') + '\n');
        program.error(`Failed to load workflow "${workflowName}"`);
        return;
      }

      const result = await runWorkflow(loaded.workflow, task, {
        registry: deps.registry,
        exec: deps.exec,
        write,
        cwd: cwd(),
      });

      write(`Run files written to ${result.runDir}\n`);

      if (!result.ok) {
        process.exitCode = 1;
      }
    });

  program
    .command('init')
    .description('Scan for providers and scaffold .agentrail/config.yaml')
    .option('--force', 'overwrite an existing .agentrail/config.yaml')
    .action(async (opts: { force?: boolean }) => {
      const statuses = await scanAll(deps.registry, deps.exec);
      write(formatReport(statuses));

      if (!isInteractive()) {
        writeErr(
          'agentrail init requires an interactive terminal to select providers; re-run in a TTY.\n'
        );
        program.error('init requires an interactive terminal');
        return;
      }

      const selected: ProviderStatus[] = await promptSelect(statuses);

      const result = writeConfig(cwd(), selected, { force: opts.force });
      if (result.wrote) {
        write(`Wrote ${result.path}\n`);
      } else {
        write(`Skipped: ${result.reason}\n`);
      }
    });

  return program;
}
