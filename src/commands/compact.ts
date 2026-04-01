import { createClient } from "../api.js";
import { registerCommand } from "../commands.js";
import { compactMessages } from "../services/compact.js";

registerCommand({
  name: "compact",
  description: "Compress conversation history to save context space",
  async execute(args, context) {
    if (context.messages.length < 4) {
      return "Not enough messages to compact (need at least 4).";
    }

    const client = createClient(context.apiKey, context.baseUrl);

    try {
      const result = await compactMessages(context.messages, {
        client,
        model: context.model,
        customPrompt: args || undefined,
      });

      context.setMessages(result.messages);

      return [
        `Compacted conversation:`,
        `  ${result.originalCount} messages → ${result.compactedCount} messages`,
        `  ~${result.estimatedTokensSaved.toLocaleString()} tokens saved`,
        result.summary ? `\nSummary: ${result.summary.slice(0, 200)}...` : "",
      ].filter(Boolean).join("\n");
    } catch (err: any) {
      return `Compact failed: ${err.message}`;
    }
  },
});
