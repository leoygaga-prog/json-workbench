import JSONbig from "json-bigint";
import * as XLSX from "xlsx";

export type WorkerParsePayload =
  | { kind: "json"; text: string }
  | { kind: "jsonl"; text: string }
  | { kind: "xlsx"; buffer: ArrayBuffer };

export type BatchAction =
  | {
      kind: "addField";
      key: string;
      mode: "static" | "copy";
      value?: string;
      fromKey?: string;
    }
  | { kind: "deleteField"; keys: string[] }
  | { kind: "renameField"; from: string; to: string }
  | {
      kind: "updateValue";
      key: string;
      mode: "set" | "prefixSuffix";
      value?: string;
      prefix?: string;
      suffix?: string;
    }
  | { kind: "typeConvert"; key: string; target: "string" | "number" | "boolean" }
  | {
      kind: "extractByCondition";
      sourceField: string;
      matchKey: string;
      matchValue: string;
      extractKey: string;
      targetField: string;
    }
  | { kind: "nestFields"; sourceFields: string[]; targetField: string }
  | { kind: "flattenStrip"; stripPrefix?: string; depth?: number; targetKey?: string; targetKeys?: string[]; keepPrefix?: boolean; useSmartEAV?: boolean }
  | { kind: "keyReorder"; order: string[] }
  | { kind: "escapeString"; key?: string; targetKeys?: string[] }  // 转义：对象/数组转为 JSON 字符串
  | { kind: "unescapeString"; key?: string; targetKeys?: string[] }  // 去转义：仅移除转义字符（\" → "）
  | { kind: "parseJSON"; key?: string; targetKeys?: string[] };  // 解析JSON：将JSON字符串解析为对象/数组

export type WorkerRequest =
  | { id: string; type: "parse"; payload: WorkerParsePayload }
  | { id: string; type: "stringify"; payload: { data: unknown; format: "json" | "jsonl" } }
  | { id: string; type: "batch"; payload: { action: BatchAction; data: unknown[] } };

export type ParseErrorRow = { line: number; raw: string; message: string };

export type WorkerResponse =
  | { id: string; type: "parse"; payload: { data: unknown[]; errors: ParseErrorRow[] } }
  | { id: string; type: "stringify"; payload: { text: string } }
  | { id: string; type: "batch"; payload: { data: unknown[]; warnings: string[] } }
  | { id: string; type: "progress"; payload: { percent: number; stage: string } }
  | { id: string; type: "error"; payload: { message: string } };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  const { id } = message;
  try {
    switch (message.type) {
      case "parse":
        postProgress(id, 0, "parse");
        postMessage({
          id,
          type: "parse",
          payload: parseData(message.payload, id),
        });
        postProgress(id, 100, "parse");
        break;
      case "stringify":
        postProgress(id, 0, "stringify");
        postMessage({
          id,
          type: "stringify",
          payload: stringifyData(message.payload.data, message.payload.format, id),
        });
        postProgress(id, 100, "stringify");
        break;
      case "batch":
        postMessage({
          id,
          type: "batch",
          payload: applyBatch(message.payload.data, message.payload.action),
        });
        break;
      default:
        postMessage({
          id,
          type: "error",
          payload: { message: "Unsupported worker action" },
        });
    }
  } catch (error) {
    postMessage({
      id,
      type: "error",
      payload: { message: error instanceof Error ? error.message : "Unknown error" },
    });
  }
};

const jsonParser = JSONbig({ storeAsString: true });

function parseData(
  payload: WorkerParsePayload,
  requestId: string,
): {
  data: unknown[];
  errors: ParseErrorRow[];
} {
  if (payload.kind === "xlsx") {
    postProgress(requestId, 30, "parse:xlsx");
    const workbook = XLSX.read(payload.buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = firstSheet ? XLSX.utils.sheet_to_json(firstSheet) : [];
    return { data, errors: [] };
  }

  const text = payload.text ?? "";
  if (payload.kind === "json") {
    postProgress(requestId, 30, "parse:json");
    const parsed = jsonParser.parse(text);
    if (Array.isArray(parsed)) {
      return { data: parsed, errors: [] };
    }
    return { data: [parsed], errors: [] };
  }

  const errors: ParseErrorRow[] = [];
  const rows: unknown[] = [];
  const lines = text.split(/\r?\n/);
  const total = lines.length || 1;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      rows.push(jsonParser.parse(trimmed));
    } catch (error) {
      errors.push({
        line: index + 1,
        raw: line,
        message: error instanceof Error ? error.message : "Invalid JSONL row",
      });
    }
    if (index % 500 === 0) {
      const percent = Math.min(99, Math.round((index / total) * 100));
      postProgress(requestId, percent, "parse:jsonl");
    }
  });
  return { data: rows, errors };
}

function stringifyData(
  data: unknown,
  format: "json" | "jsonl",
  requestId: string,
) {
  if (format === "jsonl" && Array.isArray(data)) {
    const total = data.length || 1;
    const lines: string[] = [];
    data.forEach((row, index) => {
      lines.push(JSON.stringify(row));
      if (index % 500 === 0) {
        const percent = Math.min(99, Math.round((index / total) * 100));
        postProgress(requestId, percent, "stringify:jsonl");
      }
    });
    return { text: lines.join("\n") };
  }
  return { text: JSON.stringify(data, null, 2) };
}

function postProgress(id: string, percent: number, stage: string) {
  const bounded = Math.max(0, Math.min(100, percent));
  postMessage({ id, type: "progress", payload: { percent: bounded, stage } });
}

function applyBatch(data: unknown[], action: BatchAction): {
  data: unknown[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const nextData = data.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }
    const record = item as Record<string, unknown>;
    switch (action.kind) {
      case "addField": {
        const value =
          action.mode === "copy" && action.fromKey
            ? record[action.fromKey]
            : action.value ?? "";
        return { ...record, [action.key]: value };
      }
      case "deleteField": {
        const next = { ...record };
        action.keys.forEach((key) => {
          delete next[key];
        });
        return next;
      }
      case "renameField": {
        if (!(action.from in record)) return record;
        const next = { ...record };
        next[action.to] = next[action.from];
        delete next[action.from];
        return next;
      }
      case "updateValue": {
        if (!(action.key in record)) return record;
        const next = { ...record };
        const current = next[action.key];
        if (action.mode === "set") {
          next[action.key] = action.value ?? "";
        } else if (typeof current === "string") {
          next[action.key] = `${action.prefix ?? ""}${current}${action.suffix ?? ""}`;
        }
        return next;
      }
      case "extractByCondition": {
        const source = getValueByPath(record, action.sourceField);
        if (!Array.isArray(source)) return record;
        const matched = source.find((item) => {
          if (!item || typeof item !== "object") return false;
          return (
            getValueByPath(item as Record<string, unknown>, action.matchKey) === action.matchValue
          );
        }) as Record<string, unknown> | undefined;
        if (!matched) return record;
        const extracted = getValueByPath(matched, action.extractKey);
        if (extracted === undefined) return record;
        return { ...record, [action.targetField]: extracted };
      }
      case "nestFields": {
        if (!action.targetField || action.sourceFields.length === 0) return record;
        const next = { ...record };
        const existing = next[action.targetField];
        const targetObject =
          existing && typeof existing === "object" && !Array.isArray(existing)
            ? { ...(existing as Record<string, unknown>) }
            : {};
        action.sourceFields.forEach((field) => {
          targetObject[field] = next[field];
          delete next[field];
        });
        next[action.targetField] = targetObject;
        return next;
      }
      case "typeConvert": {
        if (!(action.key in record)) return record;
        const next = { ...record };
        const current = next[action.key];
        switch (action.target) {
          case "string":
            next[action.key] = String(current);
            break;
          case "number": {
            const num = Number(current);
            if (Number.isNaN(num)) {
              warnings.push(`无法转换为数字: ${String(current)}`);
            } else {
              next[action.key] = num;
            }
            break;
          }
          case "boolean":
            next[action.key] = Boolean(current);
            break;
        }
        return next;
      }
      case "flattenStrip": {
        const depth = action.depth ?? Infinity;
        const keepPrefix = action.keepPrefix ?? true;
        const useSmartEAV = action.useSmartEAV ?? false;
        
        // 支持单个 targetKey 或多个 targetKeys
        const targetKeys = action.targetKeys ?? (action.targetKey ? [action.targetKey] : []);
        
        let result: Record<string, unknown>;
        
        if (targetKeys.length > 0) {
          // 扁平化指定字段（支持多个）
          result = { ...record };
          
          for (const targetKey of targetKeys) {
            if (targetKey in result) {
              const targetValue = result[targetKey];
              // 支持对象和数组的扁平化
              if (targetValue && typeof targetValue === "object") {
                // 根据 keepPrefix 决定是否保留父键名作为前缀
                const prefix = keepPrefix ? targetKey : "";
                const flattened = flattenObject(targetValue, prefix, {}, depth, 0, useSmartEAV);
                delete result[targetKey];
                Object.assign(result, flattened);
              }
            }
          }
        } else {
          // 扁平化整个对象
          result = flattenObject(record, "", {}, depth, 0, useSmartEAV);
        }
        
        // 如果有额外的 stripPrefix，继续去除前缀
        if (action.stripPrefix) {
          const stripped: Record<string, unknown> = {};
          Object.entries(result).forEach(([key, value]) => {
            const nextKey = key.startsWith(action.stripPrefix!)
              ? key.slice(action.stripPrefix!.length)
              : key;
            stripped[nextKey] = value;
          });
          return stripped;
        }
        
        return result;
      }
      case "keyReorder": {
        const next: Record<string, unknown> = {};
        action.order.forEach((key) => {
          if (key in record) {
            next[key] = record[key];
          }
        });
        Object.keys(record).forEach((key) => {
          if (!(key in next)) {
            next[key] = record[key];
          }
        });
        return next;
      }
      case "escapeString": {
        // 转义：将字符串中的特殊字符转为转义序列
        // " → \"，换行 → \n，制表符 → \t 等
        // 如果是对象/数组，则序列化为 JSON 字符串
        const targetKeys = action.targetKeys ?? (action.key ? [action.key] : []);
        const next = { ...record };
        
        if (targetKeys.length > 0) {
          for (const key of targetKeys) {
            if (key in next) {
              const current = next[key];
              if (typeof current === "string") {
                // 字符串：添加转义字符
                next[key] = escapeStringValue(current);
              } else if (current !== null && typeof current === "object") {
                // 对象/数组：序列化为 JSON 字符串
                try {
                  next[key] = JSON.stringify(current);
                } catch {
                  warnings.push(`转义失败: ${key}`);
                }
              }
            }
          }
        } else {
          // 处理整个记录
          Object.keys(next).forEach((key) => {
            const current = next[key];
            if (typeof current === "string") {
              next[key] = escapeStringValue(current);
            } else if (current !== null && typeof current === "object") {
              try {
                next[key] = JSON.stringify(current);
              } catch {
                // 忽略失败
              }
            }
          });
        }
        return next;
      }
      case "unescapeString": {
        // 去转义：将转义序列还原为原始字符
        // \" → "，\n → 换行，\t → 制表符 等
        const targetKeys = action.targetKeys ?? (action.key ? [action.key] : []);
        const next = { ...record };
        
        if (targetKeys.length > 0) {
          for (const key of targetKeys) {
            if (key in next && typeof next[key] === "string") {
              next[key] = unescapeStringValue(next[key] as string);
            }
          }
        } else {
          // 处理整个记录中的所有字符串字段
          for (const key of Object.keys(next)) {
            if (typeof next[key] === "string") {
              next[key] = unescapeStringValue(next[key] as string);
            }
          }
        }
        return next;
      }
      case "parseJSON": {
        // 解析JSON：将JSON字符串解析为对象/数组（支持递归解析嵌套结构）
        const targetKeys = action.targetKeys ?? (action.key ? [action.key] : []);
        const next = { ...record };
        
        if (targetKeys.length > 0) {
          // 只解析指定字段
          for (const key of targetKeys) {
            if (key in next) {
              next[key] = smartParseValue(next[key], warnings);
            }
          }
        } else {
          // 解析整个记录（递归处理所有字段）
          return smartParseValue(record, warnings) as Record<string, unknown>;
        }
        return next;
      }
      default:
        return record;
    }
  });
  return { data: nextData, warnings };
}

/**
 * 转义：将字符串中的特殊字符转为转义序列
 * - " → \"
 * - \ → \\
 * - 换行符 → \n
 * - 制表符 → \t
 * - 回车符 → \r
 */
function escapeStringValue(str: string): string {
  return str
    .replace(/\\/g, "\\\\")  // 先处理反斜杠，避免双重转义
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * 去转义：将转义序列还原为原始字符
 * - \" → "
 * - \\ → \
 * - \n → 换行符
 * - \t → 制表符
 * - \r → 回车符
 */
function unescapeStringValue(str: string): string {
  // 使用状态机处理，确保正确处理转义序列
  let result = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      const nextChar = str[i + 1];
      switch (nextChar) {
        case "n":
          result += "\n";
          i += 2;
          break;
        case "t":
          result += "\t";
          i += 2;
          break;
        case "r":
          result += "\r";
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        case "'":
          result += "'";
          i += 2;
          break;
        case "\\":
          result += "\\";
          i += 2;
          break;
        default:
          // 不是已知的转义序列，保留原样
          result += str[i];
          i += 1;
      }
    } else {
      result += str[i];
      i += 1;
    }
  }
  return result;
}

/**
 * 智能递归解析 JSON 字符串
 * - 如果值是字符串，尝试解析为 JSON
 * - 只接受解析结果为 Object 或 Array 的情况（忽略 "123", "true" 等）
 * - 递归处理嵌套的字符串化 JSON
 */
function smartParseValue(value: unknown, warnings: string[]): unknown {
  // 如果是字符串，尝试解析
  if (typeof value === "string") {
    const trimmed = value.trim();
    // 快速检查：只有以 { 或 [ 开头的才可能是 JSON 对象/数组
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = jsonParser.parse(trimmed);
        // 只接受 Object 或 Array 类型的解析结果
        if (parsed !== null && typeof parsed === "object") {
          // 递归处理解析后的对象，以处理嵌套的字符串化 JSON
          return smartParseValue(parsed, warnings);
        }
      } catch {
        // 解析失败，保持原字符串
      }
    }
    return value;
  }
  
  // 如果是数组，递归处理每个元素
  if (Array.isArray(value)) {
    return value.map((item) => smartParseValue(item, warnings));
  }
  
  // 如果是对象，递归处理每个值
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = smartParseValue(val, warnings);
    }
    return result;
  }
  
  // 其他类型（number, boolean, null）直接返回
  return value;
}

/**
 * 检查对象是否是 EAV（Entity-Attribute-Value）结构
 * 即具有 "label" 和 "value" 两个键的对象
 */
function isEAVObject(obj: unknown): obj is { label: string; value: unknown } {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return (
    "label" in record &&
    "value" in record &&
    typeof record.label === "string" &&
    record.label.length > 0
  );
}

/**
 * 递归扁平化对象和数组
 * - 对象：{ user: { name: "张三" } } → { "user.name": "张三" }
 * - 数组：{ tags: ["a", "b"] } → { "tags.0": "a", "tags.1": "b" }
 * - 智能 EAV：{ tags: [{ label: "Title", value: "Hello" }] } → { "tags.Title": "Hello" }
 * 
 * @param obj - 要扁平化的对象或数组
 * @param prefix - 当前键的前缀
 * @param result - 累积结果对象
 * @param maxDepth - 最大递归深度 (Infinity = 无限深度)
 * @param currentDepth - 当前递归深度
 * @param useSmartEAV - 是否启用智能 EAV 转换
 */
function flattenObject(
  obj: unknown,
  prefix = "",
  result: Record<string, unknown> = {},
  maxDepth = Infinity,
  currentDepth = 0,
  useSmartEAV = false,
): Record<string, unknown> {
  // 基本情况：如果不是对象/数组、是 null、或已达到最大深度
  if (obj === null || typeof obj !== "object") {
    if (prefix) {
      result[prefix] = obj;
    }
    return result;
  }

  // 如果已达到最大深度，不再递归
  if (currentDepth >= maxDepth) {
    result[prefix] = obj;
    return result;
  }

  // 智能 EAV 模式：检查当前对象是否是 { label, value } 结构
  if (useSmartEAV && isEAVObject(obj)) {
    // 使用 label 作为键名，value 作为值
    const eavLabel = obj.label;
    const eavValue = obj.value;
    // 清理键名（去除可能的点号，避免路径冲突）
    const cleanLabel = eavLabel.trim().replace(/\./g, "_");
    const eavKey = prefix ? `${prefix}.${cleanLabel}` : cleanLabel;
    
    // 如果 value 是原始类型，直接赋值
    if (eavValue === null || typeof eavValue !== "object") {
      result[eavKey] = eavValue;
    } else {
      // 如果 value 是对象/数组，递归处理
      flattenObject(eavValue, eavKey, result, maxDepth, currentDepth + 1, useSmartEAV);
    }
    return result;
  }

  // 处理对象和数组（Object.keys 对数组返回 ["0", "1", ...]）
  const keys = Object.keys(obj as object);
  
  // 如果是空对象或空数组，保留原值
  if (keys.length === 0) {
    if (prefix) {
      result[prefix] = obj;
    }
    return result;
  }

  keys.forEach((key) => {
    const value = (obj as Record<string, unknown>)[key];
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object") {
      // 递归处理嵌套对象或数组
      flattenObject(value, nextKey, result, maxDepth, currentDepth + 1, useSmartEAV);
    } else {
      // 原始值直接赋值
      result[nextKey] = value;
    }
  });

  return result;
}

function getValueByPath(target: unknown, path: string): unknown {
  if (!path || target === null || target === undefined) return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = target;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    current = record[segment];
  }
  return current;
}

