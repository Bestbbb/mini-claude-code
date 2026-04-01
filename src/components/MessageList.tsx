import React from "react";
import { Box, Text } from "ink";
import type {
  Message,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
  DisplayMessage,
  CommandMessage,
} from "../types.js";
import { ToolResultView } from "./ToolResultView.js";
import { CommandOutput } from "./CommandOutput.js";

type MessageListProps = {
  messages: DisplayMessage[];
  streamingText?: string;
  activeToolName?: string;
};

export function MessageList({ messages, streamingText, activeToolName }: MessageListProps) {
  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((msg, i) => (
        <MessageView key={i} message={msg} />
      ))}
      {streamingText && (
        <Box flexDirection="column">
          <Text color="green" bold>Claude: </Text>
          <Text>{streamingText}</Text>
        </Box>
      )}
      {activeToolName && !streamingText && (
        <Text color="cyan">Running {activeToolName}...</Text>
      )}
    </Box>
  );
}

function MessageView({ message }: { message: DisplayMessage }) {
  // Command messages
  if ("type" in message && (message as CommandMessage).type === "command") {
    const cmd = message as CommandMessage;
    return <CommandOutput command={cmd.command} output={cmd.output} />;
  }

  // Regular messages
  const msg = message as Message;
  if (msg.role === "user") {
    return <UserMessageView message={msg} />;
  }
  return <AssistantMessageView message={msg} />;
}

function UserMessageView({ message }: { message: { role: "user"; content: string | ContentBlock[] } }) {
  if (typeof message.content === "string") {
    return (
      <Box>
        <Text color="blue" bold>You: </Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  // Tool results — show with enhanced rendering
  const toolResults = message.content.filter((b): b is ToolResultBlock => b.type === "tool_result");
  if (toolResults.length > 0) {
    return (
      <Box flexDirection="column">
        {toolResults.map((tr, i) => (
          <Box key={i} flexDirection="column">
            <Text color={tr.is_error ? "red" : "gray"} dimColor>
              {tr.is_error ? "✗ Tool error" : "✓ Tool result"} ({tr.content.length} chars)
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  return null;
}

function AssistantMessageView({ message }: { message: { role: "assistant"; content: ContentBlock[] } }) {
  const textBlocks = message.content.filter((b): b is TextBlock => b.type === "text");
  const toolUseBlocks = message.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

  // Find matching tool results from the next user message (if available in context)
  // For now we just show tool use blocks without their results inline

  return (
    <Box flexDirection="column">
      {textBlocks.map((block, i) => (
        <Box key={`text-${i}`} flexDirection="column">
          {i === 0 && <Text color="green" bold>Claude: </Text>}
          <Text>{block.text}</Text>
        </Box>
      ))}
      {toolUseBlocks.map((block, i) => (
        <Box key={`tool-${i}`} marginLeft={2}>
          <Text color="yellow">
            ⚡ {block.name}
            <Text color="gray"> {formatToolInput(block.input)}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function formatToolInput(input: Record<string, unknown>): string {
  // Type-specific formatting
  if (typeof input.command === "string") {
    return `$ ${truncate(input.command, 80)}`;
  }
  if (typeof input.file_path === "string") {
    return truncate(input.file_path, 80);
  }
  if (typeof input.pattern === "string") {
    return `/${truncate(input.pattern, 40)}/`;
  }
  if (typeof input.url === "string") {
    return truncate(input.url, 60);
  }
  if (typeof input.prompt === "string") {
    return truncate(input.prompt, 60);
  }
  if (typeof input.query === "string") {
    return truncate(input.query, 60);
  }
  if (typeof input.question === "string") {
    return truncate(input.question, 60);
  }
  const primary = Object.values(input)[0];
  if (typeof primary === "string") {
    return truncate(primary, 80);
  }
  return JSON.stringify(input).slice(0, 80);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
