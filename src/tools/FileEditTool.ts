import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

export const FileEditTool = buildTool({
  name: "Edit",
  description:
    "Performs exact string replacement in a file. Finds `old_string` in the file and replaces it with `new_string`. " +
    "The old_string must match exactly (including whitespace and indentation). " +
    "For creating new files, use the Write tool instead.",
  inputSchema: z.object({
    file_path: z.string().describe("Absolute path to the file to edit"),
    old_string: z.string().describe("The exact string to find and replace"),
    new_string: z.string().describe("The replacement string"),
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
      return `Edit(${short})`;
    }
    return "Edit";
  },

  async call(
    input: { file_path: string; old_string: string; new_string: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.file_path);
    try {
      const content = readFileSync(filePath, "utf-8");

      // Check that old_string exists in the file
      const index = content.indexOf(input.old_string);
      if (index === -1) {
        return {
          content: `Error: old_string not found in ${filePath}. Make sure the string matches exactly, including whitespace and indentation.`,
          is_error: true,
        };
      }

      // Check for multiple occurrences
      const secondIndex = content.indexOf(input.old_string, index + 1);
      if (secondIndex !== -1) {
        return {
          content: `Error: old_string appears multiple times in ${filePath}. Provide more context to make it unique.`,
          is_error: true,
        };
      }

      // Perform replacement
      const newContent = content.replace(input.old_string, input.new_string);
      writeFileSync(filePath, newContent, "utf-8");

      // Show a snippet around the edit
      const lines = newContent.split("\n");
      const editLine = content.substring(0, index).split("\n").length;
      const snippetStart = Math.max(0, editLine - 3);
      const snippetEnd = Math.min(lines.length, editLine + input.new_string.split("\n").length + 2);
      const snippet = lines
        .slice(snippetStart, snippetEnd)
        .map((line, i) => `${String(snippetStart + i + 1).padStart(6, " ")}\t${line}`)
        .join("\n");

      return {
        content: `Successfully edited ${filePath}\nSnippet around edit:\n${snippet}`,
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return { content: `Error: File not found: ${filePath}`, is_error: true };
      }
      return { content: `Error editing file: ${err.message}`, is_error: true };
    }
  },
});
