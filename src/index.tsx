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
  .action(async (prompt, options) => {
    let apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

    // Available models for DashScope Anthropic proxy
    const AVAILABLE_MODELS = [
      { name: "kimi-k2.5",              provider: "Kimi",    desc: "Kimi K2.5 (推荐)" },
      { name: "qwen3.5-plus",           provider: "千问",    desc: "Qwen 3.5 Plus" },
      { name: "qwen3-max-2026-01-23",   provider: "千问",    desc: "Qwen 3 Max" },
      { name: "qwen3-coder-next",       provider: "千问",    desc: "Qwen 3 Coder Next" },
      { name: "qwen3-coder-plus",       provider: "千问",    desc: "Qwen 3 Coder Plus" },
      { name: "glm-5",                  provider: "智谱",    desc: "GLM 5" },
      { name: "glm-4.7",               provider: "智谱",    desc: "GLM 4.7" },
      { name: "MiniMax-M2.5",          provider: "MiniMax", desc: "MiniMax M2.5" },
    ];
    const DEFAULT_MODEL = "kimi-k2.5";

    // Interactive setup if no API key found
    if (!apiKey) {
      const readline = await import("node:readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

      console.log("\n  Welcome to mini-claude-code!\n");
      console.log("  No API key found. Let's set one up.\n");

      apiKey = await ask("  ANTHROPIC_API_KEY: ");
      if (!apiKey.trim()) {
        console.error("\n  API key is required. Set ANTHROPIC_API_KEY in .env or pass --api-key.");
        process.exit(1);
      }
      apiKey = apiKey.trim();

      const baseUrlInput = await ask("  ANTHROPIC_BASE_URL (press Enter to skip): ");
      if (baseUrlInput.trim()) {
        process.env.ANTHROPIC_BASE_URL = baseUrlInput.trim();
      }

      // Show model selection
      console.log("\n  Available models:");
      AVAILABLE_MODELS.forEach((m, i) => {
        const marker = m.name === DEFAULT_MODEL ? " (default)" : "";
        console.log(`    ${i + 1}. ${m.name.padEnd(24)} [${m.provider}] ${m.desc}${marker}`);
      });

      const modelInput = await ask(`\n  Choose model (1-${AVAILABLE_MODELS.length}, or name, Enter for ${DEFAULT_MODEL}): `);
      const trimmedModel = modelInput.trim();
      if (trimmedModel) {
        const num = parseInt(trimmedModel);
        if (num >= 1 && num <= AVAILABLE_MODELS.length) {
          process.env.MODEL = AVAILABLE_MODELS[num - 1]!.name;
        } else {
          process.env.MODEL = trimmedModel;
        }
      } else {
        process.env.MODEL = DEFAULT_MODEL;
      }

      // Offer to save to .env
      const save = await ask("\n  Save to .env for next time? (Y/n): ");
      if (!save.trim() || save.trim().toLowerCase() === "y") {
        const { writeFileSync } = await import("node:fs");
        const lines = [`ANTHROPIC_API_KEY=${apiKey}`];
        if (baseUrlInput.trim()) lines.push(`ANTHROPIC_BASE_URL=${baseUrlInput.trim()}`);
        lines.push(`MODEL=${process.env.MODEL}`);
        writeFileSync(".env", lines.join("\n") + "\n");
        console.log("  Saved to .env\n");
      }

      rl.close();
    }

    const baseUrl = options.baseUrl || process.env.ANTHROPIC_BASE_URL || undefined;

    // Initialize session
    const session = initSession();
    const settings = loadSettings(session.projectRoot);

    // Model priority: CLI flag > env > settings > default
    const model = options.model
      || process.env.MODEL
      || settings.model
      || DEFAULT_MODEL;

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
