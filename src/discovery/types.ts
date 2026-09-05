export type AuthStatus = 'yes' | 'no' | 'unknown';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ExecFn = (
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number }
) => Promise<ExecResult>;

export interface ProviderStatus {
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  authenticated: AuthStatus;
  authNote?: string;
  error?: string;
}

export interface AuthCheckResult {
  status: AuthStatus;
  note?: string;
}

export interface ProviderAdapter {
  name: string;
  command: string;
  versionArgs: string[];
  parseVersion?: (stdout: string) => string | undefined;
  checkAuth: (exec: ExecFn) => Promise<AuthCheckResult>;
  execute: (prompt: string, exec: ExecFn) => Promise<ExecResult>;
}
