import { execSync } from "node:child_process";
import type { Settings, HookConfig, HookEventType } from "./settings.js";

/**
 * Hooks system — execute shell commands in response to tool events.
 * Users configure hooks in settings.json to run before/after tool calls.
 * Mirrors Claude Code's src/utils/hooks.ts
 */

export type HookContext = {
  event: HookEventType;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  userPrompt?: string;
  cwd: string;
};

export type HookResult = {
  hookCommand: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  blocked: boolean;
  blockMessage?: string;
};

/**
 * Run all matching hooks for a given event.
 * Returns results for each hook that matched.
 */
export function runHooks(
  settings: Settings,
  context: HookContext
): HookResult[] {
  const hooks = settings.hooks?.[context.event];
  if (!hooks || hooks.length === 0) return [];

  const results: HookResult[] = [];

  for (const hook of hooks) {
    if (!matchesHook(hook, context)) continue;

    const result = executeHook(hook, context);
    results.push(result);

    // If a hook blocks (exit code non-zero for PreToolUse), stop processing
    if (result.blocked) break;
  }

  return results;
}

/**
 * Check if a hook config matches the current context.
 */
function matchesHook(hook: HookConfig, context: HookContext): boolean {
  if (!hook.matcher || hook.matcher === "*") return true;

  // Match against tool name
  if (context.toolName) {
    if (hook.matcher === context.toolName) return true;

    // Glob-style matching
    try {
      const pattern = hook.matcher.replace(/\*/g, ".*");
      if (new RegExp(`^${pattern}$`).test(context.toolName)) return true;
    } catch {
      // Fall through to exact match
    }
  }

  return false;
}

/**
 * Execute a single hook command.
 */
function executeHook(hook: HookConfig, context: HookContext): HookResult {
  // Build environment variables for the hook
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CLAUDE_HOOK_EVENT: context.event,
  };

  if (context.toolName) {
    env.CLAUDE_TOOL_NAME = context.toolName;
  }
  if (context.toolInput) {
    env.CLAUDE_TOOL_INPUT = JSON.stringify(context.toolInput);
  }
  if (context.toolResult) {
    env.CLAUDE_TOOL_RESULT = context.toolResult.slice(0, 10000); // Limit size
  }
  if (context.userPrompt) {
    env.CLAUDE_USER_PROMPT = context.userPrompt;
  }

  try {
    const stdout = execSync(hook.command, {
      cwd: context.cwd,
      encoding: "utf-8",
      timeout: 10000,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      hookCommand: hook.command,
      stdout: stdout.trim(),
      stderr: "",
      exitCode: 0,
      blocked: false,
    };
  } catch (err: any) {
    const exitCode = err.status ?? 1;
    const stdout = (err.stdout ?? "").trim();
    const stderr = (err.stderr ?? "").trim();

    // For PreToolUse hooks, non-zero exit means "block the tool"
    const blocked = context.event === "PreToolUse" && exitCode !== 0;

    return {
      hookCommand: hook.command,
      stdout,
      stderr,
      exitCode,
      blocked,
      blockMessage: blocked ? (stderr || stdout || "Blocked by hook") : undefined,
    };
  }
}

/**
 * Run PreToolUse hooks and check if the tool should be blocked.
 */
export function runPreToolHooks(
  settings: Settings,
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string
): { blocked: boolean; message?: string; hookOutput?: string } {
  const results = runHooks(settings, {
    event: "PreToolUse",
    toolName,
    toolInput,
    cwd,
  });

  for (const result of results) {
    if (result.blocked) {
      return {
        blocked: true,
        message: result.blockMessage,
        hookOutput: result.stdout || result.stderr,
      };
    }
  }

  // Collect any stdout from non-blocking hooks
  const output = results
    .filter((r) => r.stdout)
    .map((r) => r.stdout)
    .join("\n");

  return { blocked: false, hookOutput: output || undefined };
}

/**
 * Run PostToolUse hooks (informational, cannot block).
 */
export function runPostToolHooks(
  settings: Settings,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: string,
  cwd: string
): void {
  runHooks(settings, {
    event: "PostToolUse",
    toolName,
    toolInput,
    toolResult,
    cwd,
  });
}
