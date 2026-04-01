import type { Settings } from "../settings.js";
import { runHooks } from "../hooks.js";

/**
 * Stop hooks — executed after a query turn completes.
 * In the full Claude Code, this includes memory extraction, auto-dream,
 * and prompt suggestions. Here we just run PostToolUse hooks for the
 * overall turn completion.
 * Mirrors Claude Code's src/query/stopHooks.ts
 */

export type StopHookContext = {
  cwd: string;
  messageCount: number;
  lastAssistantText?: string;
};

export function runStopHooks(
  settings: Settings,
  context: StopHookContext
): void {
  // Run any PostToolUse hooks with a special "turn_complete" marker
  runHooks(settings, {
    event: "PostToolUse",
    toolName: "__turn_complete__",
    toolResult: context.lastAssistantText?.slice(0, 2000),
    cwd: context.cwd,
  });
}
