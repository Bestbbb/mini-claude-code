import { registerCommand } from "../commands.js";

const KNOWN_MODELS = [
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
    const match = KNOWN_MODELS.find(m => m === target || m.includes(target));
    const modelToSet = match || target;

    context.setModel(modelToSet);
    context.appState.model = modelToSet;

    return `Model changed to: ${modelToSet}`;
  },
});
