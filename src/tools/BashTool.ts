import { z } from "zod";
import { execSync } from "node:child_process";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

const READ_ONLY_COMMANDS = [
  "ls", "cat", "head", "tail", "wc", "find", "grep", "rg",
  "which", "whoami", "pwd", "echo", "date", "env", "printenv",
  "git status", "git log", "git diff", "git show", "git branch",
  "git remote", "git tag", "git rev-parse",
  "node --version", "npm --version", "python --version",
  "file", "stat", "du", "df", "uname", "hostname",
];

function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  return READ_ONLY_COMMANDS.some(
    (ro) => trimmed === ro || trimmed.startsWith(ro + " ") || trimmed.startsWith(ro + "\t")
  );
}

export const BashTool = buildTool({
  name: "Bash",
  description:
    "Executes a bash command and returns its output. Use this for running shell commands, installing packages, running scripts, etc.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
    description: z.string().optional().describe("Human-readable description of what the command does"),
  }),

  isReadOnly(input: { command: string }) {
    return isReadOnlyCommand(input.command);
  },

  checkPermissions(input: { command: string }) {
    if (isReadOnlyCommand(input.command)) {
      return { behavior: "allow" as const, reason: "read-only command" };
    }
    return { behavior: "ask" as const };
  },

  userFacingName(input?: { command?: string }) {
    if (input?.command) {
      const short = input.command.length > 60 ? input.command.slice(0, 60) + "..." : input.command;
      return `Bash(${short})`;
    }
    return "Bash";
  },

  async call(input: { command: string; timeout?: number }, context: ToolContext): Promise<ToolResult> {
    const { command, timeout = 30000 } = input;
    try {
      const output = execSync(command, {
        cwd: context.cwd,
        timeout,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 10, // 10MB
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
      return {
        content: output || "(no output)",
      };
    } catch (err: any) {
      const stdout = err.stdout ?? "";
      const stderr = err.stderr ?? "";
      const exitCode = err.status ?? 1;
      return {
        content: `Exit code: ${exitCode}\n${stdout}${stderr ? "\nSTDERR:\n" + stderr : ""}`.trim(),
        is_error: true,
      };
    }
  },
});
