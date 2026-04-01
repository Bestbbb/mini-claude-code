import React from "react";
import { Box, Text } from "ink";

type CommandOutputProps = {
  command: string;
  output: string | null;
};

/**
 * Renders the output of a slash command.
 * Mirrors Claude Code's src/components/messages/UserCommandMessage.tsx
 */
export function CommandOutput({ command, output }: CommandOutputProps) {
  return (
    <Box flexDirection="column">
      <Text color="magenta">
        <Text bold>/{command}</Text>
      </Text>
      {output && (
        <Box marginLeft={2}>
          <Text color="gray">{output}</Text>
        </Box>
      )}
    </Box>
  );
}
