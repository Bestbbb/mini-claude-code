import type { Tool } from "./tool.js";
import { BashTool } from "./tools/BashTool.js";
import { FileReadTool } from "./tools/FileReadTool.js";
import { FileWriteTool } from "./tools/FileWriteTool.js";
import { FileEditTool } from "./tools/FileEditTool.js";
import { GrepTool } from "./tools/GrepTool.js";
import { GlobTool } from "./tools/GlobTool.js";
import { AgentTool } from "./tools/AgentTool.js";
import { WebFetchTool } from "./tools/WebFetchTool.js";
import { WebSearchTool } from "./tools/WebSearchTool.js";
import { AskUserTool } from "./tools/AskUserTool.js";
import { TodoWriteTool } from "./tools/TodoWriteTool.js";
import { NotebookEditTool } from "./tools/NotebookEditTool.js";
import { SkillTool } from "./tools/SkillTool.js";

export const allTools: Tool[] = [
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GrepTool,
  GlobTool,
  AgentTool,
  WebFetchTool,
  WebSearchTool,
  AskUserTool,
  TodoWriteTool,
  NotebookEditTool,
  SkillTool,
];

export function findTool(name: string): Tool | undefined {
  return allTools.find((t) => t.name === name);
}
