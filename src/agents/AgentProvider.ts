import type { FlowChangePlan } from "../models/flowChange";
import type { PageNode, ProductFlow } from "../models/productFlow";

export interface AnalyzeDocumentInput {
  documentText: string;
  documentName: string;
  sourceDocumentId?: string;
}

export interface FlowChangeInput {
  flow: ProductFlow;
  instruction: string;
  selectedNodeId?: string;
}

export interface ArtifactMetadata {
  flowId: string;
  scope: "node" | "full";
  nodeId?: string;
  linkedJsonPath: string;
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrdArtifact {
  metadata: ArtifactMetadata & {
    prdId: string;
    linkedPencilIds: string[];
    staleByChangeSetId?: string;
    refreshedByChangeSetId?: string;
  };
  markdown: string;
}

export interface PencilArtifact {
  metadata: ArtifactMetadata & {
    pencilId: string;
    linkedPrdIds: string[];
    staleByChangeSetId?: string;
    refreshedByChangeSetId?: string;
  };
  spec: Record<string, unknown>;
}

export interface AgentProvider {
  readonly id: "mock" | "codex" | "gemini";
  analyzeDocument(input: AnalyzeDocumentInput): Promise<ProductFlow>;
  proposeFlowChanges(input: FlowChangeInput): Promise<FlowChangePlan>;
  generateNodePrd(flow: ProductFlow, node: PageNode, changeSetId?: string): Promise<PrdArtifact>;
  generateFullPrd(flow: ProductFlow, changeSetId?: string): Promise<PrdArtifact>;
  generateNodePencil(flow: ProductFlow, node: PageNode, changeSetId?: string): Promise<PencilArtifact>;
  generateFullPencil(flow: ProductFlow, changeSetId?: string): Promise<PencilArtifact>;
}

export interface HttpAgentConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  debugDirectory?: string;
  workspaceRoot?: string;
  codexCliPath?: string;
}
