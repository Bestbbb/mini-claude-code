import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { Message } from "../types.js";

export type SessionMeta = {
  sessionId: string;
  startedAt: string;
  lastUpdated: string;
  messageCount: number;
  firstUserMessage: string;
  cwd: string;
};

function getSessionDir(): string {
  return resolve(homedir(), ".claude", "sessions");
}

function ensureSessionDir(): string {
  const dir = getSessionDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Save session messages to JSONL file.
 * Each line is a JSON-serialized message.
 * Mirrors Claude Code's session persistence.
 */
export function saveSession(
  sessionId: string,
  messages: Message[],
  meta: { cwd: string; startedAt: Date }
): void {
  const dir = ensureSessionDir();
  const filePath = resolve(dir, `${sessionId}.jsonl`);

  const lines: string[] = [];

  // First line is metadata
  const sessionMeta: SessionMeta = {
    sessionId,
    startedAt: meta.startedAt.toISOString(),
    lastUpdated: new Date().toISOString(),
    messageCount: messages.length,
    firstUserMessage: getFirstUserMessage(messages),
    cwd: meta.cwd,
  };
  lines.push(JSON.stringify({ type: "meta", ...sessionMeta }));

  // Each subsequent line is a message
  for (const msg of messages) {
    lines.push(JSON.stringify({ type: "message", ...msg }));
  }

  writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

/**
 * Load session messages from JSONL file.
 */
export function loadSession(sessionId: string): { meta: SessionMeta; messages: Message[] } | null {
  const filePath = resolve(getSessionDir(), `${sessionId}.jsonl`);

  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    let meta: SessionMeta | null = null;
    const messages: Message[] = [];

    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (parsed.type === "meta") {
        const { type: _, ...rest } = parsed;
        meta = rest as SessionMeta;
      } else if (parsed.type === "message") {
        const { type: _, ...rest } = parsed;
        messages.push(rest as Message);
      }
    }

    if (!meta) return null;

    return { meta, messages };
  } catch {
    return null;
  }
}

/**
 * List recent sessions, sorted by last updated time (newest first).
 */
export function listSessions(limit: number = 10): SessionMeta[] {
  const dir = getSessionDir();
  if (!existsSync(dir)) return [];

  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const filePath = resolve(dir, f);
        const stat = statSync(filePath);
        return { file: f, mtime: stat.mtimeMs, path: filePath };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);

    const sessions: SessionMeta[] = [];
    for (const { path } of files) {
      try {
        const firstLine = readFileSync(path, "utf-8").split("\n")[0];
        if (firstLine) {
          const parsed = JSON.parse(firstLine);
          if (parsed.type === "meta") {
            const { type: _, ...rest } = parsed;
            sessions.push(rest as SessionMeta);
          }
        }
      } catch {
        // Skip corrupt session files
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

/**
 * Find the most recent session ID.
 */
export function getLastSessionId(): string | null {
  const sessions = listSessions(1);
  return sessions.length > 0 ? sessions[0]!.sessionId : null;
}

function getFirstUserMessage(messages: Message[]): string {
  for (const msg of messages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      return msg.content.length > 100 ? msg.content.slice(0, 100) + "..." : msg.content;
    }
  }
  return "(no user message)";
}
