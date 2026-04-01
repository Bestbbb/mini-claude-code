import { registerCommand } from "../commands.js";
import { listSessions } from "../services/sessionStorage.js";

registerCommand({
  name: "sessions",
  description: "List recent conversation sessions",
  async execute(_args) {
    const sessions = listSessions(15);

    if (sessions.length === 0) {
      return "No saved sessions found.";
    }

    const lines = sessions.map((s, i) => {
      const date = new Date(s.lastUpdated).toLocaleString();
      return `  ${i + 1}. [${s.sessionId.slice(0, 8)}] ${date} (${s.messageCount} msgs) — ${s.firstUserMessage}`;
    });

    return `Recent sessions:\n${lines.join("\n")}\n\nResume with: /resume <session-id>`;
  },
});
