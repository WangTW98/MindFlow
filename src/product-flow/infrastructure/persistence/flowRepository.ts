import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProductFlow } from "../../domain";
import { parseProductFlowText, serializeProductFlow } from "../../domain/serialization/codec";
import { nowIso, slugify } from "../../domain/id";

export const FLOW_FILE_EXTENSION = ".mindflow";

export class FlowRepository {
  public constructor(
    private readonly workspaceRoot: string,
    private readonly flowDirectory = ".mindflow/flows"
  ) {}

  public get directoryPath(): string {
    return path.join(this.workspaceRoot, this.flowDirectory);
  }

  public async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.directoryPath, { recursive: true });
  }

  public async save(flow: ProductFlow): Promise<string> {
    await this.ensureDirectories();
    const fileName = `${slugify(flow.title, "flow")}-${flow.flowId}${FLOW_FILE_EXTENSION}`;
    const absolutePath = path.join(this.directoryPath, fileName);
    flow.updatedAt = nowIso();
    await writeTextAtomic(absolutePath, serializeProductFlow(flow));
    return absolutePath;
  }

  public async saveToPath(absolutePath: string, flow: ProductFlow): Promise<void> {
    flow.updatedAt = nowIso();
    await writeTextAtomic(absolutePath, serializeProductFlow(flow));
  }

  public async load(absolutePath: string): Promise<ProductFlow> {
    const raw = await fs.readFile(absolutePath, "utf8");
    return parseProductFlowText(raw, `ProductFlow file ${absolutePath}`).flow;
  }

  public async list(): Promise<string[]> {
    await this.ensureDirectories();
    const entries = await fs.readdir(this.directoryPath);
    return entries
      .filter((entry) => entry.endsWith(FLOW_FILE_EXTENSION))
      .map((entry) => path.join(this.directoryPath, entry))
      .sort();
  }

  public async latest(): Promise<string | undefined> {
    const files = await this.list();
    if (files.length === 0) {
      return undefined;
    }
    const withStats = await Promise.all(
      files.map(async (file) => ({
        file,
        mtimeMs: (await fs.stat(file)).mtimeMs
      }))
    );
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withStats[0]?.file;
  }

  public relativePath(absolutePath: string): string {
    return path.relative(this.workspaceRoot, absolutePath);
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, value, "utf8");
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
