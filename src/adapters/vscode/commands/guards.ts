export interface FiniteCoordinates {
  x: number;
  y: number;
}

export function readFiniteCoordinates(x: unknown, y: unknown): FiniteCoordinates | undefined {
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? { x, y }
    : undefined;
}

export function hasOptionalFiniteCoordinates(x: unknown, y: unknown): boolean {
  return isOptionalFiniteNumber(x) && isOptionalFiniteNumber(y);
}

export function isPlainObject<T extends object>(value: unknown): value is T {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}
