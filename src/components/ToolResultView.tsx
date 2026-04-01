import React from "react";
import { Box, Text } from "ink";
import type { ToolUseBlock, ToolResultBlock } from "../types.js";

type ToolResultViewProps = {
  toolUse: ToolUseBlock;
  toolResult: ToolResultBlock;
};

/**
 * Renders tool results with type-specific formatting.
 * Mirrors Claude Code's src/components/messages/AssistantToolUseMessage.tsx
 */
export function ToolResultView({ toolUse, toolResult }: ToolResultViewProps) {
  const isError = toolResult.is_error;
  const content = toolResult.content;
  const maxPreviewLines = 10;

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Tool header */}
      <Text>
        <Text color={isError ? "red" : "cyan"}>
          {isError ? "✗" : "✓"}{" "}
        </Text>
        <Text color="yellow" bold>{toolUse.name}</Text>
        <Text color="gray"> {formatToolArgs(toolUse)}</Text>
      </Text>

      {/* Tool result preview */}
      {content && (
        <Box marginLeft={2} flexDirection="column">
          {renderContent(toolUse.name, content, isError, maxPreviewLines)}
        </Box>
      )}
    </Box>
  );
}

function formatToolArgs(toolUse: ToolUseBlock): string {
  const input = toolUse.input;
  switch (toolUse.name) {
    case "Bash":
      return typeof input.command === "string" ? `$ ${truncate(input.command as string, 60)}` : "";
    case "Read":
      return typeof input.file_path === "string" ? truncate(input.file_path as string, 60) : "";
    case "Write":
      return typeof input.file_path === "string" ? truncate(input.file_path as string, 60) : "";
    case "Edit":
      return typeof input.file_path === "string" ? truncate(input.file_path as string, 60) : "";
    case "Grep":
      return typeof input.pattern === "string" ? `/${truncate(input.pattern as string, 40)}/` : "";
    case "Glob":
      return typeof input.pattern === "string" ? truncate(input.pattern as string, 40) : "";
    default: {
      const primary = Object.values(input)[0];
      return typeof primary === "string" ? truncate(primary, 50) : "";
    }
  }
}

function renderContent(
  toolName: string,
  content: string,
  isError: boolean | undefined,
  maxLines: number
): React.ReactNode {
  const color = isError ? "red" : "gray";
  const lines = content.split("\n");
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  return (
    <>
      <Text color={color} dimColor>
        {displayLines.join("\n")}
      </Text>
      {truncated && (
        <Text color="gray" dimColor>
          ... ({lines.length - maxLines} more lines)
        </Text>
      )}
    </>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
