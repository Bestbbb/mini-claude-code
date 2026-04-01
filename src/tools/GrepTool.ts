import { z } from "zod";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

export const GrepTool = buildTool({
  name: "Grep",
  description:
    "Searches for a pattern in files using grep -rn. Returns matching lines with file paths and line numbers. " +
    "Supports regular expressions. Use `include` to filter by file extension (e.g., '*.ts').",
  inputSchema: z.object({
    pattern: z.string().describe("The regex pattern to search for"),
    path: z.string().optional().describe("Directory or file to search in (default: current directory)"),
    include: z.string().optional().describe("File glob pattern to include (e.g., '*.ts', '*.py')"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "allow" as const, reason: "read-only" };
  },

  userFacingName(input?: { pattern?: string }) {
    if (input?.pattern) {
      const short = input.pattern.length > 40 ? input.pattern.slice(0, 40) + "..." : input.pattern;
      return `Grep(${short})`;
    }
    return "Grep";
  },

  async call(
    input: { pattern: string; path?: string; include?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const searchPath = input.path ? resolve(context.cwd, input.path) : context.cwd;
    const includeArg = input.include ? `--include='${input.include}'` : "";

    const cmd = `grep -rn ${includeArg} -- ${JSON.stringify(input.pattern)} ${JSON.stringify(searchPath)} 2>/dev/null | head -200`;

    try {
      const output = execSync(cmd, {
        cwd: context.cwd,
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 1024 * 1024 * 5,
        shell: "/bin/bash",
      });

      if (!output.trim()) {
        return { content: "No matches found." };
      }

      const lines = output.trim().split("\n");
      const result = lines.length >= 200
        ? `${output.trim()}\n\n(results truncated at 200 lines)`
        : output.trim();

      return { content: `Found ${lines.length} match(es):\n${result}` };
    } catch (err: any) {
      // grep returns exit code 1 for "no matches" — not an error
      if (err.status === 1) {
        return { content: "No matches found." };
      }
      return { content: `Error running grep: ${err.message}`, is_error: true };
    }
  },
});
