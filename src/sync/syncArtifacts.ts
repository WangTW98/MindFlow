import * as fs from "node:fs";
import * as path from "node:path";
import type { ProductFlow, SyncIssue } from "../models/productFlow";
import { nowIso, shortHash } from "../utils/id";

export interface ArtifactMetadataSnapshot {
  kind: "prd" | "pencil";
  artifactId: string;
  path: string;
  flowId?: string;
  nodeId?: string;
  scope?: string;
  linkedJsonPath?: string;
  linkedPrdIds?: string[];
  linkedPencilIds?: string[];
  missing?: boolean;
}

export interface SyncReport {
  flowId: string;
  checkedAt: string;
  issues: SyncIssue[];
  fixed: SyncIssue[];
}

export function buildSyncReport(flow: ProductFlow, snapshots: ArtifactMetadataSnapshot[]): SyncReport {
  const issues: SyncIssue[] = [];
  const fixed: SyncIssue[] = [];
  const nodeIds = new Set(flow.nodes.map((node) => node.nodeId));
  const artifactIds = new Set<string>();

  for (const ref of flow.artifacts.prds) {
    if (artifactIds.has(ref.prdId)) {
      issues.push(issue("error", `Duplicate PRD id ${ref.prdId}.`, ref.prdId, ref.nodeId));
    }
    artifactIds.add(ref.prdId);
  }
  for (const ref of flow.artifacts.pencils) {
    if (artifactIds.has(ref.pencilId)) {
      issues.push(issue("error", `Duplicate artifact id ${ref.pencilId}.`, ref.pencilId, ref.nodeId));
    }
    artifactIds.add(ref.pencilId);
  }

  for (const snapshot of snapshots) {
    if (snapshot.missing) {
      issues.push(issue("error", `${snapshot.kind} artifact file is missing: ${snapshot.path}`, snapshot.artifactId, snapshot.nodeId));
      continue;
    }
    if (snapshot.flowId && snapshot.flowId !== flow.flowId) {
      issues.push(issue("error", `${snapshot.kind} ${snapshot.artifactId} points to flow ${snapshot.flowId}, expected ${flow.flowId}.`, snapshot.artifactId, snapshot.nodeId));
    }
    if (snapshot.scope === "node" && snapshot.nodeId && !nodeIds.has(snapshot.nodeId)) {
      issues.push(issue("error", `${snapshot.kind} ${snapshot.artifactId} points to missing node ${snapshot.nodeId}.`, snapshot.artifactId, snapshot.nodeId));
    }
  }

  for (const node of flow.nodes) {
    for (const prdId of node.artifacts.prdIds) {
      const ref = flow.artifacts.prds.find((item) => item.prdId === prdId);
      if (!ref) {
        issues.push(issue("warning", `Node ${node.nodeId} references missing PRD ${prdId}.`, prdId, node.nodeId, true));
      } else if (ref.nodeId !== node.nodeId && ref.scope === "node") {
        issues.push(issue("warning", `PRD ${prdId} is linked from ${node.nodeId} but metadata points to ${ref.nodeId}.`, prdId, node.nodeId));
      }
    }
    for (const pencilId of node.artifacts.pencilIds) {
      const ref = flow.artifacts.pencils.find((item) => item.pencilId === pencilId);
      if (!ref) {
        issues.push(issue("warning", `Node ${node.nodeId} references missing Pencil ${pencilId}.`, pencilId, node.nodeId, true));
      } else if (ref.nodeId !== node.nodeId && ref.scope === "node") {
        issues.push(issue("warning", `Pencil ${pencilId} is linked from ${node.nodeId} but metadata points to ${ref.nodeId}.`, pencilId, node.nodeId));
      }
    }
  }

  for (const ref of [...flow.artifacts.prds, ...flow.artifacts.pencils]) {
    if (ref.status === "stale") {
      const changeSetExists = ref.staleByChangeSetId
        ? flow.changeHistory.some((change) => change.changeSetId === ref.staleByChangeSetId)
        : false;
      if (!changeSetExists) {
        issues.push(issue("warning", `Stale artifact ${"prdId" in ref ? ref.prdId : ref.pencilId} references missing ChangeSet ${ref.staleByChangeSetId ?? ""}.`, "prdId" in ref ? ref.prdId : ref.pencilId, ref.nodeId));
      } else {
        issues.push(issue("info", `Artifact ${"prdId" in ref ? ref.prdId : ref.pencilId} is stale and should be refreshed.`, "prdId" in ref ? ref.prdId : ref.pencilId, ref.nodeId));
      }
    }
  }

  return {
    flowId: flow.flowId,
    checkedAt: nowIso(),
    issues,
    fixed
  };
}

export function applySyncReport(flow: ProductFlow, report: SyncReport): ProductFlow {
  const next = JSON.parse(JSON.stringify(flow)) as ProductFlow;
  next.syncState = {
    lastSyncedAt: report.checkedAt,
    issues: report.issues
  };
  next.updatedAt = nowIso();
  return next;
}

export function collectArtifactSnapshots(workspaceRoot: string, flow: ProductFlow): ArtifactMetadataSnapshot[] {
  const snapshots: ArtifactMetadataSnapshot[] = [];
  for (const ref of flow.artifacts.prds) {
    const absolutePath = path.join(workspaceRoot, ref.path);
    if (!fs.existsSync(absolutePath)) {
      snapshots.push({ kind: "prd", artifactId: ref.prdId, path: ref.path, missing: true });
      continue;
    }
    const raw = fs.readFileSync(absolutePath, "utf8");
    const frontmatter = parseFrontmatter(raw);
    snapshots.push({
      kind: "prd",
      artifactId: String(frontmatter.prdId ?? ref.prdId),
      path: ref.path,
      flowId: asString(frontmatter.flowId),
      nodeId: asString(frontmatter.nodeId),
      scope: asString(frontmatter.scope),
      linkedJsonPath: asString(frontmatter.linkedJsonPath),
      linkedPencilIds: asStringArray(frontmatter.linkedPencilIds)
    });
  }
  for (const ref of flow.artifacts.pencils) {
    const absolutePath = path.join(workspaceRoot, ref.path);
    if (!fs.existsSync(absolutePath)) {
      snapshots.push({ kind: "pencil", artifactId: ref.pencilId, path: ref.path, missing: true });
      continue;
    }
    const raw = fs.readFileSync(absolutePath, "utf8");
    const parsed = JSON.parse(raw) as { metadata?: Record<string, unknown> };
    const metadata = parsed.metadata ?? {};
    snapshots.push({
      kind: "pencil",
      artifactId: String(metadata.pencilId ?? ref.pencilId),
      path: ref.path,
      flowId: asString(metadata.flowId),
      nodeId: asString(metadata.nodeId),
      scope: asString(metadata.scope),
      linkedJsonPath: asString(metadata.linkedJsonPath),
      linkedPrdIds: asStringArray(metadata.linkedPrdIds)
    });
  }
  return snapshots;
}

function issue(
  severity: SyncIssue["severity"],
  message: string,
  artifactId?: string,
  nodeId?: string,
  autoFixAvailable?: boolean
): SyncIssue {
  return {
    issueId: `sync_${shortHash(`${severity}:${message}:${artifactId ?? ""}:${nodeId ?? ""}`, 10)}`,
    severity,
    message,
    artifactId,
    nodeId,
    autoFixAvailable
  };
}

function parseFrontmatter(markdown: string): Record<string, unknown> {
  if (!markdown.startsWith("---\n")) {
    return {};
  }
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    return {};
  }
  const frontmatter = markdown.slice(4, end);
  const result: Record<string, unknown> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    result[key] = parseValue(value);
  }
  return result;
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}
