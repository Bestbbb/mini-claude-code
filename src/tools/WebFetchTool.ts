import { z } from "zod";
import { buildTool } from "../tool.js";
import type { ToolResult, ToolContext } from "../types.js";

const MAX_CONTENT_LENGTH = 50000; // ~50KB max

export const WebFetchTool = buildTool({
  name: "WebFetch",
  description:
    "Fetch content from a URL. Returns the page content as plain text (HTML tags stripped). " +
    "Use for reading documentation, API responses, or web pages.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch"),
    prompt: z.string().optional().describe("Optional prompt to extract specific information from the page"),
  }),

  isReadOnly() {
    return true;
  },

  checkPermissions() {
    return { behavior: "ask" as const };
  },

  userFacingName(input?: { url?: string }) {
    if (input?.url) {
      const short = input.url.length > 50 ? input.url.slice(0, 50) + "..." : input.url;
      return `WebFetch(${short})`;
    }
    return "WebFetch";
  },

  async call(input: { url: string; prompt?: string }, _context: ToolContext): Promise<ToolResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(input.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "mini-claude-code/0.1 (CLI agent)",
          "Accept": "text/html,application/json,text/plain,*/*",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          content: `HTTP ${response.status} ${response.statusText} for ${input.url}`,
          is_error: true,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      let content: string;
      if (contentType.includes("application/json")) {
        // Pretty-print JSON
        try {
          content = JSON.stringify(JSON.parse(rawText), null, 2);
        } catch {
          content = rawText;
        }
      } else if (contentType.includes("text/html")) {
        // Strip HTML tags for readability
        content = stripHtml(rawText);
      } else {
        content = rawText;
      }

      // Truncate if too long
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n...(truncated)";
      }

      const header = `URL: ${input.url}\nContent-Type: ${contentType}\nLength: ${rawText.length} chars\n${"─".repeat(40)}\n`;

      if (input.prompt) {
        return { content: `${header}${content}\n\n[Extraction prompt: ${input.prompt}]` };
      }

      return { content: header + content };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { content: `Timeout fetching ${input.url} (15s limit)`, is_error: true };
      }
      return { content: `Error fetching ${input.url}: ${err.message}`, is_error: true };
    }
  },
});

/**
 * Simple HTML to text conversion: strip tags, decode entities, normalize whitespace.
 */
function stripHtml(html: string): string {
  return html
    // Remove script and style blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Add newlines for block elements
    .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Normalize whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
