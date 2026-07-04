import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentProvider, AnalyzeDocumentInput, FlowChangeInput, HttpAgentConfig, PencilArtifact, PrdArtifact } from "./AgentProvider";
import type { FlowChangePlan } from "../models/flowChange";
import { validateFlowChangePlan } from "../models/flowChange";
import type { PageNode, ProductFlow } from "../models/productFlow";
import { validateProductFlow } from "../models/productFlow";
import { buildAnalyzeDocumentPrompt } from "../prompts/analyzeDocument";
import { buildGeneratePencilPrompt } from "../prompts/generatePencil";
import { buildGeneratePrdPrompt } from "../prompts/generatePrd";
import { buildModifyFlowPrompt } from "../prompts/modifyFlow";

const PRODUCT_FLOW_SCHEMA_SUMMARY = "ProductFlow fields: schemaVersion, flowId, revision, title, sourceDocumentId, sourceSummary, createdAt, updatedAt, domains, roles, nodes, edges, artifacts, changeHistory, syncState.";
const FLOW_CHANGE_SCHEMA_SUMMARY = "FlowChangePlan fields: changeSetId, flowId, baseRevision, instruction, intent, requiresClarification, operations, affectedNodeIds, affectedEdgeIds, artifactImpact, openQuestions, confidence.";

export abstract class HttpJsonAgentProvider implements AgentProvider {
  public abstract readonly id: "codex" | "gemini";

  protected constructor(protected readonly config: HttpAgentConfig) {}

  public async analyzeDocument(input: AnalyzeDocumentInput): Promise<ProductFlow> {
    const prompt = buildAnalyzeDocumentPrompt(input.documentText, PRODUCT_FLOW_SCHEMA_SUMMARY);
    const parsed = await this.invokeJson(prompt);
    const validation = validateProductFlow(parsed);
    if (!validation.valid) {
      throw new Error(`Provider returned invalid ProductFlow:\n${validation.errors.join("\n")}`);
    }
    return parsed as ProductFlow;
  }

  public async proposeFlowChanges(input: FlowChangeInput): Promise<FlowChangePlan> {
    const selectedNode = input.selectedNodeId
      ? input.flow.nodes.find((node) => node.nodeId === input.selectedNodeId)
      : undefined;
    const prompt = buildModifyFlowPrompt(
      JSON.stringify(input.flow, null, 2),
      input.instruction,
      JSON.stringify(selectedNode ?? null, null, 2),
      FLOW_CHANGE_SCHEMA_SUMMARY
    );
    const parsed = await this.invokeJson(prompt);
    const validation = validateFlowChangePlan(parsed);
    if (!validation.valid) {
      throw new Error(`Provider returned invalid FlowChangePlan:\n${validation.errors.join("\n")}`);
    }
    return parsed as FlowChangePlan;
  }

  public async generateNodePrd(flow: ProductFlow, node: PageNode, changeSetId?: string): Promise<PrdArtifact> {
    const prompt = buildGeneratePrdPrompt(JSON.stringify(flow, null, 2), JSON.stringify(node, null, 2), JSON.stringify(changeSetId ?? null));
    return this.invokeJson(prompt) as Promise<PrdArtifact>;
  }

  public async generateFullPrd(flow: ProductFlow, changeSetId?: string): Promise<PrdArtifact> {
    const prompt = buildGeneratePrdPrompt(JSON.stringify(flow, null, 2), "null", JSON.stringify(changeSetId ?? null));
    return this.invokeJson(prompt) as Promise<PrdArtifact>;
  }

  public async generateNodePencil(flow: ProductFlow, node: PageNode, changeSetId?: string): Promise<PencilArtifact> {
    const prompt = buildGeneratePencilPrompt(JSON.stringify(flow, null, 2), JSON.stringify(node, null, 2), JSON.stringify(node.artifacts.prdIds), JSON.stringify(changeSetId ?? null));
    return this.invokeJson(prompt) as Promise<PencilArtifact>;
  }

  public async generateFullPencil(flow: ProductFlow, changeSetId?: string): Promise<PencilArtifact> {
    const prompt = buildGeneratePencilPrompt(JSON.stringify(flow, null, 2), "null", JSON.stringify(flow.artifacts.prds), JSON.stringify(changeSetId ?? null));
    return this.invokeJson(prompt) as Promise<PencilArtifact>;
  }

  protected async invokeJson(prompt: string): Promise<unknown> {
    if (!this.config.endpoint) {
      throw new Error(`${this.id} provider requires mindflow.agent.endpoint.`);
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const raw = await this.postPrompt(prompt);
      const text = extractJsonText(raw);
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        lastError = error;
        const debugPath = await this.writeDebugResponse(prompt, raw, text, attempt);
        if (attempt === 2) {
          const suffix = debugPath ? ` Raw response saved to ${debugPath}.` : "";
          throw new Error(`Provider returned invalid JSON after retry.${suffix} ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    throw new Error(`Provider returned invalid JSON: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  protected buildRequestBody(prompt: string): unknown {
    return {
      model: this.config.model || undefined,
      input: prompt,
      response_format: { type: "json_object" }
    };
  }

  private async postPrompt(prompt: string): Promise<unknown> {
    const url = new URL(this.config.endpoint);
    const body = JSON.stringify(this.buildRequestBody(prompt));
    const transport = url.protocol === "http:" ? http : https;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body).toString()
    };
    if (this.config.apiKey) {
      headers.authorization = `Bearer ${this.config.apiKey}`;
    }

    return new Promise((resolve, reject) => {
      const req = transport.request(
        url,
        {
          method: "POST",
          headers
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const responseText = Buffer.concat(chunks).toString("utf8");
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`${this.id} HTTP ${res.statusCode}: ${responseText}`));
              return;
            }
            try {
              resolve(JSON.parse(responseText) as unknown);
            } catch {
              resolve(responseText);
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  private async writeDebugResponse(prompt: string, raw: unknown, extractedText: string, attempt: number): Promise<string | undefined> {
    if (!this.config.debugDirectory) {
      return undefined;
    }
    await fs.mkdir(this.config.debugDirectory, { recursive: true });
    const filePath = path.join(this.config.debugDirectory, `${this.id}-${Date.now()}-attempt-${attempt}.json`);
    await fs.writeFile(
      filePath,
      `${JSON.stringify({ provider: this.id, prompt, raw, extractedText }, null, 2)}\n`,
      "utf8"
    );
    return filePath;
  }
}

function extractJsonText(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (isRecord(raw)) {
    const outputText = raw.output_text;
    if (typeof outputText === "string") {
      return outputText;
    }
    const text = raw.text;
    if (typeof text === "string") {
      return text;
    }
    const content = raw.content;
    if (Array.isArray(content)) {
      const joined = content
        .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
        .join("");
      if (joined.trim()) {
        return joined;
      }
    }
    const candidates = [raw.choices, raw.candidates, raw.output];
    for (const candidate of candidates) {
      const found = findText(candidate);
      if (found) {
        return found;
      }
    }
  }
  return JSON.stringify(raw);
}

function findText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item);
      if (found) {
        return found;
      }
    }
  }
  if (isRecord(value)) {
    for (const key of ["text", "content", "message", "parts"]) {
      const found = findText(value[key]);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
