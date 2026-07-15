import type { McpToolDefinition } from "./toolSchemas";

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  pattern?: string;
  minItems?: number;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
}

export function validateMcpToolInput(tool: McpToolDefinition, value: unknown): Record<string, unknown> {
  const input = value === undefined ? {} : value;
  const errors: string[] = [];
  validateValue(input, tool.inputSchema as JsonSchema, "$", errors);
  if (errors.length > 0) {
    throw new Error(`Invalid arguments for ${tool.name}: ${errors.join("; ")}`);
  }
  return input as Record<string, unknown>;
}

function validateValue(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.anyOf) {
    validateAlternatives(value, schema.anyOf, path, errors, "anyOf", false);
  }
  if (schema.oneOf) {
    validateAlternatives(value, schema.oneOf, path, errors, "oneOf", true);
  }

  if (schema.type !== "object" && schema.required) {
    if (!isRecord(value)) {
      errors.push(`${path} must be an object`);
    } else {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path}.${key} is required`);
        } else if (typeof value[key] === "string" && !value[key].trim()) {
          errors.push(`${path}.${key} must be a non-empty string`);
        }
      }
    }
  }

  if (schema.type === "object") {
    if (!isRecord(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`${path}.${key} is required`);
      } else if (typeof value[key] === "string" && !value[key].trim()) {
        errors.push(`${path}.${key} must be a non-empty string`);
      }
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        validateValue(value[key], propertySchema, `${path}.${key}`, errors);
      }
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateValue(item, schema.items as JsonSchema, `${path}[${index}]`, errors));
    }
    return;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path} must be a string`);
      return;
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} has an invalid format`);
    }
  } else if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${path} must be a finite number`);
      return;
    }
  } else if (schema.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path} must be a boolean`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map(String).join(", ")}`);
  }
}

function validateAlternatives(
  value: unknown,
  alternatives: JsonSchema[],
  path: string,
  errors: string[],
  keyword: "anyOf" | "oneOf",
  requireExactlyOne: boolean
): void {
  const results = alternatives.map((alternative) => {
    const alternativeErrors: string[] = [];
    validateValue(value, alternative, path, alternativeErrors);
    return alternativeErrors;
  });
  const matches = results.filter((result) => result.length === 0).length;
  if (matches === 0 || (requireExactlyOne && matches !== 1)) {
    errors.push(`${path} must match ${keyword} schema (${results.map((result) => result[0]).filter(Boolean).join("; ")})`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
