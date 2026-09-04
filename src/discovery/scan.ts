import type { ExecFn, ProviderAdapter, ProviderStatus } from './types.js';

export async function scanAll(
  adapters: ProviderAdapter[],
  exec: ExecFn
): Promise<ProviderStatus[]> {
  const results: ProviderStatus[] = [];
  for (const adapter of adapters) {
    results.push(await scanOne(adapter, exec));
  }
  return results;
}

async function scanOne(
  adapter: ProviderAdapter,
  exec: ExecFn
): Promise<ProviderStatus> {
  const versionResult = await exec(adapter.command, adapter.versionArgs, {
    timeoutMs: 5000,
  });

  if (versionResult.code !== 0) {
    return {
      name: adapter.name,
      command: adapter.command,
      installed: false,
      authenticated: 'unknown',
      error: versionResult.stderr || `exit code ${versionResult.code}`,
    };
  }

  const version = adapter.parseVersion?.(versionResult.stdout);

  let authenticated: ProviderStatus['authenticated'] = 'unknown';
  let authNote: string | undefined;
  try {
    const authResult = await adapter.checkAuth(exec);
    authenticated = authResult.status;
    authNote = authResult.note;
  } catch (err) {
    authenticated = 'unknown';
    authNote = err instanceof Error ? err.message : 'auth check threw';
  }

  return {
    name: adapter.name,
    command: adapter.command,
    installed: true,
    version,
    authenticated,
    authNote,
  };
}
