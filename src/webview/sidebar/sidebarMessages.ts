export type SidebarMessage =
  | { type: "newMindFlow" }
  | { type: "openMindFlow" }
  | { type: "openFlow"; flowPath: string }
  | { type: "clearRecent" }
  | { type: "removeRecent"; flowPath: string };

export function parseSidebarMessage(message: unknown): SidebarMessage | undefined {
  if (!isRecord(message) || typeof message.type !== "string") {
    return undefined;
  }

  switch (message.type) {
    case "newMindFlow":
    case "openMindFlow":
    case "clearRecent":
      return { type: message.type };
    case "openFlow": {
      const flowPath = readNonEmptyString(message, "flowPath");
      return flowPath ? { type: "openFlow", flowPath } : undefined;
    }
    case "removeRecent": {
      const flowPath = readNonEmptyString(message, "flowPath");
      return flowPath ? { type: "removeRecent", flowPath } : undefined;
    }
    default:
      return undefined;
  }
}

function readNonEmptyString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" && obj[key].trim() ? obj[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
