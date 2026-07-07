import { MINDFLOW_OPERATIONS_REFERENCE, MINDFLOW_OPERATIONS_REFERENCE_URI } from "./operationsReference";
import type { MindFlowMcpToolHandlers } from "./tools/index";

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export type JsonRpcResponse = Record<string, unknown> | Record<string, unknown>[] | undefined;

export class MindFlowMcpProtocol {
  public constructor(private readonly tools: MindFlowMcpToolHandlers) {}

  public async handle(payload: unknown): Promise<JsonRpcResponse> {
    if (Array.isArray(payload)) {
      const responses: JsonRpcResponse[] = [];
      for (const item of payload) {
        responses.push(await this.handleSingle(item));
      }
      return responses.filter((item): item is Record<string, unknown> => item !== undefined);
    }
    return this.handleSingle(payload);
  }

  private async handleSingle(payload: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(payload)) {
      return jsonRpcError(null, -32600, "Invalid JSON-RPC request.");
    }
    const request = payload as JsonRpcRequest;
    if (typeof request.method !== "string") {
      return jsonRpcError(request.id ?? null, -32600, "Invalid JSON-RPC method.");
    }
    if (request.id === undefined) {
      await this.handleNotification(request);
      return undefined;
    }
    try {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: await this.dispatch(request.method, request.params)
      };
    } catch (error) {
      return jsonRpcError(request.id, -32000, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleNotification(request: JsonRpcRequest): Promise<void> {
    if (request.method === "notifications/initialized" || request.method === "initialized") {
      return;
    }
    await this.dispatch(request.method ?? "", request.params);
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: "mindflow-vscode",
            version: "0.1.0"
          }
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: this.tools.listTools() };
      case "tools/call": {
        const request = asRecord(params);
        const name = typeof request.name === "string" ? request.name : "";
        const result = await this.tools.callTool(name, request.arguments);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result
        };
      }
      case "resources/list":
        return {
          resources: [{
            uri: MINDFLOW_OPERATIONS_REFERENCE_URI,
            name: "MindFlow operations reference",
            mimeType: "text/markdown",
            description: "Operation-level reference for reading and editing MindFlow through MCP."
          }]
        };
      case "resources/read": {
        const request = asRecord(params);
        if (request.uri !== MINDFLOW_OPERATIONS_REFERENCE_URI) {
          throw new Error(`Unknown MindFlow MCP resource: ${String(request.uri)}`);
        }
        return {
          contents: [{
            uri: MINDFLOW_OPERATIONS_REFERENCE_URI,
            mimeType: "text/markdown",
            text: MINDFLOW_OPERATIONS_REFERENCE
          }]
        };
      }
      default:
        throw new Error(`Unsupported MCP method: ${method}`);
    }
  }
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
