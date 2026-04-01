/**
 * Bash command safety classifier.
 * Analyzes shell commands to determine risk level.
 * Simplified version of Claude Code's src/utils/permissions/yoloClassifier.ts
 */

export type SafetyLevel = "safe" | "risky" | "dangerous";

// Commands that are always safe (read-only operations)
const SAFE_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "wc", "file", "stat",
  "find", "grep", "rg", "ag", "fd", "which", "where", "type",
  "whoami", "pwd", "echo", "printf", "date", "cal",
  "env", "printenv", "hostname", "uname",
  "git status", "git log", "git diff", "git show", "git branch",
  "git remote", "git tag", "git rev-parse", "git stash list",
  "node --version", "npm --version", "npx --version",
  "python --version", "python3 --version", "pip --version",
  "cargo --version", "rustc --version", "go version",
  "du", "df", "free", "top", "ps", "lsof",
  "tree", "less", "more", "sort", "uniq", "cut", "tr",
  "diff", "md5sum", "sha256sum", "base64",
  "jq", "yq", "xargs",
]);

// Command prefixes that are safe
const SAFE_PREFIXES = [
  "git log", "git diff", "git show", "git status", "git branch",
  "git remote", "git tag", "git rev-parse", "git stash list",
  "npm list", "npm info", "npm view", "npm search",
  "cargo check", "cargo test", "cargo build",
  "go test", "go vet", "go build",
  "python -c", "python3 -c", "node -e",
  "npx tsc --noEmit", "npx eslint",
];

// Patterns that are dangerous
const DANGEROUS_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\s+[/~]/, // rm -rf /
  /\brm\s+-rf?\s*$/,                   // bare rm -rf
  /\bsudo\b/,                          // sudo anything
  /\bmkfs\b/,                          // filesystem format
  /\bdd\s+if=/,                        // disk destroyer
  />\s*\/dev\/sd/,                      // write to disk device
  /\bcurl\b.*\|\s*\b(bash|sh|zsh)\b/,  // curl pipe to shell
  /\bwget\b.*\|\s*\b(bash|sh|zsh)\b/,  // wget pipe to shell
  /\bchmod\s+777\b/,                   // world-writable
  /\bchmod\s+-R\b/,                    // recursive chmod
  /\bchown\s+-R\b/,                    // recursive chown
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,       // fork bomb
  /\bgit\s+push\s+.*--force\b/,        // force push
  /\bgit\s+reset\s+--hard\b/,          // hard reset
  /\bgit\s+clean\s+-fd\b/,             // clean untracked
  /\bkill\s+-9\b/,                     // force kill
  /\bpkill\b/,                         // process kill
  /\bdropdb\b/,                        // drop database
  /DROP\s+(TABLE|DATABASE)/i,           // SQL drop
  /DELETE\s+FROM/i,                     // SQL delete
];

// Commands that are somewhat risky but not dangerous
const RISKY_COMMANDS = new Set([
  "rm", "rmdir", "mv", "cp",
  "chmod", "chown",
  "git push", "git commit", "git reset", "git checkout",
  "git merge", "git rebase", "git cherry-pick",
  "npm install", "npm uninstall", "npm update",
  "pip install", "pip uninstall",
  "apt", "brew", "yum", "dnf",
  "docker", "kubectl",
  "kill", "killall",
  "curl", "wget",
  "ssh", "scp", "rsync",
]);

export function classifyBashCommand(command: string): SafetyLevel {
  const trimmed = command.trim();

  // Check for dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "dangerous";
    }
  }

  // Parse the first command in a pipe chain
  const firstCmd = trimmed.split(/[|;&]/).map(s => s.trim())[0] || trimmed;
  const words = firstCmd.split(/\s+/);
  const binary = words[0] || "";

  // Check exact safe commands
  if (SAFE_COMMANDS.has(binary)) {
    return "safe";
  }

  // Check safe prefixes
  for (const prefix of SAFE_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return "safe";
    }
  }

  // Check risky commands
  if (RISKY_COMMANDS.has(binary)) {
    return "risky";
  }

  // npm/yarn/pnpm run scripts are generally safe
  if (/^(npm|yarn|pnpm)\s+(run|test|start|build|lint)/.test(trimmed)) {
    return "safe";
  }

  // Default: risky (unknown commands should prompt)
  return "risky";
}
