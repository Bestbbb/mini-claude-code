import { z } from "zod";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

/**
 * AskUser tool — allows the AI to ask the user a question and wait for response.
 * The actual UI interaction is handled by the App component through a callback.
 * Mirrors Claude Code's src/tools/AskUserQuestionTool/
 */

// Global callback holder — set by the App component
let askUserCallback: ((question: string) => Promise<string>) | null = null;

export function setAskUserCallback(cb: (question: string) => Promise<string>) {
  askUserCallback = cb;
}

export function clearAskUserCallback() {
  askUserCallback = null;
}

export const AskUserTool = buildTool({
  name: "AskUser",
  description:
    "Ask the user a question and wait for their response. Use when you need clarification, " +
    "confirmation, or additional information from the user to proceed.",
  inputSchema: z.object({
    question: z.string().describe("The question to ask the user"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "allow" as const, reason: "user interaction" };
  },

  userFacingName(input?: { question?: string }) {
    if (input?.question) {
      const short = input.question.length > 40 ? input.question.slice(0, 40) + "..." : input.question;
      return `AskUser(${short})`;
    }
    return "AskUser";
  },

  async call(input: { question: string }, _context: ToolContext): Promise<ToolResult> {
    if (!askUserCallback) {
      return {
        content: "Error: AskUser is not available in non-interactive mode.",
        is_error: true,
      };
    }

    try {
      const answer = await askUserCallback(input.question);
      return { content: answer || "(user provided no response)" };
    } catch (err: any) {
      return { content: `Error getting user response: ${err.message}`, is_error: true };
    }
  },
});
