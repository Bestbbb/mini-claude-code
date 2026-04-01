import { registerCommand } from "../commands.js";

registerCommand({
  name: "exit",
  description: "Exit the program",
  aliases: ["quit", "q"],
  async execute(_args, context) {
    context.exit();
    return null;
  },
});
