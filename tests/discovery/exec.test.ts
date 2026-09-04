import { describe, it, expect } from 'vitest';
import { realExec } from '../../src/discovery/exec.js';

describe('realExec', () => {
  it('captures stdout and exit code for a successful command', async () => {
    const result = await realExec(process.execPath, ['-e', 'console.log("hello")']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('resolves with code -1 when the command does not exist', async () => {
    const result = await realExec('this-command-does-not-exist-xyz', []);
    expect(result.code).toBe(-1);
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
