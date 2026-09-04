import { spawn } from 'node:child_process';
import type { ExecFn, ExecResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 5000;

export const realExec: ExecFn = (cmd, args, opts) => {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ExecResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(cmd, args, { shell: false });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ code: -1, stdout, stderr: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
};
