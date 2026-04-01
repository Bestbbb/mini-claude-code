import { z } from "zod";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

/**
 * TodoWrite tool — manage an in-memory todo/task list.
 * Mirrors Claude Code's src/tools/TodoWriteTool/
 */

type TodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "done";
};

// Global todo storage (persists across tool calls within a session)
const todoList: Map<string, TodoItem> = new Map();

export const TodoWriteTool = buildTool({
  name: "TodoWrite",
  description:
    "Manage a todo list for tracking tasks. Can add, update, or remove todo items. " +
    "Useful for tracking multi-step plans and progress.",
  inputSchema: z.object({
    todos: z.array(z.object({
      id: z.string().describe("Unique identifier for the todo item"),
      content: z.string().describe("The todo item text"),
      status: z.enum(["pending", "in_progress", "done"]).describe("Current status"),
    })).describe("Array of todo items to create or update"),
  }),

  isReadOnly() {
    return false;
  },

  checkPermissions() {
    // Todos are in-memory only, low risk
    return { behavior: "allow" as const, reason: "in-memory todo list" };
  },

  userFacingName() {
    return "TodoWrite";
  },

  async call(
    input: { todos: Array<{ id: string; content: string; status: "pending" | "in_progress" | "done" }> },
    _context: ToolContext
  ): Promise<ToolResult> {
    for (const item of input.todos) {
      todoList.set(item.id, {
        id: item.id,
        content: item.content,
        status: item.status,
      });
    }

    // Build display
    const allTodos = Array.from(todoList.values());
    const statusIcon = (s: string) => {
      switch (s) {
        case "done": return "[x]";
        case "in_progress": return "[-]";
        default: return "[ ]";
      }
    };

    const lines = allTodos.map(
      (t) => `${statusIcon(t.status)} ${t.id}: ${t.content}`
    );

    const pending = allTodos.filter(t => t.status === "pending").length;
    const inProgress = allTodos.filter(t => t.status === "in_progress").length;
    const done = allTodos.filter(t => t.status === "done").length;

    return {
      content: [
        `Todo List (${allTodos.length} items: ${pending} pending, ${inProgress} in progress, ${done} done)`,
        "─".repeat(40),
        ...lines,
      ].join("\n"),
    };
  },
});
