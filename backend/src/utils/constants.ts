/**
 * Centralized constants for the GLIA backend.
 */

export const VALID_PLATFORMS = [
  "claude",
  "chatgpt",
  "gemini",
  "deepseek",
  "grok",
  "copilot",
  "mistral",
  "mcp"
] as const;

export type Platform = typeof VALID_PLATFORMS[number];
