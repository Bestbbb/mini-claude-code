import Anthropic from "@anthropic-ai/sdk";
import type { Message, AssistantMessage } from "../types.js";
import { estimateMessagesTokens, shouldAutoCompact } from "./tokenEstimation.js";
import { COMPACT_SYSTEM_PROMPT, buildCompactUserPrompt, formatMessagesForSummary } from "./compactPrompt.js";

export type CompactOptions = {
  client: Anthropic;
  model: string;
  maxContextTokens?: number;
  keepRecentMessages?: number;
  customPrompt?: string;
};

export type CompactResult = {
  messages: Message[];
  summary: string;
  originalCount: number;
  compactedCount: number;
  estimatedTokensSaved: number;
};

/**
 * Compact (summarize) conversation history to stay within context limits.
 *
 * Strategy:
 * 1. Keep the most recent N messages intact
 * 2. Summarize older messages using Claude
 * 3. Replace old messages with a system summary message
 *
 * Mirrors Claude Code's src/services/compact/compact.ts
 */
export async function compactMessages(
  messages: Message[],
  options: CompactOptions
): Promise<CompactResult> {
  const {
    client,
    model,
    keepRecentMessages = 6,
    customPrompt,
  } = options;

  const originalCount = messages.length;
  const tokensBefore = estimateMessagesTokens(messages);

  // Don't compact if there aren't enough messages
  if (messages.length <= keepRecentMessages + 2) {
    return {
      messages,
      summary: "",
      originalCount,
      compactedCount: messages.length,
      estimatedTokensSaved: 0,
    };
  }

  // Split: older messages to summarize, recent messages to keep
  const toSummarize = messages.slice(0, messages.length - keepRecentMessages);
  const toKeep = messages.slice(messages.length - keepRecentMessages);

  // Format older messages for summarization
  const conversationText = formatMessagesForSummary(toSummarize as any);

  // Call Claude to generate summary
  const summary = await generateSummary(client, model, conversationText, customPrompt);

  // Build new message array with summary as first message
  const summaryMessage: Message = {
    role: "user",
    content: `[Previous conversation summary]\n${summary}`,
  };

  // Need an assistant acknowledgment after the summary for valid message alternation
  const ackMessage: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "I understand the context from the conversation summary. I'll continue from where we left off." }],
    stop_reason: "end_turn",
  };

  const compactedMessages: Message[] = [summaryMessage, ackMessage, ...toKeep];
  const tokensAfter = estimateMessagesTokens(compactedMessages);

  return {
    messages: compactedMessages,
    summary,
    originalCount,
    compactedCount: compactedMessages.length,
    estimatedTokensSaved: tokensBefore - tokensAfter,
  };
}

async function generateSummary(
  client: Anthropic,
  model: string,
  conversationText: string,
  customPrompt?: string
): Promise<string> {
  try {
    const response = await client.messages.create({
      model,
      system: COMPACT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildCompactUserPrompt(conversationText, customPrompt),
        },
      ],
      max_tokens: 2048,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "Unable to generate summary.";
  } catch (err: any) {
    return `[Compact error: ${err.message}. Previous messages were truncated to save context.]`;
  }
}

/**
 * Check and auto-compact if needed. Returns compacted messages or original.
 * Called at the start of each query loop iteration.
 */
export async function autoCompactIfNeeded(
  messages: Message[],
  options: CompactOptions
): Promise<{ messages: Message[]; didCompact: boolean }> {
  const maxContext = options.maxContextTokens ?? 150000;

  if (!shouldAutoCompact(messages, maxContext)) {
    return { messages, didCompact: false };
  }

  const result = await compactMessages(messages, options);
  return {
    messages: result.messages,
    didCompact: result.estimatedTokensSaved > 0,
  };
}
