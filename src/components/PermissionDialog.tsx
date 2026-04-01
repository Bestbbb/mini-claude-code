import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PermissionAnswer } from "../types.js";

type PermissionDialogProps = {
  toolName: string;
  toolInput: Record<string, unknown>;
  onResolve: (answer: PermissionAnswer) => void;
};

export function PermissionDialog({ toolName, toolInput, onResolve }: PermissionDialogProps) {
  const [resolved, setResolved] = useState(false);

  useInput((input, key) => {
    if (resolved) return;

    const ch = input.toLowerCase();
    if (ch === "y" || key.return) {
      setResolved(true);
      onResolve({ allowed: true });
    } else if (ch === "n" || key.escape) {
      setResolved(true);
      onResolve({ allowed: false });
    } else if (ch === "a") {
      setResolved(true);
      onResolve({ allowed: true, always: true });
    }
  });

  if (resolved) return null;

  // Build a summary of what the tool wants to do
  const summary = buildSummary(toolInput);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        Permission Required
      </Text>
      <Text>
        <Text color="white" bold>{toolName}</Text>
      </Text>
      {summary && (
        <Text color="gray" wrap="truncate-end">
          {summary}
        </Text>
      )}
      <Box marginTop={1}>
        <Text>
          <Text color="green" bold>(y)</Text><Text>es</Text>
          {"  "}
          <Text color="red" bold>(n)</Text><Text>o</Text>
          {"  "}
          <Text color="blue" bold>(a)</Text><Text>lways allow</Text>
        </Text>
      </Box>
    </Box>
  );
}

function buildSummary(input: Record<string, unknown>): string {
  if (typeof input.command === "string") {
    return `$ ${input.command}`;
  }
  if (typeof input.file_path === "string") {
    const parts: string[] = [input.file_path as string];
    if (typeof input.content === "string") {
      parts.push(`(${(input.content as string).split("\n").length} lines)`);
    }
    if (typeof input.old_string === "string") {
      parts.push(`replace: "${(input.old_string as string).slice(0, 60)}..."`);
    }
    return parts.join(" ");
  }
  return "";
}
