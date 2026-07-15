import type { FlowOperation, TaxonomyRequest } from "../../../../product-flow/application/operations";
import type { EdgeType, FlowEndpoint, ProductFlow } from "../../../../product-flow/domain";
import type { FlowSelectionState } from "../../../../product-flow/domain/selection";

export type WebviewMessage =
  | { type: "flow.operation"; operation: FlowOperation }
  | { type: "flow.operations"; operations: FlowOperation[] }
  | { type: "selectNode"; nodeId: string; selectedNodeIds?: string[] }
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
  | {
      type: "saveAutoLayoutPositions";
      projectOverviewPosition: WebviewPosition;
      appSurfacePositions: Record<string, WebviewPosition>;
      nodePositions: Record<string, WebviewPosition>;
    }
  | { type: "createNodeAt"; x: number; y: number; appSurfaceIds?: string[]; domainIds?: string[]; roleIds?: string[] }
  | { type: "updateNodeDetails"; nodeId: string; patch: Record<string, unknown> }
  | { type: "updateProjectOverview"; patch: Record<string, unknown> }
  | { type: "createEdge"; from: FlowEndpoint; to: FlowEndpoint; trigger?: string; edgeType?: EdgeType }
  | { type: "createConnectedNodeAt"; request: Record<string, unknown> }
  | { type: "updateEdgeDetails"; edgeId: string; revision?: number; patch: Record<string, unknown> }
  | { type: "removeEdge"; edgeId: string }
  | { type: "updateTaxonomy"; request: TaxonomyRequest };

export type FlowWebviewHostMessage =
  | { type: "selectionChanged"; selection: FlowSelectionState }
  | { type: "flowChanged"; flow: ProductFlow }
  | { type: "commandResult"; ok: boolean; message: string; flow?: ProductFlow };

export interface WebviewPosition {
  x: number;
  y: number;
}

export interface FlowWebviewInitialState {
  flow: ProductFlow;
  flowPath: string;
  flowFileName: string;
  selectedProjectOverview: boolean;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  selectedAppSurfaceId: string | null;
  selectedDomainId: string | null;
  selectedRoleId: string | null;
  selectedStatusGroupId: string | null;
}
