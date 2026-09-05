import type { ExecFn, ExecResult } from '../discovery/types.js';

export async function runShellCommand(
  command: string,
  exec: ExecFn,
  opts?: { timeoutMs?: number; platform?: NodeJS.Platform }
): Promise<ExecResult> {
  const platform = opts?.platform ?? process.platform;
  const execOpts = opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : undefined;

  if (platform === 'win32') {
    return exec('cmd', ['/c', command], execOpts);
  }
  return exec('sh', ['-c', command], execOpts);
}
