import type Anthropic from "@anthropic-ai/sdk";

// ─── Message Types ───

export type TextBlock = {
  type: "text";
  text: string;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type UserMessage = {
  role: "user";
  content: string | ContentBlock[];
};

export type AssistantMessage = {
  role: "assistant";
  content: ContentBlock[];
  stop_reason: string | null;
};

export type SystemMessage = {
  role: "system";
  content: string;
};

export type Message = UserMessage | AssistantMessage;

// ─── Stream Events ───

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_begin"; id: string; name: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "tool_use_end" }
  | { type: "message_complete"; message: AssistantMessage };

// ─── Permission Types ───

export type PermissionMode = "default" | "auto" | "bypass";

export type PermissionBehavior = "allow" | "deny" | "ask";

export type PermissionResult = {
  behavior: PermissionBehavior;
  reason?: string;
};

export type PermissionAnswer = {
  allowed: boolean;
  always?: boolean;
};

// ─── Tool Types ───

export type ToolResult = {
  content: string;
  is_error?: boolean;
};

export type ToolContext = {
  cwd: string;
  projectRoot?: string;
  sessionId?: string;
};

// ─── App State ───

export type AppState = {
  permissionMode: PermissionMode;
  alwaysAllowRules: Set<string>;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
};

// ─── UI Display Types ───

export type CommandMessage = {
  type: "command";
  command: string;
  output: string | null;
};

export type DisplayMessage = Message | CommandMessage;

// ─── Query Params ───

export type QueryParams = {
  messages: Message[];
  systemPrompt: string;
  tools: import("./tool.js").Tool[];
  apiKey: string;
  model: string;
  canUseTool: (toolName: string, toolInput: Record<string, unknown>) => Promise<PermissionAnswer>;
};

// Re-export Anthropic types for convenience
export type APIMessage = Anthropic.Messages.MessageParam;
export type APIContentBlock = Anthropic.Messages.ContentBlockParam;
