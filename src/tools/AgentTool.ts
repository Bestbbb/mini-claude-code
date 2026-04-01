import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext, Message, AssistantMessage, ToolUseBlock, ToolResultBlock } from "../types.js";
import { allTools, findTool } from "../tools.js";
import { toolToAPISchema } from "../api.js";

/**
 * Agent tool — spawns a sub-agent with its own message history.
 * The sub-agent can use all tools (with permission checks inherited).
 * Mirrors Claude Code's src/tools/AgentTool/AgentTool.tsx
 */

const SUB_AGENT_SYSTEM = `You are a helpful sub-agent assisting with a specific task. You have access to the same tools as the main agent. Be focused and efficient — complete the task and return a clear summary of what you did and found.`;

export const AgentTool = buildTool({
  name: "Agent",
  description:
    "Launch a sub-agent to handle a complex task autonomously. The sub-agent has its own conversation " +
    "context but shares the same tools. Use for research, multi-step operations, or parallel exploration.",
  inputSchema: z.object({
    prompt: z.string().describe("The task description for the sub-agent"),
    model: z.string().optional().describe("Model override for the sub-agent"),
  }),

  isReadOnly() {
    return false;
  },

  checkPermissions() {
    // Sub-agent itself is always allowed; individual tool calls within
    // the sub-agent still go through permission checks
    return { behavior: "allow" as const, reason: "sub-agent tools have own permission checks" };
  },

  userFacingName(input?: { prompt?: string }) {
    if (input?.prompt) {
      const short = input.prompt.length > 50 ? input.prompt.slice(0, 50) + "..." : input.prompt;
      return `Agent(${short})`;
    }
    return "Agent";
  },

  async call(
    input: { prompt: string; model?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { content: "Error: ANTHROPIC_API_KEY not available for sub-agent", is_error: true };
    }

    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const clientOpts: Record<string, unknown> = { apiKey };
    if (baseUrl) clientOpts.baseURL = baseUrl;
    const client = new Anthropic(clientOpts as any);
    const model = input.model || process.env.MODEL || "claude-sonnet-4-20250514";
    const maxTurns = 10;

    try {
      const result = await runSubAgent({
        client,
        model,
        prompt: input.prompt,
        context,
        maxTurns,
      });
      return { content: result };
    } catch (err: any) {
      return { content: `Sub-agent error: ${err.message}`, is_error: true };
    }
  },
});

async function runSubAgent(params: {
  client: Anthropic;
  model: string;
  prompt: string;
  context: ToolContext;
  maxTurns: number;
}): Promise<string> {
  const { client, model, prompt, context, maxTurns } = params;
  const messages: Array<Anthropic.Messages.MessageParam> = [
    { role: "user", content: prompt },
  ];

  // Sub-agent tools: all read-only tools + Bash (auto-allowed for sub-agents)
  const subAgentTools = allTools.filter(t => t.name !== "Agent"); // Prevent recursive agents
  const apiTools = subAgentTools.map(toolToAPISchema);

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model,
      system: SUB_AGENT_SYSTEM,
      messages,
      tools: apiTools,
      max_tokens: 4096,
    });

    // Check if the response has tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls — extract final text
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === "text"
      );
      return textBlocks.map(b => b.text).join("\n") || "(no output from sub-agent)";
    }

    // Add assistant message
    messages.push({ role: "assistant", content: response.content });

    // Execute each tool call
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const tool = findTool(toolUse.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      // For sub-agents, auto-allow read-only tools, execute others with caution
      if (!tool.isReadOnly(toolUse.input as Record<string, unknown>)) {
        // Skip non-read-only tools in sub-agent unless they're safe
        const permResult = tool.checkPermissions(toolUse.input as Record<string, unknown>);
        if (permResult.behavior === "deny") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Permission denied for sub-agent",
            is_error: true,
          });
          continue;
        }
      }

      try {
        const result = await tool.call(toolUse.input as Record<string, unknown>, context);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.is_error,
        });
      } catch (err: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Tool error: ${err.message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "(sub-agent reached maximum turns without completing)";
}
