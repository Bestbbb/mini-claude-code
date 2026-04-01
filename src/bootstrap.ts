import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir, platform, release, hostname } from "node:os";

// ─── Session Info ───

export type SessionInfo = {
  sessionId: string;
  cwd: string;
  projectRoot: string;
  projectName: string;
  os: string;
  osVersion: string;
  shell: string;
  nodeVersion: string;
  hostname: string;
  claudeMdContents: string[];
  startedAt: Date;
};

/**
 * One-time session initialization.
 * Detects CWD, OS, shell, reads CLAUDE.md files, etc.
 * Mirrors Claude Code's src/entrypoints/init.ts + src/bootstrap/state.ts
 */
export function initSession(cwd?: string): SessionInfo {
  const workingDir = cwd || process.cwd();
  const projectRoot = workingDir;

  return {
    sessionId: randomUUID(),
    cwd: workingDir,
    projectRoot,
    projectName: basename(projectRoot),
    os: detectOS(),
    osVersion: release(),
    shell: detectShell(),
    nodeVersion: process.version,
    hostname: hostname(),
    claudeMdContents: loadClaudeMdFiles(workingDir, projectRoot),
    startedAt: new Date(),
  };
}

function detectOS(): string {
  const p = platform();
  switch (p) {
    case "darwin": return "macOS";
    case "linux": return "Linux";
    case "win32": return "Windows";
    default: return p;
  }
}

function detectShell(): string {
  return process.env.SHELL || process.env.ComSpec || "/bin/sh";
}

/**
 * Load CLAUDE.md files from multiple locations (project + user level).
 * Returns array of file contents.
 */
function loadClaudeMdFiles(cwd: string, projectRoot: string): string[] {
  const contents: string[] = [];
  const candidates = [
    resolve(homedir(), ".claude", "CLAUDE.md"),       // User-level
    resolve(projectRoot, "CLAUDE.md"),                  // Project root
    resolve(projectRoot, ".claude", "CLAUDE.md"),       // Project .claude/
  ];

  // If cwd differs from projectRoot, also check cwd
  if (cwd !== projectRoot) {
    candidates.push(resolve(cwd, "CLAUDE.md"));
  }

  const seen = new Set<string>();
  for (const path of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8").trim();
        if (content) {
          contents.push(`# From ${path}\n${content}`);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return contents;
}
