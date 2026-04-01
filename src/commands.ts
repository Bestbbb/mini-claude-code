import type { Message, AppState } from "./types.js";
import type { SessionInfo } from "./bootstrap.js";
import type { Settings } from "./settings.js";
import type { TokenTracker } from "./services/tokenTracking.js";

// ─── Command System ───

export type CommandContext = {
  messages: Message[];
  setMessages: (msgs: Message[]) => void;
  appState: AppState;
  session: SessionInfo;
  settings: Settings;
  tokenTracker: TokenTracker;
  model: string;
  setModel: (model: string) => void;
  exit: () => void;
  apiKey: string;
  baseUrl?: string;
};

export type Command = {
  name: string;
  description: string;
  aliases?: string[];
  execute(args: string, context: CommandContext): Promise<string | null>;
};

const commandRegistry = new Map<string, Command>();

export function registerCommand(command: Command): void {
  commandRegistry.set(command.name, command);
  if (command.aliases) {
    for (const alias of command.aliases) {
      commandRegistry.set(alias, command);
    }
  }
}

export function getCommand(name: string): Command | undefined {
  return commandRegistry.get(name);
}

export function getAllCommands(): Command[] {
  // Deduplicate (aliases point to same command)
  const seen = new Set<Command>();
  const commands: Command[] = [];
  for (const cmd of commandRegistry.values()) {
    if (!seen.has(cmd)) {
      seen.add(cmd);
      commands.push(cmd);
    }
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse user input to detect slash commands.
 * Returns null if input is not a command.
 */
export function parseCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { name: trimmed.slice(1).toLowerCase(), args: "" };
  }
  return {
    name: trimmed.slice(1, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

/**
 * Execute a slash command. Returns the output string, or null if not found.
 */
export async function executeCommand(
  name: string,
  args: string,
  context: CommandContext
): Promise<{ output: string | null; found: boolean }> {
  const command = getCommand(name);
  if (!command) {
    return {
      output: `Unknown command: /${name}. Type /help for available commands.`,
      found: false,
    };
  }

  const output = await command.execute(args, context);
  return { output, found: true };
}

/**
 * Get command names for tab completion.
 */
export function getCommandNames(): string[] {
  return getAllCommands().map((c) => c.name);
}
