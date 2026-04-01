import { z } from "zod";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

/**
 * Skill tool — load and execute predefined prompt templates.
 * Skills are stored as text/markdown files in ~/.claude/skills/
 * Mirrors Claude Code's src/tools/SkillTool/
 */

function getSkillsDir(): string {
  return resolve(homedir(), ".claude", "skills");
}

export const SkillTool = buildTool({
  name: "Skill",
  description:
    "Execute a predefined skill (prompt template). Skills are loaded from ~/.claude/skills/. " +
    "Use this to run common workflows with pre-configured prompts.",
  inputSchema: z.object({
    skill_name: z.string().describe("Name of the skill to execute (filename without extension)"),
    args: z.record(z.string()).optional().describe("Optional arguments to interpolate into the skill template"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "allow" as const, reason: "skills are just prompt templates" };
  },

  userFacingName(input?: { skill_name?: string }) {
    if (input?.skill_name) {
      return `Skill(${input.skill_name})`;
    }
    return "Skill";
  },

  async call(
    input: { skill_name: string; args?: Record<string, string> },
    _context: ToolContext
  ): Promise<ToolResult> {
    const skillsDir = getSkillsDir();

    // Try to find the skill file
    const candidates = [
      resolve(skillsDir, `${input.skill_name}.md`),
      resolve(skillsDir, `${input.skill_name}.txt`),
      resolve(skillsDir, input.skill_name),
    ];

    let skillContent: string | null = null;
    let foundPath: string | null = null;

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        try {
          skillContent = readFileSync(candidate, "utf-8");
          foundPath = candidate;
          break;
        } catch {
          continue;
        }
      }
    }

    if (!skillContent) {
      // List available skills
      const available = listAvailableSkills();
      const availableList = available.length > 0
        ? `\n\nAvailable skills:\n${available.map(s => `  - ${s}`).join("\n")}`
        : "\n\nNo skills found. Create skills in ~/.claude/skills/";

      return {
        content: `Skill not found: ${input.skill_name}${availableList}`,
        is_error: true,
      };
    }

    // Interpolate arguments
    let processed = skillContent;
    if (input.args) {
      for (const [key, value] of Object.entries(input.args)) {
        processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }
    }

    return {
      content: `[Skill: ${input.skill_name} from ${foundPath}]\n\n${processed}`,
    };
  },
});

function listAvailableSkills(): string[] {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) return [];

  try {
    return readdirSync(skillsDir)
      .filter(f => f.endsWith(".md") || f.endsWith(".txt"))
      .map(f => f.replace(/\.(md|txt)$/, ""));
  } catch {
    return [];
  }
}
