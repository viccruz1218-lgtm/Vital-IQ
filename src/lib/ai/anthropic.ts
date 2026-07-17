import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic() {
  if (!client) {
    // The SDK default is a 10-minute timeout with 2 retries — a stuck
    // request could otherwise tie up a route handler far longer than any
    // real user would wait. 45s fails fast enough to still show a clean
    // error (see each route's try/catch) well inside typical platform
    // request limits.
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: 45_000 });
  }
  return client;
}

// Claude Opus 4.8 — used for both the coach conversation and structured
// extraction (onboarding parsing, plan generation). Swap FAST_MODEL to
// claude-haiku-4-5 later if per-message cost needs to come down at scale.
export const COACH_MODEL = "claude-opus-4-8";
export const FAST_MODEL = "claude-opus-4-8";
