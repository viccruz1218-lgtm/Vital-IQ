import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

// Claude Opus 4.8 — used for both the coach conversation and structured
// extraction (onboarding parsing, plan generation). Swap FAST_MODEL to
// claude-haiku-4-5 later if per-message cost needs to come down at scale.
export const COACH_MODEL = "claude-opus-4-8";
export const FAST_MODEL = "claude-opus-4-8";
