import { createHash, randomUUID } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function shortHash(input: string, length = 8): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

export function slugify(input: string, fallback = "item"): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (ascii.length > 0) {
    return ascii.slice(0, 48);
  }

  const compact = input.replace(/\s+/g, "").slice(0, 12);
  return compact.length > 0 ? `${fallback}-${shortHash(input, 6)}` : fallback;
}

export function makeFlowId(title: string): string {
  return `flow_${slugify(title, "flow")}_${shortHash(`${title}:${randomUUID()}`, 6)}`;
}

export function makeNodeId(title: string, stableSeed: string): string {
  return `page_${slugify(title, "page")}_${shortHash(stableSeed, 6)}`;
}

export function makeEdgeId(fromNodeId: string, toNodeId: string, action: string): string {
  return `edge_${shortHash(`${fromNodeId}:${toNodeId}:${action}`, 10)}`;
}

export function makeElementId(name: string, seed: string): string {
  return `el_${slugify(name, "element")}_${shortHash(seed, 6)}`;
}

export function makeFeatureGroupId(name: string, seed: string): string {
  return `group_${slugify(name, "group")}_${shortHash(seed, 6)}`;
}

export function makeFeatureItemId(name: string, seed: string): string {
  return `item_${slugify(name, "item")}_${shortHash(seed, 6)}`;
}

export function makeActionId(label: string, seed: string): string {
  return `act_${slugify(label, "action")}_${shortHash(seed, 6)}`;
}

export function makePrdId(scopeSeed: string): string {
  return `prd_${shortHash(`${scopeSeed}:${randomUUID()}`, 10)}`;
}

export function makePencilId(scopeSeed: string): string {
  return `pencil_${shortHash(`${scopeSeed}:${randomUUID()}`, 10)}`;
}

export function makeChangeSetId(instruction: string): string {
  return `chg_${shortHash(`${instruction}:${randomUUID()}`, 10)}`;
}

export function stableKey(...parts: string[]): string {
  return shortHash(parts.join("::"), 12);
}
