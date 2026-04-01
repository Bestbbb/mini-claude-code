#!/usr/bin/env node
import { config } from "dotenv";
config({ quiet: true } as any); // Load .env silently

import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { App } from "./components/App.js";
import { allTools } from "./tools.js";
import { initSession } from "./bootstrap.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { loadSettings } from "./settings.js";
import { createTokenTracker } from "./services/tokenTracking.js";
import { loadSession, getLastSessionId } from "./services/sessionStorage.js";
import type { AppState, PermissionMode, Message } from "./types.js";

// Register all slash commands (side-effect imports)
import "./commands/help.js";
import "./commands/clear.js";
import "./commands/compact.js";
import "./commands/model.js";
import "./commands/exit.js";
import "./commands/cost.js";
import "./commands/memory.js";
import "./commands/config.js";
import "./commands/resume.js";
import "./commands/sessions.js";

const program = new Command();

program
  .name("mini-claude-code")
  .description("Minimal reproduction of Claude Code's core architecture")
  .version("0.1.0")
  .option("-m, --model <model>", "Model to use")
  .option("-p, --print <prompt>", "Non-interactive mode: run prompt and exit")
  .option("--dangerously-skip-permissions", "Skip all permission checks (bypass mode)")
  .option("--auto", "Automatically approve all tool calls (auto mode)")
  .option("-k, --api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env var)")
  .option("--base-url <url>", "Custom API base URL (or set ANTHROPIC_BASE_URL env var)")
  .option("--resume [sessionId]", "Resume a previous session")
  .argument("[prompt]", "Initial prompt to send")
  .action((prompt, options) => {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("Error: Set ANTHROPIC_API_KEY in .env or pass --api-key flag.");
      process.exit(1);
    }

    const baseUrl = options.baseUrl || process.env.ANTHROPIC_BASE_URL || undefined;

    // Initialize session
    const session = initSession();
    const settings = loadSettings(session.projectRoot);

    // Model priority: CLI flag > env > settings > default
    const defaultModel = "claude-sonnet-4-20250514";
    const model = options.model
      || process.env.MODEL
      || settings.model
      || defaultModel;

    let permissionMode: PermissionMode = "default";
    if (options.dangerouslySkipPermissions) {
      permissionMode = "bypass";
    } else if (options.auto) {
      permissionMode = "auto";
    }

    const appState: AppState = {
      permissionMode,
      alwaysAllowRules: new Set(),
      model,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    const tokenTracker = createTokenTracker();

    // Build dynamic system prompt
    const systemPrompt = buildSystemPrompt({
      session,
      tools: allTools,
    });

    // Handle --resume
    let resumedMessages: Message[] | undefined;
    if (options.resume) {
      const sessionId = typeof options.resume === "string" ? options.resume : getLastSessionId();
      if (sessionId) {
        const loaded = loadSession(sessionId);
        if (loaded) {
          resumedMessages = loaded.messages;
          console.log(`Resumed session ${loaded.meta.sessionId.slice(0, 8)}... (${loaded.meta.messageCount} messages)`);
        } else {
          console.log(`Session not found: ${sessionId}`);
        }
      } else {
        console.log("No previous sessions found.");
      }
    }

    const printMode = !!options.print;
    const initialPrompt = options.print || prompt;

    const { waitUntilExit } = render(
      <App
        apiKey={apiKey}
        baseUrl={baseUrl}
        model={model}
        systemPrompt={systemPrompt}
        tools={allTools}
        appState={appState}
        initialPrompt={initialPrompt}
        printMode={printMode}
        session={session}
        settings={settings}
        tokenTracker={tokenTracker}
        resumedMessages={resumedMessages}
      />
    );

    waitUntilExit().then(() => {
      process.exit(0);
    });
  });

program.parse();
