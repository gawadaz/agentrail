import type { ProviderAdapter } from '../discovery/types.js';
import { claudeAdapter } from './claude/adapter.js';
import { codexAdapter } from './codex/adapter.js';
import { antigravityAdapter } from './antigravity/adapter.js';
import { copilotAdapter } from './copilot/adapter.js';

export const providerRegistry: ProviderAdapter[] = [
  claudeAdapter,
  codexAdapter,
  antigravityAdapter,
  copilotAdapter,
];
