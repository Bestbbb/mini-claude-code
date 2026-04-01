import React from "react";
import { Box, Text } from "ink";
import type { TokenTracker } from "../services/tokenTracking.js";

type CostDisplayProps = {
  tokenTracker: TokenTracker;
  model: string;
};

export function CostDisplay({ tokenTracker, model }: CostDisplayProps) {
  const totals = tokenTracker.getTotals();
  const cost = tokenTracker.getEstimatedCost();
  const calls = tokenTracker.getApiCallCount();

  if (calls === 0) return null;

  return (
    <Box marginTop={1}>
      <Text color="gray">{"──── "}</Text>
      <Text color="yellowBright" bold>{model}</Text>
      <Text color="gray">{" · "}</Text>
      <Text color="cyanBright">{formatTokens(totals.inputTokens + totals.outputTokens)} tokens</Text>
      <Text color="gray">{" · "}</Text>
      <Text color="greenBright" bold>${cost.toFixed(4)}</Text>
      <Text color="gray">{" · "}{calls} call{calls !== 1 ? "s" : ""}</Text>
    </Box>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
