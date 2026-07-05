import type { EdgeType, FlowEndpoint } from "../../../models/productFlow";

export interface CreateConnectedNodeRequest {
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  x?: number;
  y?: number;
  trigger?: string;
  type?: EdgeType;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
}
