import { registerCommand } from "../commands.js";

registerCommand({
  name: "clear",
  description: "Clear conversation history",
  async execute(_args, context) {
    context.setMessages([]);
    return "Conversation history cleared.";
  },
});
