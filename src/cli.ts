#!/usr/bin/env node
import { checkbox } from '@inquirer/prompts';
import { createProgram } from './program.js';
import { realExec } from './discovery/exec.js';
import { providerRegistry } from './providers/registry.js';
import { selectProviders } from './prompt/selectProviders.js';
import type { ProviderStatus } from './discovery/types.js';

createProgram({
  exec: realExec,
  registry: providerRegistry,
  promptSelect: (statuses: ProviderStatus[]) =>
    selectProviders(statuses, (choices) =>
      checkbox({ message: 'Select providers to enable', choices })
    ),
}).parseAsync(process.argv);
