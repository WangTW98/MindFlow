import {
  MINDFLOW_AUTHORING_REFERENCE,
  MINDFLOW_AUTHORING_REFERENCE_URI,
  MINDFLOW_MODEL_REFERENCE,
  MINDFLOW_MODEL_REFERENCE_URI,
  MINDFLOW_OPERATIONS_REFERENCE,
  MINDFLOW_OPERATIONS_REFERENCE_URI,
  MINDFLOW_SERVER_INSTRUCTIONS
} from "./operationsReference";
import type { MindFlowMcpToolHandlers } from "../tools";
import { MINDFLOW_VERSION } from "../../../shared/version";

const SUPPORTED_PROTOCOL_VERSION = "2024-11-05";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

export type JsonRpcResponse = Record<string, unknown> | undefined;

class JsonRpcDispatchError extends Error {
  public constructor(public readonly code: number, message: string) {
    super(message);
  }
}

export class MindFlowMcpProtocol {
  private initializeRequested = false;
  private initialized = false;

  public constructor(private readonly tools: MindFlowMcpToolHandlers) {}

  public async handle(payload: unknown): Promise<JsonRpcResponse> {
    if (Array.isArray(payload)) {
      return jsonRpcError(null, -32600, "JSON-RPC batching is not supported by this MCP server.");
    }
    if (!isRecord(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string" || !payload.method.trim()) {
      return jsonRpcError(readValidId(payload), -32600, "Invalid JSON-RPC request.");
    }
    if ("id" in payload && !isValidRequestId(payload.id)) {
      return jsonRpcError(null, -32600, "JSON-RPC id must be a string or integer.");
    }

    const request = payload as unknown as JsonRpcRequest;
    if (request.id === undefined) {
      try {
        await this.handleNotification(request);
      } catch {
        // JSON-RPC notifications never receive responses, including error responses.
      }
      return undefined;
    }

    try {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: await this.dispatch(request.method, request.params)
      };
    } catch (error) {
      const code = error instanceof JsonRpcDispatchError ? error.code : -32603;
      return jsonRpcError(request.id, code, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleNotification(request: JsonRpcRequest): Promise<void> {
    if (request.method === "notifications/initialized" || request.method === "initialized") {
      if (!this.initializeRequested) {
        throw new JsonRpcDispatchError(-32002, "MindFlow MCP server has not received initialize.");
      }
      this.initialized = true;
      return;
    }
    this.requireInitialized(request.method);
    await this.dispatch(request.method, request.params);
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    if (method === "initialize") {
      const request = requireRecord(params, "initialize params must be an object.");
      if (typeof request.protocolVersion !== "string" || !request.protocolVersion) {
        throw new JsonRpcDispatchError(-32602, "initialize.protocolVersion must be a non-empty string.");
      }
      this.initializeRequested = true;
      return {
        protocolVersion: SUPPORTED_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "mindflow-vscode", version: MINDFLOW_VERSION },
        instructions: MINDFLOW_SERVER_INSTRUCTIONS
      };
    }

    if (method !== "ping") {
      this.requireInitialized(method);
    }

    switch (method) {
      case "ping":
        return {};
      case "tools/list":
        return { tools: this.tools.listTools() };
      case "tools/call": {
        const request = requireRecord(params, "tools/call params must be an object.");
        if (typeof request.name !== "string" || !request.name.trim()) {
          throw new JsonRpcDispatchError(-32602, "tools/call.name must be a non-empty string.");
        }
        try {
          const result = await this.tools.callTool(request.name, request.arguments);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result
          };
        } catch (error) {
          throw new JsonRpcDispatchError(-32602, error instanceof Error ? error.message : String(error));
        }
      }
      case "resources/list":
        return {
          resources: [
            resource(MINDFLOW_OPERATIONS_REFERENCE_URI, "MindFlow operations reference", "Operation-level workflow for reading and editing MindFlow."),
            resource(MINDFLOW_MODEL_REFERENCE_URI, "MindFlow current model", "Current root, app-surface, generic-node, state, endpoint, and edge model."),
            resource(MINDFLOW_AUTHORING_REFERENCE_URI, "MindFlow authoring rules", "Canonical edge-type and orange-outlet selection rules.")
          ]
        };
      case "resources/read": {
        const request = requireRecord(params, "resources/read params must be an object.");
        const text = request.uri === MINDFLOW_OPERATIONS_REFERENCE_URI
          ? MINDFLOW_OPERATIONS_REFERENCE
          : request.uri === MINDFLOW_MODEL_REFERENCE_URI
            ? MINDFLOW_MODEL_REFERENCE
            : request.uri === MINDFLOW_AUTHORING_REFERENCE_URI
              ? MINDFLOW_AUTHORING_REFERENCE
              : undefined;
        if (!text) {
          throw new JsonRpcDispatchError(-32602, `Unknown MindFlow MCP resource: ${String(request.uri)}`);
        }
        return {
          contents: [{
            uri: request.uri,
            mimeType: "text/markdown",
            text
          }]
        };
      }
      default:
        throw new JsonRpcDispatchError(-32601, `Unsupported MCP method: ${method}`);
    }
  }

  private requireInitialized(method: string): void {
    if (!this.initialized) {
      throw new JsonRpcDispatchError(-32002, `MindFlow MCP server must be initialized before ${method}.`);
    }
  }
}

function resource(uri: string, name: string, description: string): Record<string, string> {
  return { uri, name, mimeType: "text/markdown", description };
}

function jsonRpcError(id: string | number | null, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new JsonRpcDispatchError(-32602, message);
  }
  return value;
}

function readValidId(value: unknown): string | number | null {
  return isRecord(value) && isValidRequestId(value.id) ? value.id : null;
}

function isValidRequestId(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isInteger(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
