import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { PencilRef, PrdRef, ProductFlow } from "../models/productFlow";
import { makePencilId, makePrdId, nowIso, slugify } from "../utils/id";
import type { PencilArtifact, PrdArtifact } from "../agents/AgentProvider";
import { FLOW_FILE_EXTENSION } from "./flowRepository";

export interface WrittenArtifact<TRef extends PrdRef | PencilRef> {
  absolutePath: string;
  relativePath: string;
  ref: TRef;
}

export class ArtifactRepository {
  public constructor(private readonly workspaceRoot: string) {}

  public async writePrd(flow: ProductFlow, artifact: PrdArtifact): Promise<WrittenArtifact<PrdRef>> {
    const prdId = artifact.metadata.prdId || makePrdId(`${flow.flowId}:${artifact.metadata.scope}:${artifact.metadata.nodeId ?? "full"}`);
    const folder = path.join(this.workspaceRoot, "docs", "prd", flow.flowId);
    await fs.mkdir(folder, { recursive: true });
    const fileName =
      artifact.metadata.scope === "node" && artifact.metadata.nodeId
        ? `node-${artifact.metadata.nodeId}-${prdId}.md`
        : `full-${flow.flowId}-${prdId}.md`;
    const absolutePath = path.join(folder, fileName);
    const relativePath = path.relative(this.workspaceRoot, absolutePath);
    const now = nowIso();
    const frontmatter = {
      ...artifact.metadata,
      prdId,
      flowId: flow.flowId,
      linkedJsonPath: artifact.metadata.linkedJsonPath || this.findFlowPathHint(flow),
      createdAt: artifact.metadata.createdAt || now,
      updatedAt: now
    };
    const content = withFrontmatter(frontmatter, artifact.markdown);
    await fs.writeFile(absolutePath, content, "utf8");

    const ref: PrdRef = {
      prdId,
      scope: artifact.metadata.scope,
      nodeId: artifact.metadata.nodeId,
      path: relativePath,
      status: "active",
      createdAt: frontmatter.createdAt,
      updatedAt: now
    };
    upsertPrdRef(flow, ref);
    if (ref.scope === "node" && ref.nodeId) {
      const node = flow.nodes.find((item) => item.nodeId === ref.nodeId);
      if (node && !node.artifacts.prdIds.includes(prdId)) {
        node.artifacts.prdIds.push(prdId);
      }
    }
    return { absolutePath, relativePath, ref };
  }

  public async writePencil(flow: ProductFlow, artifact: PencilArtifact): Promise<WrittenArtifact<PencilRef>> {
    const pencilId =
      artifact.metadata.pencilId || makePencilId(`${flow.flowId}:${artifact.metadata.scope}:${artifact.metadata.nodeId ?? "full"}`);
    const folder = path.join(this.workspaceRoot, "designs", "pencil", flow.flowId);
    await fs.mkdir(folder, { recursive: true });
    const fileName =
      artifact.metadata.scope === "node" && artifact.metadata.nodeId
        ? `node-${artifact.metadata.nodeId}-${pencilId}.pencil.json`
        : `full-${flow.flowId}-${pencilId}.pencil.json`;
    const absolutePath = path.join(folder, fileName);
    const relativePath = path.relative(this.workspaceRoot, absolutePath);
    const now = nowIso();
    const metadata = {
      ...artifact.metadata,
      pencilId,
      flowId: flow.flowId,
      linkedJsonPath: artifact.metadata.linkedJsonPath || this.findFlowPathHint(flow),
      createdAt: artifact.metadata.createdAt || now,
      updatedAt: now
    };
    await fs.writeFile(
      absolutePath,
      `${JSON.stringify({ metadata, spec: artifact.spec }, null, 2)}\n`,
      "utf8"
    );

    const ref: PencilRef = {
      pencilId,
      scope: artifact.metadata.scope,
      nodeId: artifact.metadata.nodeId,
      path: relativePath,
      status: "active",
      createdAt: metadata.createdAt,
      updatedAt: now
    };
    upsertPencilRef(flow, ref);
    if (ref.scope === "node" && ref.nodeId) {
      const node = flow.nodes.find((item) => item.nodeId === ref.nodeId);
      if (node && !node.artifacts.pencilIds.includes(pencilId)) {
        node.artifacts.pencilIds.push(pencilId);
      }
    }
    return { absolutePath, relativePath, ref };
  }

  public async readPrdFrontmatters(flow: ProductFlow): Promise<Array<Record<string, unknown> & { path: string }>> {
    const result: Array<Record<string, unknown> & { path: string }> = [];
    for (const ref of flow.artifacts.prds) {
      try {
        const absolutePath = path.join(this.workspaceRoot, ref.path);
        const raw = await fs.readFile(absolutePath, "utf8");
        result.push({ ...parseFrontmatter(raw), path: ref.path });
      } catch {
        result.push({ prdId: ref.prdId, path: ref.path, missing: true });
      }
    }
    return result;
  }

  public async readPencilMetadata(flow: ProductFlow): Promise<Array<Record<string, unknown> & { path: string }>> {
    const result: Array<Record<string, unknown> & { path: string }> = [];
    for (const ref of flow.artifacts.pencils) {
      try {
        const absolutePath = path.join(this.workspaceRoot, ref.path);
        const raw = await fs.readFile(absolutePath, "utf8");
        const parsed = JSON.parse(raw) as { metadata?: Record<string, unknown> };
        result.push({ ...(parsed.metadata ?? {}), path: ref.path });
      } catch {
        result.push({ pencilId: ref.pencilId, path: ref.path, missing: true });
      }
    }
    return result;
  }

  private findFlowPathHint(flow: ProductFlow): string {
    return path.join(".mindflow", "flows", `${slugify(flow.title, "flow")}-${flow.flowId}${FLOW_FILE_EXTENSION}`);
  }
}

export function withFrontmatter(metadata: Record<string, unknown>, markdown: string): string {
  const yaml = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`)
    .join("\n");
  return `---\n${yaml}\n---\n\n${markdown.trim()}\n`;
}

export function parseFrontmatter(markdown: string): Record<string, unknown> {
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
    result[key] = parseYamlValue(value);
  }
  return result;
}

function upsertPrdRef(flow: ProductFlow, ref: PrdRef): void {
  const index = flow.artifacts.prds.findIndex((item) => item.prdId === ref.prdId);
  if (index >= 0) {
    flow.artifacts.prds[index] = ref;
  } else {
    flow.artifacts.prds.push(ref);
  }
}

function upsertPencilRef(flow: ProductFlow, ref: PencilRef): void {
  const index = flow.artifacts.pencils.findIndex((item) => item.pencilId === ref.pencilId);
  if (index >= 0) {
    flow.artifacts.pencils[index] = ref;
  } else {
    flow.artifacts.pencils.push(ref);
  }
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function parseYamlValue(value: string): unknown {
  if (value === "") {
    return "";
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
