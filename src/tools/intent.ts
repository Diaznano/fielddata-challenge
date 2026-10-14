import { Intent } from './schemas';

export function cleanArgs<T extends Record<string, unknown>>(args: T): T {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null)) as T;
}

export function withArgs(intent: Intent, extra: Record<string, unknown>): Intent {
  return { tool: intent.tool, args: { ...intent.args, ...cleanArgs(extra) } } as Intent;
}

export function mergeIntent(base: Intent, next: Intent): Intent {
  return base.tool === next.tool ? withArgs(base, next.args) : next;
}
