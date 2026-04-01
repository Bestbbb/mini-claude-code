import { registerCommand } from "../commands.js";

const KNOWN_MODELS = [
  "kimi-k2.5",
  "qwen3.5-plus",
  "qwen3-max-2026-01-23",
  "qwen3-coder-next",
  "qwen3-coder-plus",
  "glm-5",
  "glm-4.7",
  "MiniMax-M2.5",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-5-20251001",
];

registerCommand({
  name: "model",
  description: "Show or change the current model",
  async execute(args, context) {
    if (!args) {
      return `Current model: ${context.model}\n\nAvailable models:\n${KNOWN_MODELS.map(m => `  ${m}`).join("\n")}\n\nUsage: /model <model-name>`;
    }

    // Allow partial matching
    const target = args.trim();
    const match = KNOWN_MODELS.find(m => m === target || m.toLowerCase().includes(target.toLowerCase()));
    const modelToSet = match || target;

    context.setModel(modelToSet);
    context.appState.model = modelToSet;

    return `Model changed to: ${modelToSet}`;
  },
});
