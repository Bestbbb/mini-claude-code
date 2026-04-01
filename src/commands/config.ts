import { registerCommand } from "../commands.js";

registerCommand({
  name: "config",
  description: "Show current configuration and permission mode",
  async execute(args, context) {
    if (args === "bypass") {
      context.appState.permissionMode = "bypass";
      return "Permission mode changed to: bypass (all tools auto-allowed)";
    }
    if (args === "auto") {
      context.appState.permissionMode = "auto";
      return "Permission mode changed to: auto (all tools auto-allowed)";
    }
    if (args === "default") {
      context.appState.permissionMode = "default";
      return "Permission mode changed to: default (ask for non-read-only tools)";
    }

    const alwaysAllowList = Array.from(context.appState.alwaysAllowRules);

    return [
      `Configuration`,
      `─────────────`,
      `Permission mode: ${context.appState.permissionMode}`,
      `Model: ${context.model}`,
      `Project root: ${context.session.projectRoot}`,
      `CWD: ${context.session.cwd}`,
      `Session ID: ${context.session.sessionId.slice(0, 8)}...`,
      ``,
      `Always-allow rules (${alwaysAllowList.length}):`,
      alwaysAllowList.length > 0
        ? alwaysAllowList.map(r => `  ${r}`).join("\n")
        : "  (none)",
      ``,
      `Usage: /config [bypass|auto|default]`,
    ].join("\n");
  },
});
