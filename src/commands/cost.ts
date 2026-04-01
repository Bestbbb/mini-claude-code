import { registerCommand } from "../commands.js";
import { estimateMessagesTokens } from "../services/tokenEstimation.js";

registerCommand({
  name: "cost",
  description: "Show token usage and estimated cost",
  async execute(_args, context) {
    const summary = context.tokenTracker.getSummary();
    const currentContextTokens = estimateMessagesTokens(context.messages);

    return [
      `Token Usage & Cost`,
      `─────────────────`,
      summary,
      ``,
      `Current context: ~${currentContextTokens.toLocaleString()} tokens (estimated)`,
      `Messages in history: ${context.messages.length}`,
      `Model: ${context.model}`,
    ].join("\n");
  },
});
