import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import type { Message, AssistantMessage, PermissionAnswer, AppState, ToolContext, DisplayMessage, CommandMessage } from "../types.js";
import type { Tool } from "../tool.js";
import type { SessionInfo } from "../bootstrap.js";
import type { Settings } from "../settings.js";
import type { TokenTracker } from "../services/tokenTracking.js";
import { query, type QueryEvent } from "../query.js";
import { parseCommand, executeCommand, type CommandContext } from "../commands.js";
import { saveSession } from "../services/sessionStorage.js";
import { setAskUserCallback, clearAskUserCallback } from "../tools/AskUserTool.js";
import { MessageList } from "./MessageList.js";
import { PromptInput } from "./PromptInput.js";
import { PermissionDialog } from "./PermissionDialog.js";
import { Spinner } from "./Spinner.js";
import { CostDisplay } from "./CostDisplay.js";

type AppProps = {
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  tools: Tool[];
  appState: AppState;
  initialPrompt?: string;
  printMode?: boolean;
  session: SessionInfo;
  settings: Settings;
  tokenTracker: TokenTracker;
  resumedMessages?: Message[];
};

type PendingPermission = {
  toolName: string;
  toolInput: Record<string, unknown>;
  resolve: (answer: PermissionAnswer) => void;
};

type PendingAskUser = {
  question: string;
  resolve: (answer: string) => void;
};

export function App({
  apiKey,
  baseUrl,
  model: initialModel,
  systemPrompt,
  tools,
  appState,
  initialPrompt,
  printMode,
  session,
  settings,
  tokenTracker,
  resumedMessages,
}: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>(resumedMessages || []);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(resumedMessages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [spinnerLabel, setSpinnerLabel] = useState("Thinking...");
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [pendingAskUser, setPendingAskUser] = useState<PendingAskUser | null>(null);
  const [currentModel, setCurrentModel] = useState(initialModel);
  const initialPromptSent = useRef(false);

  const toolContext: ToolContext = {
    cwd: session.cwd,
    projectRoot: session.projectRoot,
    sessionId: session.sessionId,
  };

  // Set up AskUser callback
  useEffect(() => {
    setAskUserCallback((question: string) => {
      return new Promise<string>((resolve) => {
        setPendingAskUser({ question, resolve });
      });
    });
    return () => clearAskUserCallback();
  }, []);

  // Auto-save session on message changes
  useEffect(() => {
    if (messages.length > 0) {
      try {
        saveSession(session.sessionId, messages, {
          cwd: session.cwd,
          startedAt: session.startedAt,
        });
      } catch {
        // Silent save failures
      }
    }
  }, [messages, session]);

  const runQuery = useCallback(async (userText: string) => {
    const userMessage: Message = { role: "user", content: userText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setDisplayMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingText("");
    setSpinnerLabel("Thinking...");

    const canUseTool = (toolName: string, toolInput: Record<string, unknown>): Promise<PermissionAnswer> => {
      return new Promise<PermissionAnswer>((resolve) => {
        setPendingPermission({ toolName, toolInput, resolve });
      });
    };

    try {
      const gen = query({
        messages: newMessages,
        systemPrompt,
        tools,
        apiKey,
        baseUrl,
        model: currentModel,
        appState,
        toolContext,
        canUseTool,
        settings,
        tokenTracker,
      });

      let currentText = "";

      for await (const event of gen) {
        switch (event.type) {
          case "text_delta":
            currentText += event.text;
            setStreamingText(currentText);
            break;

          case "tool_use_begin":
            setStreamingText("");
            currentText = "";
            setActiveToolName(event.name);
            setSpinnerLabel(`Calling ${event.name}...`);
            break;

          case "tool_use_end":
            break;

          case "message_complete":
            setStreamingText("");
            currentText = "";
            break;

          case "tool_executing":
            setActiveToolName(event.name);
            setSpinnerLabel(`Running ${event.name}...`);
            break;

          case "tool_result":
            setActiveToolName(null);
            setSpinnerLabel("Thinking...");
            break;

          case "turn_complete":
            setMessages(event.messages);
            setDisplayMessages((prev) => {
              // Replace messages portion in display messages
              const nonMessageItems = prev.filter((m): m is CommandMessage => "type" in m && m.type === "command");
              // Interleave command messages back... simplified: just use messages
              return [...event.messages];
            });
            break;

          case "auto_compact":
            setSpinnerLabel("Auto-compacting conversation...");
            break;

          case "hook_blocked":
            break;
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || "Unknown error";
      const errorAssistant: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: `Error: ${errorMsg}` }],
        stop_reason: "error",
      };
      setMessages((prev) => [...prev, errorAssistant]);
      setDisplayMessages((prev) => [...prev, errorAssistant]);
    } finally {
      setIsLoading(false);
      setStreamingText("");
      setActiveToolName(null);
      setPendingPermission(null);

      if (printMode) {
        exit();
      }
    }
  }, [messages, systemPrompt, tools, apiKey, currentModel, appState, toolContext, settings, tokenTracker, printMode, exit]);

  // Handle initial prompt
  useEffect(() => {
    if (initialPrompt && !initialPromptSent.current) {
      initialPromptSent.current = true;
      runQuery(initialPrompt);
    }
  }, [initialPrompt, runQuery]);

  const handleSubmit = useCallback(async (text: string) => {
    // Check for slash commands
    const parsed = parseCommand(text);
    if (parsed) {
      const commandContext: CommandContext = {
        messages,
        setMessages: (msgs: Message[]) => {
          setMessages(msgs);
          setDisplayMessages([...msgs]);
        },
        appState,
        session,
        settings,
        tokenTracker,
        model: currentModel,
        setModel: setCurrentModel,
        exit,
        apiKey,
        baseUrl,
      };

      const { output } = await executeCommand(parsed.name, parsed.args, commandContext);

      // Add command output to display
      const cmdMsg: CommandMessage = {
        type: "command",
        command: `${parsed.name}${parsed.args ? " " + parsed.args : ""}`,
        output,
      };
      setDisplayMessages((prev) => [...prev, cmdMsg]);
      return;
    }

    runQuery(text);
  }, [messages, appState, session, settings, tokenTracker, currentModel, exit, apiKey, runQuery]);

  const handlePermissionResolve = useCallback((answer: PermissionAnswer) => {
    if (pendingPermission) {
      pendingPermission.resolve(answer);
      setPendingPermission(null);
    }
  }, [pendingPermission]);

  const handleAskUserSubmit = useCallback((text: string) => {
    if (pendingAskUser) {
      pendingAskUser.resolve(text);
      setPendingAskUser(null);
    }
  }, [pendingAskUser]);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Text color="cyanBright" bold>
          {"╭─ "}mini-claude-code{" ─╮"}
        </Text>
        <Text color="gray">
          {"│ "}model: <Text color="yellowBright" bold>{currentModel}</Text>
          {"  │ "}/help for commands
        </Text>
        <Text color="cyanBright" bold>
          {"╰──────────────────╯"}
        </Text>
      </Box>

      {/* Message List */}
      <MessageList
        messages={displayMessages}
        streamingText={streamingText || undefined}
        activeToolName={activeToolName || undefined}
      />

      {/* Loading Spinner */}
      {isLoading && !streamingText && !pendingPermission && !pendingAskUser && (
        <Spinner label={spinnerLabel} />
      )}

      {/* Permission Dialog */}
      {pendingPermission && (
        <PermissionDialog
          toolName={pendingPermission.toolName}
          toolInput={pendingPermission.toolInput}
          onResolve={handlePermissionResolve}
        />
      )}

      {/* AskUser Dialog */}
      {pendingAskUser && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>Question from Claude:</Text>
          <Text>{pendingAskUser.question}</Text>
          <Box marginTop={1}>
            <PromptInput onSubmit={handleAskUserSubmit} disabled={false} />
          </Box>
        </Box>
      )}

      {/* Cost Display */}
      {!printMode && tokenTracker.getApiCallCount() > 0 && (
        <CostDisplay tokenTracker={tokenTracker} model={currentModel} />
      )}

      {/* Input Prompt */}
      {!printMode && !pendingAskUser && (
        <Box marginTop={1}>
          <PromptInput onSubmit={handleSubmit} disabled={isLoading} />
        </Box>
      )}
    </Box>
  );
}
