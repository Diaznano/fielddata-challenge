export type Mode = 'ia' | 'local' | 'offline' | 'degraded';

export function resolveMode(p: { online: boolean; llmEnabled: boolean; lastDegraded: boolean }): Mode {
  if (!p.online) return 'offline';
  if (!p.llmEnabled) return 'local';
  return p.lastDegraded ? 'degraded' : 'ia';
}
