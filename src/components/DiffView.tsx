import React from "react";
import { Box, Text } from "ink";

type DiffViewProps = {
  oldString: string;
  newString: string;
  filePath?: string;
};

/**
 * Simple unified diff rendering with color-coded lines.
 * Mirrors Claude Code's src/components/diff/
 */
export function DiffView({ oldString, newString, filePath }: DiffViewProps) {
  const diff = computeSimpleDiff(oldString, newString);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {filePath && (
        <Text color="white" bold>
          {filePath}
        </Text>
      )}
      {diff.map((line, i) => (
        <DiffLine key={i} line={line} />
      ))}
    </Box>
  );
}

type DiffLineType = "add" | "remove" | "context";

type DiffLineInfo = {
  type: DiffLineType;
  content: string;
  lineNum?: number;
};

function DiffLine({ line }: { line: DiffLineInfo }) {
  switch (line.type) {
    case "add":
      return (
        <Text color="green">
          {"+ "}{line.content}
        </Text>
      );
    case "remove":
      return (
        <Text color="red">
          {"- "}{line.content}
        </Text>
      );
    case "context":
      return (
        <Text color="gray" dimColor>
          {"  "}{line.content}
        </Text>
      );
  }
}

/**
 * Compute a simple line-level diff between two strings.
 * Uses a basic LCS-like approach for small inputs.
 */
function computeSimpleDiff(oldStr: string, newStr: string): DiffLineInfo[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const result: DiffLineInfo[] = [];

  // Simple diff: find matching lines and mark additions/removals
  let oldIdx = 0;
  let newIdx = 0;
  const contextBefore = 2;
  const contextAfter = 2;

  // Build a simple edit script
  const changes: DiffLineInfo[] = [];

  // Use a simple approach: find common prefix, then common suffix, diff the middle
  let commonStart = 0;
  while (commonStart < oldLines.length && commonStart < newLines.length &&
         oldLines[commonStart] === newLines[commonStart]) {
    commonStart++;
  }

  let commonEnd = 0;
  while (commonEnd < oldLines.length - commonStart &&
         commonEnd < newLines.length - commonStart &&
         oldLines[oldLines.length - 1 - commonEnd] === newLines[newLines.length - 1 - commonEnd]) {
    commonEnd++;
  }

  // Show context around changes
  const contextStart = Math.max(0, commonStart - contextBefore);
  const contextEnd = Math.min(
    Math.max(oldLines.length, newLines.length),
    Math.max(oldLines.length, newLines.length) - commonEnd + contextAfter
  );

  // Add context before
  for (let i = contextStart; i < commonStart; i++) {
    if (i < oldLines.length) {
      changes.push({ type: "context", content: oldLines[i]! });
    }
  }

  // Add removed lines
  for (let i = commonStart; i < oldLines.length - commonEnd; i++) {
    changes.push({ type: "remove", content: oldLines[i]! });
  }

  // Add new lines
  for (let i = commonStart; i < newLines.length - commonEnd; i++) {
    changes.push({ type: "add", content: newLines[i]! });
  }

  // Add context after
  for (let i = Math.max(oldLines.length, newLines.length) - commonEnd;
       i < Math.min(Math.max(oldLines.length, newLines.length) - commonEnd + contextAfter, Math.max(oldLines.length, newLines.length));
       i++) {
    if (i < oldLines.length) {
      changes.push({ type: "context", content: oldLines[i]! });
    } else if (i < newLines.length) {
      changes.push({ type: "context", content: newLines[i]! });
    }
  }

  return changes.length > 0 ? changes : [{ type: "context", content: "(no changes)" }];
}

/**
 * Render a pre-computed unified diff string (e.g., from git diff).
 */
export function UnifiedDiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        let color: string = "gray";
        if (line.startsWith("+") && !line.startsWith("+++")) color = "green";
        else if (line.startsWith("-") && !line.startsWith("---")) color = "red";
        else if (line.startsWith("@@")) color = "cyan";

        return (
          <Text key={i} color={color}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
