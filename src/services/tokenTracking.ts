/**
 * Token usage and cost tracking.
 * Mirrors Claude Code's distributed usage tracking across API calls.
 */

export type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheWritePer1M?: number;
};

// Pricing in USD per 1M tokens (as of 2025)
const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.30, cacheWritePer1M: 3.75 },
  "claude-opus-4-20250514": { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.50, cacheWritePer1M: 18.75 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80, outputPer1M: 4, cacheReadPer1M: 0.08, cacheWritePer1M: 1 },
};

export type UsageEntry = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model: string;
  timestamp: number;
};

export type TokenTracker = {
  addUsage(entry: UsageEntry): void;
  getTotals(): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  getEstimatedCost(): number;
  getApiCallCount(): number;
  getSummary(): string;
};

export function createTokenTracker(): TokenTracker {
  const entries: UsageEntry[] = [];

  return {
    addUsage(entry: UsageEntry) {
      entries.push(entry);
    },

    getTotals() {
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      for (const e of entries) {
        inputTokens += e.inputTokens;
        outputTokens += e.outputTokens;
        cacheReadTokens += e.cacheReadTokens ?? 0;
        cacheWriteTokens += e.cacheWriteTokens ?? 0;
      }
      return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
    },

    getEstimatedCost() {
      let total = 0;
      for (const e of entries) {
        const pricing = getPricing(e.model);
        total += (e.inputTokens / 1_000_000) * pricing.inputPer1M;
        total += (e.outputTokens / 1_000_000) * pricing.outputPer1M;
        if (e.cacheReadTokens && pricing.cacheReadPer1M) {
          total += (e.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M;
        }
        if (e.cacheWriteTokens && pricing.cacheWritePer1M) {
          total += (e.cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M;
        }
      }
      return total;
    },

    getApiCallCount() {
      return entries.length;
    },

    getSummary() {
      const totals = this.getTotals();
      const cost = this.getEstimatedCost();
      const lines = [
        `API calls: ${entries.length}`,
        `Input tokens: ${totals.inputTokens.toLocaleString()}`,
        `Output tokens: ${totals.outputTokens.toLocaleString()}`,
      ];
      if (totals.cacheReadTokens > 0) {
        lines.push(`Cache read tokens: ${totals.cacheReadTokens.toLocaleString()}`);
      }
      if (totals.cacheWriteTokens > 0) {
        lines.push(`Cache write tokens: ${totals.cacheWriteTokens.toLocaleString()}`);
      }
      lines.push(`Estimated cost: $${cost.toFixed(4)}`);
      return lines.join("\n");
    },
  };
}

function getPricing(model: string): ModelPricing {
  // Match model ID to pricing (handle both full IDs and partial matches)
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) {
      return pricing;
    }
  }
  // Default to Sonnet pricing
  return MODEL_PRICING["claude-sonnet-4-20250514"]!;
}
