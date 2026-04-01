import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

export const FileReadTool = buildTool({
  name: "Read",
  description:
    "Reads a file from the filesystem. Returns the file content with line numbers (cat -n format). " +
    "Use offset and limit to read specific portions of large files.",
  inputSchema: z.object({
    file_path: z.string().describe("Absolute path to the file to read"),
    offset: z.number().optional().describe("Line number to start reading from (1-based)"),
    limit: z.number().optional().describe("Maximum number of lines to read"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "allow" as const, reason: "read-only" };
  },

  userFacingName(input?: { file_path?: string }) {
    if (input?.file_path) {
      const short = input.file_path.length > 50 ? "..." + input.file_path.slice(-47) : input.file_path;
      return `Read(${short})`;
    }
    return "Read";
  },

  async call(input: { file_path: string; offset?: number; limit?: number }, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.file_path);
    try {
      const content = readFileSync(filePath, "utf-8");
      const allLines = content.split("\n");

      const offset = (input.offset ?? 1) - 1; // Convert to 0-based
      const limit = input.limit ?? allLines.length;
      const lines = allLines.slice(offset, offset + limit);

      // Format with line numbers (cat -n style)
      const numbered = lines
        .map((line, i) => {
          const lineNum = offset + i + 1;
          return `${String(lineNum).padStart(6, " ")}\t${line}`;
        })
        .join("\n");

      const totalLines = allLines.length;
      const header = `File: ${filePath} (${totalLines} lines total)`;

      if (offset > 0 || offset + limit < totalLines) {
        return { content: `${header}\nShowing lines ${offset + 1}-${Math.min(offset + limit, totalLines)}:\n${numbered}` };
      }
      return { content: `${header}\n${numbered}` };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return { content: `Error: File not found: ${filePath}`, is_error: true };
      }
      if (err.code === "EISDIR") {
        return { content: `Error: ${filePath} is a directory, not a file`, is_error: true };
      }
      return { content: `Error reading file: ${err.message}`, is_error: true };
    }
  },
});
