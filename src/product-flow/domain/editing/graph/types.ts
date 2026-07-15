import type { EdgeType, FeatureGroup, FlowEdge, FlowEndpoint, NodePageType, PageNode } from "../..";

export interface CreateNodeInput {
  nodeId?: string;
  title?: string;
  pageType?: NodePageType;
  purpose?: string;
  x?: number;
  y?: number;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
  featureGroups?: FeatureGroup[];
}

export interface UpdateNodeDetailsInput {
  title?: string;
  pageType?: NodePageType;
  purpose?: string;
  appSurfaceIds?: string[];
  statusGroupId?: string;
  domainIds?: string[];
  roleIds?: string[];
  permissions?: string[];
  inputs?: string[];
  outputs?: string[];
  featureGroups?: FeatureGroup[];
}

export interface CreateEdgeInput {
  from: FlowEndpoint;
  to?: FlowEndpoint;
  toNodeId?: string;
  trigger?: string;
  type?: EdgeType;
  condition?: string;
}

export interface UpdateEdgeDetailsInput {
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  trigger?: string;
  action?: string;
  type?: EdgeType;
  condition?: string;
}

export interface RemoveNodeResult {
  node: PageNode;
  removedEdges: FlowEdge[];
}
