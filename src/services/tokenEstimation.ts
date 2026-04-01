import type { Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock } from "../types.js";

/**
 * Simple token estimation using character count heuristic.
 * Claude models roughly average 4 characters per token for English text.
 * This is a rough approximation — the real tokenizer is much more complex.
 * Mirrors Claude Code's src/services/tokenEstimation.ts
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(message: Message): number {
  if (message.role === "user") {
    if (typeof message.content === "string") {
      return estimateTokens(message.content) + 4; // role overhead
    }
    return estimateContentBlocksTokens(message.content) + 4;
  }

  // Assistant message
  return estimateContentBlocksTokens(message.content) + 4;
}

function estimateContentBlocksTokens(blocks: ContentBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        total += estimateTokens((block as TextBlock).text);
        break;
      case "tool_use": {
        const tu = block as ToolUseBlock;
        total += estimateTokens(tu.name);
        total += estimateTokens(JSON.stringify(tu.input));
        total += 20; // overhead for tool_use structure
        break;
      }
      case "tool_result": {
        const tr = block as ToolResultBlock;
        total += estimateTokens(tr.content);
        total += 10; // overhead for tool_result structure
        break;
      }
    }
  }
  return total;
}

export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

/**
 * Check if messages are approaching the context window limit.
 * Returns true if auto-compact should be triggered.
 */
export function shouldAutoCompact(
  messages: Message[],
  maxContextTokens: number,
  threshold: number = 0.8
): boolean {
  const estimated = estimateMessagesTokens(messages);
  return estimated > maxContextTokens * threshold;
}
