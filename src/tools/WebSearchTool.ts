import { z } from "zod";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

export const WebSearchTool = buildTool({
  name: "WebSearch",
  description:
    "Search the web for information. Returns search result titles, URLs, and snippets. " +
    "Uses DuckDuckGo HTML search (no API key required).",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    maxResults: z.number().optional().describe("Maximum number of results (default: 8)"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "ask" as const };
  },

  userFacingName(input?: { query?: string }) {
    if (input?.query) {
      const short = input.query.length > 40 ? input.query.slice(0, 40) + "..." : input.query;
      return `WebSearch(${short})`;
    }
    return "WebSearch";
  },

  async call(input: { query: string; maxResults?: number }, _context: ToolContext): Promise<ToolResult> {
    const maxResults = input.maxResults ?? 8;

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "mini-claude-code/0.1 (CLI agent)",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          content: `Search failed: HTTP ${response.status}`,
          is_error: true,
        };
      }

      const html = await response.text();
      const results = parseSearchResults(html, maxResults);

      if (results.length === 0) {
        return { content: `No results found for: ${input.query}` };
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");

      return { content: `Search results for "${input.query}":\n\n${formatted}` };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { content: "Search timed out (15s limit)", is_error: true };
      }
      return { content: `Search error: ${err.message}`, is_error: true };
    }
  },
});

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML search results pattern
  const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
  const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs;

  const links = [...html.matchAll(resultPattern)];
  const snippets = [...html.matchAll(snippetPattern)];

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    const link = links[i];
    if (!link) continue;

    let url = link[1] || "";
    // DuckDuckGo wraps URLs in redirects
    const uddgMatch = url.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]!);
    }

    const title = stripTags(link[2] || "Untitled");
    const snippet = snippets[i] ? stripTags(snippets[i]![1] || "") : "";

    if (url && !url.startsWith("//duckduckgo")) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}
