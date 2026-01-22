export type SchemaNode = {
  type: "object" | "array" | "value";
  keys?: Record<string, SchemaNode>;
  item?: SchemaNode;
  distinctValues?: Record<string, string[]>;
};

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_SAMPLE_LIMIT = 50;
const DISTINCT_VALUE_LIMIT = 40;
const DISTINCT_KEYS = ["label", "type", "category", "name"];

export function buildSchemaTree(
  samples: unknown[],
  depth = 0,
  maxDepth = DEFAULT_MAX_DEPTH,
): SchemaNode {
  if (depth >= maxDepth) {
    return { type: "value" };
  }
  const nonEmpty = samples.filter((value) => value !== null && value !== undefined);
  if (nonEmpty.length === 0) return { type: "value" };

  const parsedSamples = nonEmpty.map((value) => parseMaybeJSON(value));
  const hasArray = parsedSamples.some((value) => Array.isArray(value));
  const hasObject = parsedSamples.some(
    (value) => value && typeof value === "object" && !Array.isArray(value),
  );

  if (hasArray) {
    const items: unknown[] = [];
    const distinctValues: Record<string, Set<string>> = {};
    parsedSamples.forEach((value) => {
      if (!Array.isArray(value)) return;
      value.forEach((item) => {
        items.push(item);
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const record = item as Record<string, unknown>;
          DISTINCT_KEYS.forEach((key) => {
            const raw = record[key];
            if (raw === undefined || raw === null) return;
            const valueText = stringifyValue(raw);
            if (!valueText) return;
            if (!distinctValues[key]) {
              distinctValues[key] = new Set<string>();
            }
            if (distinctValues[key].size < DISTINCT_VALUE_LIMIT) {
              distinctValues[key].add(valueText);
            }
          });
        }
      });
    });
    const limitedItems = items.slice(0, DEFAULT_SAMPLE_LIMIT);
    const itemSchema = buildSchemaTree(limitedItems, depth + 1, maxDepth);
    const normalizedDistinctValues: Record<string, string[]> = {};
    Object.entries(distinctValues).forEach(([key, valueSet]) => {
      normalizedDistinctValues[key] = Array.from(valueSet);
    });
    return {
      type: "array",
      item: itemSchema,
      distinctValues: Object.keys(normalizedDistinctValues).length
        ? normalizedDistinctValues
        : undefined,
    };
  }

  if (hasObject) {
    const keys: Record<string, SchemaNode> = {};
    const grouped: Record<string, unknown[]> = {};
    parsedSamples.forEach((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(child);
      });
    });
    Object.entries(grouped).forEach(([key, values]) => {
      keys[key] = buildSchemaTree(values, depth + 1, maxDepth);
    });
    return { type: "object", keys };
  }

  return { type: "value" };
}

export function normalizeSamples(rows: unknown[], limit = DEFAULT_SAMPLE_LIMIT): unknown[] {
  return rows.slice(0, limit);
}

function parseMaybeJSON(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
