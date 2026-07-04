import type { FlowOperation } from "../models/flowChange";
import type { FlowEdge, PageAction, PageElement, PageNode, ProductFlow } from "../models/productFlow";
import { nowIso } from "../utils/id";

export function revertLastChangeSet(flow: ProductFlow): ProductFlow {
  const last = [...flow.changeHistory].reverse().find((entry) => !entry.revertedAt);
  if (!last || !Array.isArray(last.operations)) {
    throw new Error("No applied ChangeSet with stored operations can be reverted.");
  }
  const next = clone(flow);
  const operations = [...(last.operations as FlowOperation[])].reverse();
  for (const operation of operations) {
    revertOperation(next, operation);
  }
  const entry = next.changeHistory.find((item) => item.changeSetId === last.changeSetId);
  if (entry) {
    entry.revertedAt = nowIso();
  }
  next.revision += 1;
  next.updatedAt = nowIso();
  return next;
}

function revertOperation(flow: ProductFlow, operation: FlowOperation): void {
  switch (operation.type) {
    case "addNode":
      flow.nodes = flow.nodes.filter((node) => node.nodeId !== operation.target.nodeId);
      break;
    case "updateNode":
    case "removeNode":
      restoreNode(flow, operation.before as PageNode | null);
      break;
    case "addEdge":
      flow.edges = flow.edges.filter((edge) => edge.edgeId !== operation.target.edgeId);
      break;
    case "updateEdge":
    case "rewireEdge":
    case "removeEdge":
      restoreEdge(flow, operation.before as FlowEdge | null);
      break;
    case "addElement":
      mutateNode(flow, operation.target.nodeId, (node) => {
        node.elements = node.elements.filter((element) => element.elementId !== operation.target.elementId);
      });
      break;
    case "updateElement":
    case "removeElement":
      restoreElement(flow, operation.target.nodeId, operation.before as PageElement | null);
      break;
    case "addAction":
      mutateNode(flow, operation.target.nodeId, (node) => {
        node.actions = node.actions.filter((action) => action.actionId !== operation.target.actionId);
      });
      break;
    case "updateAction":
    case "removeAction":
      restoreAction(flow, operation.target.nodeId, operation.before as PageAction | null);
      break;
    case "splitNode":
    case "mergeNodes":
    case "markArtifactStale":
      break;
    default:
      assertNever(operation.type);
  }
}

function restoreNode(flow: ProductFlow, node: PageNode | null): void {
  if (!node) {
    return;
  }
  const index = flow.nodes.findIndex((item) => item.nodeId === node.nodeId);
  if (index >= 0) {
    flow.nodes[index] = node;
  } else {
    flow.nodes.push(node);
  }
}

function restoreEdge(flow: ProductFlow, edge: FlowEdge | null): void {
  if (!edge) {
    return;
  }
  const index = flow.edges.findIndex((item) => item.edgeId === edge.edgeId);
  if (index >= 0) {
    flow.edges[index] = edge;
  } else {
    flow.edges.push(edge);
  }
}

function restoreElement(flow: ProductFlow, nodeId: string | undefined, element: PageElement | null): void {
  if (!element) {
    return;
  }
  mutateNode(flow, nodeId, (node) => {
    const index = node.elements.findIndex((item) => item.elementId === element.elementId);
    if (index >= 0) {
      node.elements[index] = element;
    } else {
      node.elements.push(element);
    }
  });
}

function restoreAction(flow: ProductFlow, nodeId: string | undefined, action: PageAction | null): void {
  if (!action) {
    return;
  }
  mutateNode(flow, nodeId, (node) => {
    const index = node.actions.findIndex((item) => item.actionId === action.actionId);
    if (index >= 0) {
      node.actions[index] = action;
    } else {
      node.actions.push(action);
    }
  });
}

function mutateNode(flow: ProductFlow, nodeId: string | undefined, mutate: (node: PageNode) => void): void {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  if (node) {
    mutate(node);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported operation type: ${String(value)}`);
}
