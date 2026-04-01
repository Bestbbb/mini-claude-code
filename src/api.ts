import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./tool.js";
import type {
  AssistantMessage,
  ContentBlock,
  Message,
  StreamEvent,
  TextBlock,
  ToolUseBlock,
  APIMessage,
} from "./types.js";
import { withRetry } from "./services/withRetry.js";
import type { TokenTracker } from "./services/tokenTracking.js";

export function createClient(apiKey: string, baseUrl?: string): Anthropic {
  const options: Record<string, unknown> = { apiKey };
  if (baseUrl) {
    options.baseURL = baseUrl;
  }
  return new Anthropic(options as any);
}

export function toolToAPISchema(tool: Tool): Anthropic.Messages.Tool {
  const jsonSchema = zodToJsonSchema(tool.inputSchema, { target: "openApi3" });
  // Remove $schema and top-level description from json-schema output
  const { $schema, ...schema } = jsonSchema as any;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Messages.Tool["input_schema"],
  };
}

function messagesToAPI(messages: Message[]): APIMessage[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return { role: "user" as const, content: msg.content };
      }
      // Convert ContentBlock[] to API format
      const blocks = msg.content.map((block) => {
        if (block.type === "tool_result") {
          return {
            type: "tool_result" as const,
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error,
          };
        }
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        return block;
      });
      return { role: "user" as const, content: blocks as any };
    }
    // AssistantMessage
    const blocks = msg.content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      return block;
    });
    return { role: "assistant" as const, content: blocks as any };
  });
}

export type StreamMessageParams = {
  client: Anthropic;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  messages: Message[];
  tools: Tool[];
  maxTokens?: number;
  tokenTracker?: TokenTracker;
  onRetry?: (attempt: number, delayMs: number, error: any) => void;
};

export async function* streamMessage(params: StreamMessageParams): AsyncGenerator<StreamEvent> {
  const {
    client,
    model,
    systemPrompt,
    messages,
    tools,
    maxTokens = 8192,
    tokenTracker,
    onRetry,
  } = params;

  const apiMessages = messagesToAPI(messages);
  const apiTools = tools.map(toolToAPISchema);

  // Build system prompt with cache_control for prompt caching
  const systemWithCache: Anthropic.Messages.TextBlockParam[] = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  // Create the stream (retry logic is applied at the API level for non-streaming;
  // for streaming, we rely on the SDK's built-in connection handling)
  const stream = client.messages.stream({
    model,
    system: systemWithCache,
    messages: apiMessages,
    tools: apiTools,
    max_tokens: maxTokens,
  });

  // Track content blocks being built
  const contentBlocks: ContentBlock[] = [];
  let currentToolInput = "";

  for await (const event of stream) {
    switch (event.type) {
      case "content_block_start": {
        const block = event.content_block;
        if (block.type === "text") {
          contentBlocks.push({ type: "text", text: "" });
        } else if (block.type === "tool_use") {
          contentBlocks.push({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: {},
          });
          currentToolInput = "";
          yield { type: "tool_use_begin", id: block.id, name: block.name };
        }
        break;
      }
      case "content_block_delta": {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          const lastBlock = contentBlocks[contentBlocks.length - 1] as TextBlock;
          lastBlock.text += delta.text;
          yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          currentToolInput += delta.partial_json;
          yield { type: "input_json_delta", partial_json: delta.partial_json };
        }
        break;
      }
      case "content_block_stop": {
        const lastBlock = contentBlocks[contentBlocks.length - 1];
        if (lastBlock?.type === "tool_use" && currentToolInput) {
          try {
            lastBlock.input = JSON.parse(currentToolInput);
          } catch {
            lastBlock.input = {};
          }
          currentToolInput = "";
        }
        if (lastBlock?.type === "tool_use") {
          yield { type: "tool_use_end" };
        }
        break;
      }
    }
  }

  const finalMessage = await stream.finalMessage();

  // Track token usage
  if (tokenTracker && finalMessage.usage) {
    tokenTracker.addUsage({
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      cacheReadTokens: (finalMessage.usage as any).cache_read_input_tokens,
      cacheWriteTokens: (finalMessage.usage as any).cache_creation_input_tokens,
      model,
      timestamp: Date.now(),
    });
  }

  const assistantMessage: AssistantMessage = {
    role: "assistant",
    content: contentBlocks,
    stop_reason: finalMessage.stop_reason,
  };

  yield { type: "message_complete", message: assistantMessage };
}
