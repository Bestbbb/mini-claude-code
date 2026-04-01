import { registerCommand, getAllCommands } from "../commands.js";

registerCommand({
  name: "help",
  description: "Show all available slash commands",
  aliases: ["?"],
  async execute() {
    const commands = getAllCommands();
    const lines = commands.map((cmd) => {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map(a => "/" + a).join(", ")})` : "";
      return `  /${cmd.name}${aliases} — ${cmd.description}`;
    });
    return `Available commands:\n${lines.join("\n")}`;
  },
});
