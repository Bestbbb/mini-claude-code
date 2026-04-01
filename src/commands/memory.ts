import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { registerCommand } from "../commands.js";

registerCommand({
  name: "memory",
  description: "Show or edit CLAUDE.md project memory file",
  async execute(args, context) {
    const claudeMdPath = resolve(context.session.projectRoot, "CLAUDE.md");

    if (!args) {
      // Show current CLAUDE.md content
      if (context.session.claudeMdContents.length === 0) {
        return `No CLAUDE.md files found.\n\nCreate one with: /memory add <text>\nPath: ${claudeMdPath}`;
      }
      return `Project Memory (CLAUDE.md):\n${"─".repeat(40)}\n${context.session.claudeMdContents.join("\n\n---\n\n")}`;
    }

    // Sub-commands: add, edit
    if (args.startsWith("add ")) {
      const text = args.slice(4).trim();
      if (!text) return "Usage: /memory add <text to append>";

      try {
        let existing = "";
        if (existsSync(claudeMdPath)) {
          existing = readFileSync(claudeMdPath, "utf-8");
        } else {
          mkdirSync(dirname(claudeMdPath), { recursive: true });
        }
        const newContent = existing ? `${existing}\n\n${text}` : text;
        writeFileSync(claudeMdPath, newContent, "utf-8");

        // Update session cache
        context.session.claudeMdContents = [`# From ${claudeMdPath}\n${newContent}`];

        return `Added to ${claudeMdPath}`;
      } catch (err: any) {
        return `Error writing CLAUDE.md: ${err.message}`;
      }
    }

    if (args === "path") {
      return `CLAUDE.md path: ${claudeMdPath}`;
    }

    return `Usage:\n  /memory          — Show current CLAUDE.md\n  /memory add <text> — Append text to CLAUDE.md\n  /memory path     — Show CLAUDE.md file path`;
  },
});
