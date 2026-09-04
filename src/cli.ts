#!/usr/bin/env node
import { createProgram } from './program.js';
import { realExec } from './discovery/exec.js';
import { providerRegistry } from './providers/registry.js';

createProgram({ exec: realExec, registry: providerRegistry }).parseAsync(
  process.argv
);
