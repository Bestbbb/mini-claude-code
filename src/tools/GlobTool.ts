import { z } from "zod";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

export const GlobTool = buildTool({
  name: "Glob",
  description:
    "Fast file pattern matching tool. Supports glob patterns like '**/*.js' or 'src/**/*.ts'. " +
    "Returns matching file paths sorted by modification time. Use to find files by name patterns.",
  inputSchema: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z.string().optional().describe("The directory to search in (default: current directory)"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "allow" as const, reason: "read-only" };
  },

  userFacingName(input?: { pattern?: string }) {
    if (input?.pattern) {
      return `Glob(${input.pattern})`;
    }
    return "Glob";
  },

  async call(input: { pattern: string; path?: string }, context: ToolContext): Promise<ToolResult> {
    const searchPath = input.path ? resolve(context.cwd, input.path) : context.cwd;

    // Use find with shell globbing for portability
    // Convert glob pattern to find-compatible pattern
    const pattern = input.pattern;

    try {
      // Use shell globbing via bash
      // For ** patterns, use find with -name; for specific paths, use ls/find
      let cmd: string;

      if (pattern.includes("**")) {
        // Extract the filename pattern from the glob
        const parts = pattern.split("/");
        const namePart = parts[parts.length - 1] || "*";
        const dirPart = parts.slice(0, -1).join("/");
        const findPath = dirPart ? resolve(searchPath, dirPart.replace(/\*\*/g, "")) : searchPath;

        cmd = `find ${JSON.stringify(findPath)} -type f -name ${JSON.stringify(namePart)} 2>/dev/null | head -500 | sort`;
      } else if (pattern.includes("*") || pattern.includes("?")) {
        cmd = `find ${JSON.stringify(searchPath)} -maxdepth 5 -type f -name ${JSON.stringify(pattern)} 2>/dev/null | head -500 | sort`;
      } else {
        // Exact name search
        cmd = `find ${JSON.stringify(searchPath)} -type f -name ${JSON.stringify(pattern)} 2>/dev/null | head -500 | sort`;
      }

      const output = execSync(cmd, {
        cwd: searchPath,
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 1024 * 1024 * 5,
        shell: "/bin/bash",
      }).trim();

      if (!output) {
        return { content: `No files matching pattern: ${pattern}` };
      }

      const files = output.split("\n");
      const result = files.length >= 500
        ? `${output}\n\n(results truncated at 500 files)`
        : output;

      return { content: `Found ${files.length} file(s) matching "${pattern}":\n${result}` };
    } catch (err: any) {
      if (err.status === 1 && !err.stderr) {
        return { content: `No files matching pattern: ${pattern}` };
      }
      return { content: `Error searching for files: ${err.message}`, is_error: true };
    }
  },
});
