import type { Tool } from "./tool.js";
import type { AppState, PermissionResult } from "./types.js";
import type { Settings } from "./settings.js";
import { isToolAllowedBySettings } from "./settings.js";
import { classifyBashCommand } from "./permissions/bashClassifier.js";
import { validateWritePath } from "./permissions/pathValidator.js";

/**
 * Check if a tool can be used given the current app state and settings.
 * Logic order (mirrors Claude Code's permission system):
 *  1. bypass mode → always allow
 *  2. isReadOnly → allow
 *  3. check settings deny rules → deny
 *  4. check settings allow rules → allow
 *  5. check tool's own checkPermissions()
 *  6. check alwaysAllowRules (pattern matching)
 *  7. enhanced Bash classification
 *  8. enhanced path validation for file tools
 *  9. auto mode → allow
 * 10. default mode → ask
 */
export function hasPermissionsToUseTool(
  tool: Tool,
  input: Record<string, unknown>,
  appState: AppState,
  settings?: Settings
): PermissionResult {
  // 1. Bypass mode
  if (appState.permissionMode === "bypass") {
    return { behavior: "allow", reason: "bypass mode" };
  }

  // 2. Read-only tools are always allowed
  if (tool.isReadOnly(input)) {
    return { behavior: "allow", reason: "read-only tool" };
  }

  // 3-4. Check settings-based permission rules
  if (settings) {
    const settingsResult = isToolAllowedBySettings(tool.name, input, settings);
    if (settingsResult === "deny") {
      return { behavior: "deny", reason: "denied by settings" };
    }
    if (settingsResult === "allow") {
      return { behavior: "allow", reason: "allowed by settings" };
    }
  }

  // 5. Tool's own permission check
  const toolPermission = tool.checkPermissions(input);
  if (toolPermission.behavior === "allow") {
    return toolPermission;
  }
  if (toolPermission.behavior === "deny") {
    return toolPermission;
  }

  // 6. Check alwaysAllowRules
  const ruleKey = buildRuleKey(tool, input);
  for (const rule of appState.alwaysAllowRules) {
    if (matchesRule(ruleKey, rule)) {
      return { behavior: "allow", reason: `matches rule: ${rule}` };
    }
  }

  // 7. Enhanced Bash command classification
  if (tool.name === "Bash" && typeof input.command === "string") {
    const safety = classifyBashCommand(input.command);
    if (safety === "dangerous") {
      return { behavior: "ask", reason: "dangerous command detected" };
    }
    // In auto mode, safe commands pass through; risky ones still pass
    // (they'll be caught at step 9)
  }

  // 8. Enhanced path validation for file write tools
  if ((tool.name === "Write" || tool.name === "Edit") && typeof input.file_path === "string") {
    const projectRoot = process.cwd(); // Simplified; ideally from session
    const validation = validateWritePath(input.file_path, projectRoot, projectRoot);
    if (!validation.allowed) {
      return { behavior: "deny", reason: validation.reason };
    }
    if (validation.requiresConfirmation) {
      return { behavior: "ask", reason: validation.reason };
    }
  }

  // 9. Auto mode
  if (appState.permissionMode === "auto") {
    return { behavior: "allow", reason: "auto mode" };
  }

  // 10. Default mode → ask
  return { behavior: "ask" };
}

function buildRuleKey(tool: Tool, input: Record<string, unknown>): string {
  const primary = input.command ?? input.file_path ?? "";
  return `${tool.name}(${primary})`;
}

function matchesRule(key: string, rule: string): boolean {
  const escaped = rule.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`).test(key);
  } catch {
    return key === rule;
  }
}

/**
 * Build a rule string for "always allow" from tool name and input.
 */
export function buildAlwaysAllowRule(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash" && typeof input.command === "string") {
    const cmd = input.command.trim();
    const firstWord = cmd.split(/\s+/)[0];
    return `Bash(${firstWord} *)`;
  }
  return toolName;
}
