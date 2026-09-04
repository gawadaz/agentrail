import { Command } from 'commander';
import { scanAll } from './discovery/scan.js';
import { formatReport } from './report/format.js';
import { writeConfig } from './config/writeConfig.js';
import type { ExecFn, ProviderAdapter } from './discovery/types.js';

export interface ProgramDeps {
  exec: ExecFn;
  registry: ProviderAdapter[];
  cwd?: () => string;
  stdout?: (text: string) => void;
}

export function createProgram(deps: ProgramDeps): Command {
  const cwd = deps.cwd ?? (() => process.cwd());
  const write = deps.stdout ?? ((text: string) => process.stdout.write(text));

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
    .command('init')
    .description('Scan for providers and scaffold .agentrail/config.yaml')
    .option('--force', 'overwrite an existing .agentrail/config.yaml')
    .action(async (opts: { force?: boolean }) => {
      const statuses = await scanAll(deps.registry, deps.exec);
      write(formatReport(statuses));

      const result = writeConfig(cwd(), statuses, { force: opts.force });
      if (result.wrote) {
        write(`Wrote ${result.path}\n`);
      } else {
        write(`Skipped: ${result.reason}\n`);
      }
    });

  return program;
}
