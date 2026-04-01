import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

/**
 * NotebookEdit tool — manipulate Jupyter notebook (.ipynb) cells.
 * Mirrors Claude Code's src/tools/NotebookEditTool/
 */

type NotebookCell = {
  cell_type: "code" | "markdown" | "raw";
  source: string[];
  metadata: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
};

type Notebook = {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
};

export const NotebookEditTool = buildTool({
  name: "NotebookEdit",
  description:
    "Edit Jupyter notebook (.ipynb) files. Supports inserting, replacing, and deleting cells. " +
    "Operates on notebook cells by index.",
  inputSchema: z.object({
    notebook_path: z.string().describe("Path to the .ipynb notebook file"),
    action: z.enum(["insert", "replace", "delete"]).describe("The action to perform"),
    cell_index: z.number().describe("The cell index (0-based) to operate on"),
    cell_type: z.enum(["code", "markdown", "raw"]).optional().describe("Cell type (for insert/replace)"),
    content: z.string().optional().describe("Cell content (for insert/replace)"),
  }),

  isReadOnly() {
    return false;
  },

  checkPermissions() {
    return { behavior: "ask" as const };
  },

  userFacingName(input?: { notebook_path?: string; action?: string }) {
    if (input?.notebook_path) {
      const short = input.notebook_path.length > 40 ? "..." + input.notebook_path.slice(-37) : input.notebook_path;
      return `NotebookEdit(${input.action || "edit"}: ${short})`;
    }
    return "NotebookEdit";
  },

  async call(
    input: {
      notebook_path: string;
      action: "insert" | "replace" | "delete";
      cell_index: number;
      cell_type?: "code" | "markdown" | "raw";
      content?: string;
    },
    context: ToolContext
  ): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.notebook_path);

    try {
      // Read existing notebook
      const raw = readFileSync(filePath, "utf-8");
      const notebook: Notebook = JSON.parse(raw);

      if (!notebook.cells) {
        return { content: "Error: Invalid notebook format (no cells array)", is_error: true };
      }

      switch (input.action) {
        case "insert": {
          if (!input.content) {
            return { content: "Error: content is required for insert action", is_error: true };
          }
          const newCell: NotebookCell = {
            cell_type: input.cell_type || "code",
            source: input.content.split("\n").map((line, i, arr) =>
              i < arr.length - 1 ? line + "\n" : line
            ),
            metadata: {},
            ...(input.cell_type !== "markdown" ? { outputs: [], execution_count: null } : {}),
          };
          const insertIndex = Math.min(input.cell_index, notebook.cells.length);
          notebook.cells.splice(insertIndex, 0, newCell);
          break;
        }

        case "replace": {
          if (input.cell_index < 0 || input.cell_index >= notebook.cells.length) {
            return { content: `Error: cell_index ${input.cell_index} out of range (0-${notebook.cells.length - 1})`, is_error: true };
          }
          if (!input.content) {
            return { content: "Error: content is required for replace action", is_error: true };
          }
          const cell = notebook.cells[input.cell_index]!;
          cell.source = input.content.split("\n").map((line, i, arr) =>
            i < arr.length - 1 ? line + "\n" : line
          );
          if (input.cell_type) {
            cell.cell_type = input.cell_type;
          }
          // Clear outputs on replace
          if (cell.cell_type === "code") {
            cell.outputs = [];
            cell.execution_count = null;
          }
          break;
        }

        case "delete": {
          if (input.cell_index < 0 || input.cell_index >= notebook.cells.length) {
            return { content: `Error: cell_index ${input.cell_index} out of range (0-${notebook.cells.length - 1})`, is_error: true };
          }
          notebook.cells.splice(input.cell_index, 1);
          break;
        }
      }

      // Write back
      writeFileSync(filePath, JSON.stringify(notebook, null, 1) + "\n", "utf-8");

      return {
        content: `Successfully ${input.action}ed cell at index ${input.cell_index} in ${filePath} (${notebook.cells.length} cells total)`,
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return { content: `Error: Notebook not found: ${filePath}`, is_error: true };
      }
      return { content: `Error editing notebook: ${err.message}`, is_error: true };
    }
  },
});
