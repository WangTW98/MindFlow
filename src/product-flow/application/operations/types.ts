import type {
  CreateEdgeInput,
  CreateNodeInput,
  RemoveNodeResult,
  UpdateEdgeDetailsInput,
  UpdateNodeDetailsInput
} from "../../domain/editing/graph";
import type { UpdateProjectOverviewInput } from "../../domain/editing/projectOverviewMutations";
import type { TaxonomyKind } from "../../domain/editing/taxonomy";
import type { FlowSelectionPatch } from "../../domain/selection";
import type { AppSurface, FlowEdge, FlowEndpoint, PageNode, ProductFlow } from "../../domain";

export interface PasteNodeSnapshot {
  title: string;
  pageType: PageNode["pageType"];
  purpose: string;
  appSurfaceIds: string[];
  statusGroupId?: string;
  domainIds: string[];
  roleIds: string[];
  permissions: string[];
  featureGroups: PageNode["featureGroups"];
  offsetX: number;
  offsetY: number;
}

export interface PasteNodesOperationInput {
  nodes: PasteNodeSnapshot[];
  primaryIndex: number;
  x: number;
  y: number;
}

export type FlowOperation =
  | { type: "project.update"; patch: UpdateProjectOverviewInput }
  | { type: "project.move"; x: number; y: number }
  | { type: "taxonomy.upsert"; kind: TaxonomyKind; id?: string; item?: Record<string, unknown> }
  | { type: "taxonomy.remove"; kind: TaxonomyKind; id: string }
  | { type: "appSurface.move"; appId: string; x: number; y: number }
  | { type: "node.create"; input?: CreateNodeInput; detailPatch?: UpdateNodeDetailsInput }
  | { type: "node.paste"; request: PasteNodesOperationInput }
  | { type: "node.update"; nodeId: string; patch: UpdateNodeDetailsInput }
  | { type: "node.move"; nodeId: string; x: number; y: number }
  | { type: "node.remove"; nodeId: string }
  | { type: "node.createConnected"; request: CreateConnectedNodeOperationInput }
  | { type: "edge.upsert"; input: UpsertEdgeOperationInput }
  | { type: "edge.update"; edgeId: string; patch: UpdateEdgeDetailsInput }
  | { type: "edge.remove"; edgeId: string };

export interface CreateConnectedNodeOperationInput {
  input?: CreateNodeInput;
  detailPatch?: UpdateNodeDetailsInput;
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  x?: number;
  y?: number;
  trigger?: string;
  type?: CreateEdgeInput["type"];
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
}

export interface UpsertEdgeOperationInput extends UpdateEdgeDetailsInput {
  edgeId?: string;
  id?: string;
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  trigger?: string;
  action?: string;
}

export type FlowOperationResult =
  | { type: "project.update"; root: Record<string, unknown>; selection: FlowSelectionPatch }
  | { type: "project.move"; root: Record<string, unknown> }
  | { type: "taxonomy.upsert"; taxonomy: { kind: TaxonomyKind; id: string; item: unknown }; selection: FlowSelectionPatch }
  | { type: "taxonomy.remove"; taxonomy: { kind: TaxonomyKind; id: string; item: null }; removedId: string; selection: FlowSelectionPatch }
  | { type: "appSurface.move"; appSurface: AppSurface }
  | { type: "node.create"; node: PageNode; selection: FlowSelectionPatch }
  | { type: "node.paste"; nodes: PageNode[]; selection: FlowSelectionPatch }
  | { type: "node.update"; node: PageNode; selection: FlowSelectionPatch }
  | { type: "node.move"; node: PageNode }
  | { type: "node.remove"; removedNodeId: string; removedEdgeIds: string[]; result: RemoveNodeResult; selection: FlowSelectionPatch }
  | { type: "node.createConnected"; node: PageNode; edge?: FlowEdge; selection: FlowSelectionPatch }
  | { type: "edge.upsert"; edge: FlowEdge; mode: "created" | "updated" | "updatedExisting"; selection: FlowSelectionPatch }
  | { type: "edge.update"; edge: FlowEdge; selection: FlowSelectionPatch }
  | { type: "edge.remove"; removedEdgeId: string; edge: FlowEdge; selection: FlowSelectionPatch };

export interface ApplyFlowOperationsOptions {
  atomic?: boolean;
  dryRun?: boolean;
}

export interface ApplyFlowOperationsResult {
  flow: ProductFlow;
  results: FlowOperationResult[];
  applied: boolean;
  dryRun: boolean;
  selection?: FlowSelectionPatch;
}
