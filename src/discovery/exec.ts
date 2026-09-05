import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import type { ExecFn, ExecResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 5000;
const IS_WINDOWS = process.platform === 'win32';

// On Windows, npm-installed global CLIs are .cmd/.bat shims that can only be
// spawned via a shell (shell:false throws EINVAL for them). Passing cmd/args
// as an array with shell:true doesn't quote the file argument, so paths with
// spaces (e.g. "C:\Program Files\...") get mis-split — build one quoted
// command-line string ourselves instead and let cmd.exe parse it as a whole.
function winQuote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function killChild(child: ChildProcess): void {
  // With shell:true on Windows, child.kill() only terminates the cmd.exe
  // wrapper, leaving the real process running — kill the whole tree instead.
  if (IS_WINDOWS && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    return;
  }
  child.kill();
}

export const realExec: ExecFn = (cmd, args, opts) => {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ExecResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const child = IS_WINDOWS
      ? spawn([cmd, ...args].map(winQuote).join(' '), [], { shell: true })
      : spawn(cmd, args, { shell: false });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killChild(child);
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
