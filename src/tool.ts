import { z } from "zod";
import type { ToolResult, ToolContext, PermissionResult } from "./types.js";

export type Tool = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  call(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  isReadOnly(input: Record<string, unknown>): boolean;
  checkPermissions(input: Record<string, unknown>): PermissionResult;
  userFacingName(input?: Record<string, unknown>): string;
};

type ToolConfig = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  call(input: any, context: ToolContext): Promise<ToolResult>;
  isReadOnly?: (input: any) => boolean;
  checkPermissions?: (input: any) => PermissionResult;
  userFacingName?: (input?: any) => string;
};

export function buildTool(config: ToolConfig): Tool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    call: config.call,
    // Fail-closed defaults: not read-only, must ask
    isReadOnly: config.isReadOnly ?? (() => false),
    checkPermissions: config.checkPermissions ?? (() => ({ behavior: "ask" })),
    userFacingName: config.userFacingName ?? ((input?) => {
      if (input) {
        const summary = Object.values(input)[0];
        if (typeof summary === "string") {
          const short = summary.length > 40 ? summary.slice(0, 40) + "..." : summary;
          return `${config.name}(${short})`;
        }
      }
      return config.name;
    }),
  };
}
