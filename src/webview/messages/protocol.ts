import type { TaxonomyRequest } from "../../core/taxonomy";
import type { EdgeType, FlowEndpoint, ProductFlow } from "../../models/productFlow";

export type WebviewMessage =
  | { type: "selectNode"; nodeId: string }
  | { type: "selectEdge"; edgeId: string }
  | { type: "selectAppSurface"; appId: string }
  | { type: "selectDomain"; domainId: string }
  | { type: "selectRole"; roleId: string }
  | { type: "selectStatusGroup"; statusGroupId: string }
  | { type: "selectProjectOverview" }
  | { type: "clearSelection" }
  | { type: "deleteNode"; nodeId: string; nodeTitle?: string }
  | { type: "saveNodePosition"; nodeId: string; x: number; y: number }
  | { type: "saveAppSurfacePosition"; appId: string; x: number; y: number }
  | { type: "saveProjectOverviewPosition"; x: number; y: number }
  | { type: "createNodeAt"; x: number; y: number; appSurfaceIds?: string[]; domainIds?: string[]; roleIds?: string[] }
  | { type: "updateNodeDetails"; nodeId: string; patch: Record<string, unknown> }
  | { type: "updateProjectOverview"; patch: Record<string, unknown> }
  | { type: "createEdge"; from: FlowEndpoint; to: FlowEndpoint; trigger?: string; edgeType?: EdgeType }
  | { type: "createConnectedNodeAt"; request: Record<string, unknown> }
  | { type: "updateEdgeDetails"; edgeId: string; revision?: number; patch: Record<string, unknown> }
  | { type: "removeEdge"; edgeId: string }
  | { type: "updateTaxonomy"; request: TaxonomyRequest };

export interface FlowWebviewInitialState {
  flow: ProductFlow;
  flowPath: string;
  flowFileName: string;
  selectedProjectOverview: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedAppSurfaceId: string | null;
  selectedDomainId: string | null;
  selectedRoleId: string | null;
  selectedStatusGroupId: string | null;
}
