import type { ProviderAdapter } from '../discovery/types.js';
import { claudeAdapter } from './claude/adapter.js';
import { codexAdapter } from './codex/adapter.js';
import { geminiAdapter } from './gemini/adapter.js';

export const providerRegistry: ProviderAdapter[] = [
  claudeAdapter,
  codexAdapter,
  geminiAdapter,
];
