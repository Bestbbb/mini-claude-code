import type { SessionInfo } from "./bootstrap.js";
import type { Tool } from "./tool.js";

type SystemPromptOptions = {
  session: SessionInfo;
  tools: Tool[];
};

/**
 * Dynamically assemble the system prompt.
 * Mirrors Claude Code's src/constants/prompts.ts pattern of composing
 * multiple sections: base instructions, tool guide, environment, project context.
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const sections: string[] = [
    buildBaseInstructions(),
    buildToolGuide(options.tools),
    buildEnvironmentSection(options.session),
  ];

  // Append CLAUDE.md contents if any exist
  if (options.session.claudeMdContents.length > 0) {
    sections.push(buildProjectContext(options.session.claudeMdContents));
  }

  return sections.join("\n\n");
}

function buildBaseInstructions(): string {
  return `You are Claude, an AI assistant by Anthropic running as a CLI coding agent.
You help users with software engineering tasks including writing code, debugging, refactoring, and exploring codebases.

# Core Principles
- Be concise and direct in your responses
- Read files before modifying them to understand context
- Prefer editing existing files over creating new ones
- Use the most appropriate tool for each task
- When editing files, use the Edit tool with exact string matches
- Do not create files unless absolutely necessary
- Be careful not to introduce security vulnerabilities

# Output Style
- Keep responses short and focused
- Lead with the answer or action, not reasoning
- Only explain when necessary for understanding`;
}

function buildToolGuide(tools: Tool[]): string {
  const toolLines = tools.map((t) => `- ${t.name}: ${t.description.split(".")[0]}`);
  return `# Available Tools
${toolLines.join("\n")}

# Tool Usage Guidelines
- Use Read to examine files before modifying them
- Use Edit for targeted changes (find-and-replace), Write for new files
- Use Bash for shell commands, installations, and running scripts
- Use Grep to search file contents, Glob to find files by name pattern
- Use Agent to delegate complex sub-tasks to a sub-agent
- Prefer dedicated tools over Bash equivalents (Read over cat, Grep over grep)`;
}

function buildEnvironmentSection(session: SessionInfo): string {
  const lines = [
    `# Environment`,
    `- Working directory: ${session.cwd}`,
    `- Platform: ${session.os} ${session.osVersion}`,
    `- Shell: ${session.shell}`,
    `- Node: ${session.nodeVersion}`,
  ];

  lines.push(`- Date: ${new Date().toISOString().split("T")[0]}`);
  lines.push(`- Project: ${session.projectName}`);

  return lines.join("\n");
}

function buildProjectContext(claudeMdContents: string[]): string {
  return `# Project Instructions (from CLAUDE.md)
${claudeMdContents.join("\n\n---\n\n")}`;
}
