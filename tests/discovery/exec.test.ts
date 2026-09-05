import { describe, it, expect } from 'vitest';
import { realExec } from '../../src/discovery/exec.js';

describe('realExec', () => {
  it('captures stdout and exit code for a successful command', async () => {
    const result = await realExec(process.execPath, ['-e', 'console.log("hello")']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('resolves with a non-zero code when the command does not exist', async () => {
    // On Windows this goes through cmd.exe (needed to resolve .cmd/.bat
    // shims), which reports an unrecognized command as exit code 1 rather
    // than an ENOENT spawn error.
    const result = await realExec('this-command-does-not-exist-xyz', []);
    expect(result.code).not.toBe(0);
  });

  it('times out long-running commands', async () => {
    const result = await realExec(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      { timeoutMs: 200 }
    );
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain('Timed out');
  }, 2000);
});
