import { useMemo } from "react";
import DrillDownBrowser, { type DrillPathConfig } from "./DrillDownBrowser";
import type { SchemaNode } from "../../utils/schemaUtils";

interface SmartExtractModalProps {
  isOpen: boolean;
  sourceFields: string[];
  sourceField: string;
  schema: SchemaNode | null;
  config: DrillPathConfig;
  sampleData?: unknown[];
  onSourceFieldChange: (value: string) => void;
  onConfigChange: (next: DrillPathConfig) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
}

export default function SmartExtractModal({
  isOpen,
  sourceFields,
  sourceField,
  schema,
  config,
  sampleData,
  onSourceFieldChange,
  onConfigChange,
  onCancel,
  onConfirm,
  confirmDisabled,
  loading,
}: SmartExtractModalProps) {
  // 计算预览值
  const previewValue = useMemo(() => {
    if (!sampleData || sampleData.length === 0 || !sourceField) return undefined;
    if (config.path.length === 0) return undefined;

    try {
      const firstRow = sampleData[0];
      if (!firstRow || typeof firstRow !== "object" || Array.isArray(firstRow)) return undefined;

      let current: unknown = getValueAtPath(firstRow as Record<string, unknown>, sourceField);
      current = parseMaybeJSON(current);

      // 遍历路径
      for (const segment of config.path) {
        current = parseMaybeJSON(current);
        if (Array.isArray(current)) {
          // 从数组中收集所有该字段的值
          const values: unknown[] = [];
          current.forEach((item) => {
            const parsed = parseMaybeJSON(item);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const child = (parsed as Record<string, unknown>)[segment];
              if (child !== undefined) {
                values.push(parseMaybeJSON(child));
              }
            }
          });
          current = values.length === 1 ? values[0] : values;
        } else if (current && typeof current === "object") {
          current = (current as Record<string, unknown>)[segment];
        } else {
          return undefined;
        }
      }

      // 应用过滤
      if (config.arrayMode === "filter" && config.filterKey && config.filterValue) {
        if (Array.isArray(current)) {
          const match = current.find((item) => {
            const parsed = parseMaybeJSON(item);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
            const candidate = (parsed as Record<string, unknown>)[config.filterKey];
            return String(candidate ?? "") === config.filterValue;
          });
          if (match && config.targetKey) {
            const parsed = parseMaybeJSON(match);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return (parsed as Record<string, unknown>)[config.targetKey];
            }
          }
          return match ?? null;
        }
      }

      return current;
    } catch {
      return undefined;
    }
  }, [sampleData, sourceField, config]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-large">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title">智能提取</h2>
            <p className="modal-subtitle">Finder 风格多层钻取，支持按条件筛选</p>
          </div>
          <button className="modal-close" type="button" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="finder-source-row">
            <label className="finder-source-label">来源字段</label>
            <select
              className="finder-source-select"
              value={sourceField}
              onChange={(e) => onSourceFieldChange(e.target.value)}
            >
              <option value="">选择字段...</option>
              {sourceFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>

          <DrillDownBrowser
            schema={schema}
            config={config}
            previewValue={previewValue}
            onConfigChange={onConfigChange}
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || loading}
          >
            {loading ? "处理中..." : "提取"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getValueAtPath(target: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = target;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function parseMaybeJSON(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
