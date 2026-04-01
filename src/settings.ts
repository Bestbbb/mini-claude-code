import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ─── Settings Types ───

export type HookConfig = {
  matcher: string;
  command: string;
};

export type HookEventType = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "SessionStart";

export type HooksConfig = {
  [K in HookEventType]?: HookConfig[];
};

export type PermissionRule = {
  tool: string;
  pattern?: string;
};

export type Settings = {
  permissions?: {
    allow?: PermissionRule[];
    deny?: PermissionRule[];
  };
  hooks?: HooksConfig;
  model?: string;
  customApiKey?: string;
  maxTurnTokens?: number;
  autoCompactThreshold?: number;
};

/**
 * Load and merge settings from multiple locations.
 * Priority: project local > project > user global
 * Mirrors Claude Code's src/utils/settings/settings.ts
 */
export function loadSettings(projectRoot?: string): Settings {
  const globalSettings = loadSettingsFile(
    resolve(homedir(), ".claude", "settings.json")
  );

  if (!projectRoot) {
    return globalSettings;
  }

  const projectSettings = loadSettingsFile(
    resolve(projectRoot, ".claude", "settings.json")
  );
  const localSettings = loadSettingsFile(
    resolve(projectRoot, ".claude", "settings.local.json")
  );

  return mergeSettings(globalSettings, projectSettings, localSettings);
}

function loadSettingsFile(path: string): Settings {
  try {
    if (!existsSync(path)) return {};
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as Settings;
  } catch {
    return {};
  }
}

function mergeSettings(...settingsList: Settings[]): Settings {
  const merged: Settings = {};

  for (const settings of settingsList) {
    if (settings.model) merged.model = settings.model;
    if (settings.customApiKey) merged.customApiKey = settings.customApiKey;
    if (settings.maxTurnTokens) merged.maxTurnTokens = settings.maxTurnTokens;
    if (settings.autoCompactThreshold) merged.autoCompactThreshold = settings.autoCompactThreshold;

    // Merge permissions
    if (settings.permissions) {
      if (!merged.permissions) merged.permissions = {};
      if (settings.permissions.allow) {
        merged.permissions.allow = [
          ...(merged.permissions.allow || []),
          ...settings.permissions.allow,
        ];
      }
      if (settings.permissions.deny) {
        merged.permissions.deny = [
          ...(merged.permissions.deny || []),
          ...settings.permissions.deny,
        ];
      }
    }

    // Merge hooks
    if (settings.hooks) {
      if (!merged.hooks) merged.hooks = {};
      for (const [event, hooks] of Object.entries(settings.hooks)) {
        const key = event as HookEventType;
        merged.hooks[key] = [
          ...(merged.hooks[key] || []),
          ...(hooks || []),
        ];
      }
    }
  }

  return merged;
}

/**
 * Check if a tool is allowed by settings permission rules.
 */
export function isToolAllowedBySettings(
  toolName: string,
  input: Record<string, unknown>,
  settings: Settings
): "allow" | "deny" | null {
  // Check deny rules first
  if (settings.permissions?.deny) {
    for (const rule of settings.permissions.deny) {
      if (matchesPermissionRule(toolName, input, rule)) {
        return "deny";
      }
    }
  }

  // Check allow rules
  if (settings.permissions?.allow) {
    for (const rule of settings.permissions.allow) {
      if (matchesPermissionRule(toolName, input, rule)) {
        return "allow";
      }
    }
  }

  return null;
}

function matchesPermissionRule(
  toolName: string,
  input: Record<string, unknown>,
  rule: PermissionRule
): boolean {
  if (rule.tool !== toolName && rule.tool !== "*") return false;
  if (!rule.pattern) return true;

  const value = (input.command ?? input.file_path ?? "") as string;
  try {
    const escaped = rule.pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(value);
  } catch {
    return value.includes(rule.pattern);
  }
}
