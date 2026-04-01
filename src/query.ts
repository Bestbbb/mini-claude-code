import { createClient, streamMessage } from "./api.js";
import { hasPermissionsToUseTool, buildAlwaysAllowRule } from "./permissions.js";
import { findTool } from "./tools.js";
import { autoCompactIfNeeded } from "./services/compact.js";
import { runPreToolHooks, runPostToolHooks } from "./hooks.js";
import type { Tool } from "./tool.js";
import type {
  Message,
  AssistantMessage,
  ToolUseBlock,
  ToolResultBlock,
  PermissionAnswer,
  AppState,
  ToolContext,
} from "./types.js";
import type { Settings } from "./settings.js";
import type { TokenTracker } from "./services/tokenTracking.js";

// Events yielded by the query generator to the UI layer
export type QueryEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_begin"; id: string; name: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "tool_use_end" }
  | { type: "message_complete"; message: AssistantMessage }
  | { type: "tool_executing"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string; is_error?: boolean }
  | { type: "turn_complete"; messages: Message[] }
  | { type: "auto_compact"; messagesBefore: number; messagesAfter: number }
  | { type: "api_retry"; attempt: number; delayMs: number; error: string }
  | { type: "hook_blocked"; toolName: string; message: string };

export type QueryParams = {
  messages: Message[];
  systemPrompt: string;
  tools: Tool[];
  apiKey: string;
  baseUrl?: string;
  model: string;
  appState: AppState;
  toolContext: ToolContext;
  settings?: Settings;
  tokenTracker?: TokenTracker;
  /**
   * Callback invoked when a tool needs permission.
   * The App layer shows a dialog and resolves the promise when the user responds.
   */
  canUseTool: (toolName: string, toolInput: Record<string, unknown>) => Promise<PermissionAnswer>;
};

/**
 * Core agentic loop — AsyncGenerator driven while(true).
 *
 * Mirrors Claude Code's src/query.ts queryLoop pattern:
 *   1. Auto-compact if context is getting large
 *   2. Convert messages → API format
 *   3. Stream API response, yield text_delta events
 *   4. If no tool_use → return completed
 *   5. For each tool_use → hooks → permission check → execute → hooks → collect results
 *   6. Append tool_results as UserMessage, continue loop
 */
export async function* query(params: QueryParams): AsyncGenerator<QueryEvent> {
  const {
    systemPrompt,
    tools,
    apiKey,
    baseUrl,
    model,
    appState,
    toolContext,
    canUseTool,
    settings,
    tokenTracker,
  } = params;
  const client = createClient(apiKey, baseUrl);
  let messages: Message[] = [...params.messages];

  while (true) {
    // ── Step 0: Auto-compact if needed ──
    try {
      const compactResult = await autoCompactIfNeeded(messages, {
        client,
        model,
        maxContextTokens: settings?.maxTurnTokens ?? 150000,
      });
      if (compactResult.didCompact) {
        const messagesBefore = messages.length;
        messages = compactResult.messages;
        yield {
          type: "auto_compact",
          messagesBefore,
          messagesAfter: messages.length,
        };
      }
    } catch {
      // Auto-compact failure is non-fatal, continue with original messages
    }

    // ── Step 1-2: Stream the API response ──
    let assistantMessage: AssistantMessage | null = null;

    for await (const event of streamMessage({
      client,
      model,
      systemPrompt,
      messages,
      tools,
      tokenTracker,
      onRetry: (attempt, delayMs, error) => {
        // We can't yield from inside a callback, so retries are silent
        // The withRetry module handles the actual retry logic
      },
    })) {
      yield event;
      if (event.type === "message_complete") {
        assistantMessage = event.message;
      }
    }

    if (!assistantMessage) {
      break;
    }

    // ── Step 3: Add assistant message, check for tool calls ──
    messages.push(assistantMessage);

    const toolUseBlocks = assistantMessage.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      yield { type: "turn_complete", messages };
      return;
    }

    // ── Step 4: Process each tool call ──
    const toolResults: ToolResultBlock[] = [];

    for (const toolUse of toolUseBlocks) {
      const tool = findTool(toolUse.name);

      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: Unknown tool "${toolUse.name}"`,
          is_error: true,
        });
        continue;
      }

      // ── Pre-tool hooks ──
      if (settings) {
        const hookResult = runPreToolHooks(
          settings,
          toolUse.name,
          toolUse.input,
          toolContext.cwd
        );
        if (hookResult.blocked) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Blocked by hook: ${hookResult.message || "PreToolUse hook denied"}`,
            is_error: true,
          });
          yield {
            type: "hook_blocked",
            toolName: toolUse.name,
            message: hookResult.message || "Blocked by PreToolUse hook",
          };
          continue;
        }
      }

      // ── Permission check ──
      const permCheck = hasPermissionsToUseTool(tool, toolUse.input, appState, settings);
      let allowed = permCheck.behavior === "allow";

      if (permCheck.behavior === "ask") {
        // Ask the UI for permission (blocks until user responds)
        const answer = await canUseTool(
          tool.userFacingName(toolUse.input),
          toolUse.input
        );
        allowed = answer.allowed;

        if (answer.always) {
          const rule = buildAlwaysAllowRule(tool.name, toolUse.input);
          appState.alwaysAllowRules.add(rule);
        }
      } else if (permCheck.behavior === "deny") {
        allowed = false;
      }

      if (!allowed) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Permission denied by user.",
          is_error: true,
        });
        yield { type: "tool_result", name: toolUse.name, result: "Permission denied", is_error: true };
        continue;
      }

      // ── Execute the tool ──
      yield { type: "tool_executing", name: toolUse.name, input: toolUse.input };

      try {
        const result = await tool.call(toolUse.input, toolContext);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.is_error,
        });
        yield {
          type: "tool_result",
          name: toolUse.name,
          result: result.content,
          is_error: result.is_error,
        };

        // ── Post-tool hooks ──
        if (settings) {
          runPostToolHooks(settings, toolUse.name, toolUse.input, result.content, toolContext.cwd);
        }
      } catch (err: any) {
        const errorMsg = `Tool execution error: ${err.message}`;
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: errorMsg,
          is_error: true,
        });
        yield { type: "tool_result", name: toolUse.name, result: errorMsg, is_error: true };
      }
    }

    // ── Step 5: Append tool results, continue loop ──
    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  yield { type: "turn_complete", messages };
}
