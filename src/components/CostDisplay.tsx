import React from "react";
import { Box, Text } from "ink";
import type { TokenTracker } from "../services/tokenTracking.js";

type CostDisplayProps = {
  tokenTracker: TokenTracker;
  model: string;
};

/**
 * Status bar showing token usage and estimated cost.
 * Mirrors Claude Code's footer/status bar components.
 */
export function CostDisplay({ tokenTracker, model }: CostDisplayProps) {
  const totals = tokenTracker.getTotals();
  const cost = tokenTracker.getEstimatedCost();
  const calls = tokenTracker.getApiCallCount();

  if (calls === 0) return null;

  const modelShort = model.includes("opus") ? "opus" :
                     model.includes("haiku") ? "haiku" :
                     model.includes("sonnet") ? "sonnet" : model.slice(0, 15);

  return (
    <Box>
      <Text color="gray" dimColor>
        {modelShort} · {formatTokens(totals.inputTokens + totals.outputTokens)} tokens · ${cost.toFixed(4)} · {calls} API call{calls !== 1 ? "s" : ""}
      </Text>
    </Box>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
