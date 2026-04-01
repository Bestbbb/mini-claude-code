import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { getCommandNames } from "../commands.js";

type PromptInputProps = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

export function PromptInput({ onSubmit, disabled = false }: PromptInputProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tabCompletions, setTabCompletions] = useState<string[] | null>(null);
  const [tabIndex, setTabIndex] = useState(0);

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) {
        setHistory((prev) => [trimmed, ...prev]);
        setHistoryIndex(-1);
        setTabCompletions(null);
        onSubmit(trimmed);
        setValue("");
      }
      return;
    }

    if (key.tab) {
      if (value.startsWith("/")) {
        const partial = value.slice(1).toLowerCase();
        const commandNames = getCommandNames();
        const matches = commandNames.filter((name) => name.startsWith(partial));

        if (matches.length === 1) {
          setValue(`/${matches[0]!} `);
          setTabCompletions(null);
        } else if (matches.length > 1) {
          if (tabCompletions && tabCompletions.length > 0) {
            const nextIndex = (tabIndex + 1) % tabCompletions.length;
            setTabIndex(nextIndex);
            setValue(`/${tabCompletions[nextIndex]!}`);
          } else {
            setTabCompletions(matches);
            setTabIndex(0);
            setValue(`/${matches[0]!}`);
          }
        }
      }
      return;
    }

    if (tabCompletions) {
      setTabCompletions(null);
      setTabIndex(0);
    }

    if (key.upArrow) {
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setValue(history[newIndex]!);
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setValue(history[newIndex]!);
      } else {
        setHistoryIndex(-1);
        setValue("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (key.ctrl && input === "c") {
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="greenBright" bold>
          {"❯ "}
        </Text>
        {disabled ? (
          <Text color="gray" dimColor italic>waiting for response...</Text>
        ) : (
          <Text color="whiteBright" bold>
            {value}
            <Text color="cyanBright">█</Text>
          </Text>
        )}
      </Box>
      {tabCompletions && tabCompletions.length > 1 && (
        <Box marginLeft={2}>
          {tabCompletions.map((c, i) => (
            <Text key={c} color={i === tabIndex ? "cyanBright" : "gray"} bold={i === tabIndex}>
              {"  /"}{c}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
