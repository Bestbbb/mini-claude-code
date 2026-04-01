import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

export const FileWriteTool = buildTool({
  name: "Write",
  description:
    "Writes content to a file. Creates the file if it doesn't exist. " +
    "Creates parent directories as needed. Overwrites existing content.",
  inputSchema: z.object({
    file_path: z.string().describe("Absolute path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),

  isReadOnly() {
    return false;
  },

  checkPermissions() {
    return { behavior: "ask" as const };
  },

  userFacingName(input?: { file_path?: string }) {
    if (input?.file_path) {
      const short = input.file_path.length > 50 ? "..." + input.file_path.slice(-47) : input.file_path;
      return `Write(${short})`;
    }
    return "Write";
  },

  async call(input: { file_path: string; content: string }, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.file_path);
    try {
      // Ensure parent directory exists
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, input.content, "utf-8");
      return {
        content: `Successfully wrote ${input.content.split("\n").length} lines to ${filePath}`,
      };
    } catch (err: any) {
      return { content: `Error writing file: ${err.message}`, is_error: true };
    }
  },
});
