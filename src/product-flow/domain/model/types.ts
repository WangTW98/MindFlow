import type { AppSurfaceType, EdgeType, EntityStatus } from "./constants";

export interface BusinessDomain {
  domainId: string;
  name: string;
  description: string;
}

export interface UserRole {
  roleId: string;
  name: string;
  description: string;
  domainIds: string[];
}

export interface AppSurface {
  appId: string;
  name: string;
  type: AppSurfaceType;
  description: string;
  domainIds: string[];
  roleIds: string[];
  view?: {
    position?: {
      x: number;
      y: number;
    };
  };
}

export interface ProjectOverview {
  summary: string;
  goal: string;
  view?: {
    position?: {
      x: number;
      y: number;
    };
  };
}

export interface ProductStatusGroup {
  statusGroupId: string;
  title: string;
  description?: string;
  color: string;
}

export interface PageAction {
  actionId: string;
  label: string;
  type: string;
  targetNodeId?: string;
  preconditions?: string[];
  result?: string;
}

export interface FeatureItem {
  itemId: string;
  name: string;
  type: string;
  description: string;
  dataBinding?: string;
  required?: boolean;
}

export interface FeatureGroup {
  groupId: string;
  name: string;
  type: string;
  description: string;
  items: FeatureItem[];
  actions?: PageAction[];
}

export interface PageState {
  stateId: string;
  name: string;
  description: string;
}

export interface PageException {
  exceptionId: string;
  name: string;
  handling: string;
}

export interface PageNode {
  nodeId: string;
  stableKey: string;
  status: EntityStatus;
  version: number;
  title: string;
  pageType: string;
  appSurfaceIds: string[];
  statusGroupId?: string;
  domainIds: string[];
  roleIds: string[];
  purpose: string;
  featureGroups: FeatureGroup[];
  states: PageState[];
  exceptions: PageException[];
  inputs: string[];
  outputs: string[];
  permissions: string[];
  replacementNodeIds?: string[];
  removedAt?: string;
  view?: {
    position?: {
      x: number;
      y: number;
    };
  };
}

export type FlowEndpoint =
  | { kind: "projectOverview"; nodeId: "projectOverview" }
  | { kind: "appSurface"; nodeId: string; appId: string }
  | { kind: "node"; nodeId: string }
  | { kind: "featureGroup"; nodeId: string; groupId: string }
  | { kind: "featureItem"; nodeId: string; groupId: string; itemId: string };

export interface FlowEdge {
  edgeId: string;
  status: EntityStatus;
  fromNodeId: string;
  toNodeId: string;
  from: FlowEndpoint;
  to: FlowEndpoint;
  action: string;
  trigger?: string;
  type: EdgeType;
  condition?: string;
  appSurfaceIds: string[];
  domainIds: string[];
  roleIds: string[];
  removedAt?: string;
}

export interface ProductFlow {
  flowId: string;
  revision: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  projectOverview: ProjectOverview;
  domains: BusinessDomain[];
  roles: UserRole[];
  appSurfaces: AppSurface[];
  statusGroups: ProductStatusGroup[];
  nodes: PageNode[];
  edges: FlowEdge[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
