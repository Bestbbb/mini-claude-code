import { registerCommand } from "../commands.js";
import { loadSession, getLastSessionId } from "../services/sessionStorage.js";

registerCommand({
  name: "resume",
  description: "Resume a previous session",
  async execute(args, context) {
    const sessionId = args.trim() || getLastSessionId();

    if (!sessionId) {
      return "No previous sessions found. Use /sessions to list available sessions.";
    }

    const session = loadSession(sessionId);
    if (!session) {
      return `Session not found: ${sessionId}`;
    }

    context.setMessages(session.messages);

    return [
      `Resumed session: ${session.meta.sessionId.slice(0, 8)}...`,
      `  Started: ${session.meta.startedAt}`,
      `  Messages: ${session.meta.messageCount}`,
      `  First message: ${session.meta.firstUserMessage}`,
    ].join("\n");
  },
});
