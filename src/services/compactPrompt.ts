/**
 * Prompt templates for the compact (conversation summarization) service.
 * Mirrors Claude Code's src/services/compact/prompt.ts
 */

export const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a concise but comprehensive summary of a conversation between a user and an AI coding assistant.

The summary should:
1. Capture all important decisions, actions taken, and outcomes
2. Preserve file paths, code changes, and technical details
3. Note any pending tasks or unresolved issues
4. Be structured for easy reference
5. Retain key context that would be needed to continue the conversation

Format the summary as a structured note, not a narrative.`;

export function buildCompactUserPrompt(conversationText: string, customPrompt?: string): string {
  const instruction = customPrompt ||
    "Summarize the following conversation between a user and an AI coding assistant. Focus on actions taken, decisions made, and current state.";

  return `${instruction}

<conversation>
${conversationText}
</conversation>

Provide a structured summary that captures all important context needed to continue this work session.`;
}

/**
 * Format messages into a readable conversation text for the summarizer.
 */
export function formatMessagesForSummary(
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; name?: string; content?: string }> }>
): string {
  const lines: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      lines.push(`[${msg.role}]: ${msg.content}`);
      continue;
    }

    for (const block of msg.content) {
      if (block.type === "text" && block.text) {
        lines.push(`[${msg.role}]: ${block.text}`);
      } else if (block.type === "tool_use" && block.name) {
        lines.push(`[tool_use]: ${block.name}(${JSON.stringify(block).slice(0, 200)})`);
      } else if (block.type === "tool_result" && block.content) {
        const truncated = block.content.length > 500
          ? block.content.slice(0, 500) + "...(truncated)"
          : block.content;
        lines.push(`[tool_result]: ${truncated}`);
      }
    }
  }

  return lines.join("\n");
}
