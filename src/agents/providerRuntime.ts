import type { AgentProvider, HttpAgentConfig } from "./AgentProvider";
import { CodexProvider } from "./CodexProvider";
import { GeminiProvider } from "./GeminiProvider";

export type AgentProviderId = "codex" | "gemini";

export function parseAgentProviderId(value: string | undefined, fallback: AgentProviderId = "codex"): AgentProviderId {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "codex" || normalized === "gemini") {
    return normalized;
  }
  throw new Error(`Unsupported MindFlow agent provider: ${value}. Use codex or gemini.`);
}

export function createConfiguredAgentProvider(provider: AgentProviderId, config: HttpAgentConfig): AgentProvider {
  if (provider === "gemini") {
    return new GeminiProvider(config);
  }
  return new CodexProvider(config);
}
