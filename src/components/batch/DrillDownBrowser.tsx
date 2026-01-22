import { useMemo, useEffect, useRef } from "react";
import { ChevronRight, Folder, FileText, Tag, List, Hash } from "lucide-react";
import type { SchemaNode } from "../../utils/schemaUtils";

export type DrillArrayMode = "none" | "whole" | "filter";

export interface DrillPathConfig {
  path: string[];
  arrayMode: DrillArrayMode;
  filterKey: string;
  filterValue: string;
  targetKey: string;
  outputField: string;
}

interface DrillDownBrowserProps {
  schema: SchemaNode | null;
  config: DrillPathConfig;
  previewValue?: unknown;
  onConfigChange: (next: DrillPathConfig) => void;
}

// 常见的内容字段名，用于自动选择目标
const CONTENT_KEYS = ["value", "content", "data", "text", "result", "answer", "name"];

function resolveNode(schema: SchemaNode | null, path: string[]): SchemaNode | null {
  let node: SchemaNode | null = schema;
  for (const segment of path) {
    if (!node) return null;
    while (node && node.type === "array") {
      node = node.item ?? null;
    }
    if (!node || node.type !== "object") return null;
    node = node.keys?.[segment] ?? null;
  }
  return node;
}

function getNodeIcon(node: SchemaNode | null, isSelected: boolean) {
  const color = isSelected ? "text-white" : "text-slate-400";
  if (!node) return <FileText size={14} className={color} />;
  if (node.type === "array") return <List size={14} className={isSelected ? "text-white" : "text-purple-500"} />;
  if (node.type === "object") return <Folder size={14} className={isSelected ? "text-white" : "text-blue-500"} />;
  return <FileText size={14} className={color} />;
}

// 自动检测最佳目标字段
function detectBestTargetKey(itemKeys: string[]): string {
  for (const key of CONTENT_KEYS) {
    if (itemKeys.includes(key)) return key;
  }
  return itemKeys[0] || "";
}

// 生成简洁的输出字段名
function generateOutputFieldName(filterValue: string, targetKey: string): string {
  // 移除特殊字符，转换为 snake_case
  const cleanValue = filterValue
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  
  if (targetKey && targetKey !== "value") {
    return `${cleanValue}_${targetKey}`;
  }
  return cleanValue || targetKey || "extracted";
}

export default function DrillDownBrowser({
  schema,
  config,
  previewValue,
  onConfigChange,
}: DrillDownBrowserProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const updateConfig = (partial: Partial<DrillPathConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  // 当配置完成时，自动聚焦输入框
  useEffect(() => {
    if (config.arrayMode === "filter" && config.filterValue && config.targetKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [config.arrayMode, config.filterValue, config.targetKey]);

  // 构建列数据
  const columnData = useMemo(() => {
    if (!schema) return { columns: [], leafNode: null, itemKeys: [], discriminators: [] };

    const columns: Array<{
      type: "keys" | "array-merged" | "target-keys";
      title: string;
      items: Array<{
        kind: "key" | "whole" | "virtual-group" | "raw-key";
        key: string;
        label: string;
        isSelected: boolean;
        node?: SchemaNode | null;
        filterKey?: string;
      }>;
    }> = [];

    let currentNode: SchemaNode | null = schema;

    // 遍历路径，为每一层生成列
    for (let i = 0; i <= config.path.length; i += 1) {
      while (currentNode && currentNode.type === "array") {
        currentNode = currentNode.item ?? null;
      }
      if (!currentNode || currentNode.type !== "object") break;

      const keys = Object.keys(currentNode.keys ?? {});
      const selectedKey = config.path[i] ?? "";

      columns.push({
        type: "keys",
        title: i === 0 ? "选择字段" : "继续钻取",
        items: keys.map((key) => {
          const pathToKey = config.path.slice(0, i);
          pathToKey.push(key);
          const childNode = resolveNode(schema, pathToKey);
          return {
            kind: "key" as const,
            key,
            label: key,
            isSelected: selectedKey === key,
            node: childNode,
          };
        }),
      });

      if (selectedKey) {
        currentNode = currentNode.keys?.[selectedKey] ?? null;
      } else {
        break;
      }
    }

    // 检查叶节点是否为数组
    const leafNode = resolveNode(schema, config.path);
    if (leafNode?.type === "array") {
      const itemNode = leafNode.item;
      const itemKeys = Object.keys(itemNode?.keys ?? {});
      const distinctValues = leafNode.distinctValues ?? {};

      // 找到最佳判别器（优先选择 label, name, type 等）
      const discriminatorPriority = ["label", "name", "type", "category", "key", "tag"];
      let bestDiscriminator: { key: string; values: string[] } | null = null;

      for (const dk of discriminatorPriority) {
        if (distinctValues[dk] && distinctValues[dk].length > 0 && distinctValues[dk].length <= 30) {
          bestDiscriminator = { key: dk, values: distinctValues[dk] };
          break;
        }
      }

      // 如果没找到优先的，取第一个合适的
      if (!bestDiscriminator) {
        for (const [key, values] of Object.entries(distinctValues)) {
          if (values.length > 0 && values.length <= 30) {
            bestDiscriminator = { key, values };
            break;
          }
        }
      }

      // 合并列：虚拟分组 + 原始字段
      const mergedItems: Array<{
        kind: "key" | "whole" | "virtual-group" | "raw-key";
        key: string;
        label: string;
        isSelected: boolean;
        node?: SchemaNode | null;
        filterKey?: string;
      }> = [];

      // 1. 提取整个列表选项
      mergedItems.push({
        kind: "whole",
        key: "__whole__",
        label: "提取整个列表",
        isSelected: config.arrayMode === "whole",
      });

      // 2. 虚拟分组（按判别器的值）
      if (bestDiscriminator) {
        for (const value of bestDiscriminator.values) {
          mergedItems.push({
            kind: "virtual-group",
            key: `__filter__${value}`,
            label: value,
            isSelected: config.arrayMode === "filter" && config.filterValue === value,
            filterKey: bestDiscriminator.key,
          });
        }
      }

      // 3. 原始字段（供高级用户使用）
      for (const key of itemKeys) {
        const childNode = resolveNode(schema, [...config.path, key]);
        mergedItems.push({
          kind: "raw-key",
          key,
          label: key,
          isSelected: false,
          node: childNode,
        });
      }

      columns.push({
        type: "array-merged",
        title: bestDiscriminator ? `按 ${bestDiscriminator.key} 选择` : "数组操作",
        items: mergedItems,
      });

      // 如果已选择过滤值，显示目标字段列
      if (config.arrayMode === "filter" && config.filterValue) {
        columns.push({
          type: "target-keys",
          title: "提取字段",
          items: itemKeys.map((key) => ({
            kind: "key" as const,
            key,
            label: key,
            isSelected: config.targetKey === key,
          })),
        });
      }

      return { columns, leafNode, itemKeys, discriminators: bestDiscriminator ? [bestDiscriminator] : [] };
    }

    return { columns, leafNode, itemKeys: [], discriminators: [] };
  }, [schema, config.path, config.arrayMode, config.filterValue, config.targetKey]);

  const { columns, itemKeys } = columnData;

  // 判断是否可以提取
  const canExtract = useMemo(() => {
    if (!config.outputField.trim()) return false;
    if (config.path.length === 0) return false;
    const leafNode = resolveNode(schema, config.path);
    if (!leafNode) return false;
    if (leafNode.type === "array") {
      if (config.arrayMode === "whole") return true;
      if (config.arrayMode === "filter") {
        return !!(config.filterKey && config.filterValue && config.targetKey);
      }
      return false;
    }
    return true;
  }, [schema, config]);

  if (!schema) {
    return (
      <div className="finder-empty">
        <div className="finder-empty-text">请先选择来源字段</div>
      </div>
    );
  }

  // 处理点击事件
  const handleItemClick = (colIndex: number, item: typeof columns[0]["items"][0], colType: string) => {
    if (colType === "keys") {
      // 普通字段点击
      const nextPath = config.path.slice(0, colIndex);
      nextPath.push(item.key);
      updateConfig({
        path: nextPath,
        arrayMode: "none",
        filterKey: "",
        filterValue: "",
        targetKey: "",
        outputField: "",
      });
    } else if (colType === "array-merged") {
      if (item.kind === "whole") {
        // 提取整个列表
        updateConfig({
          arrayMode: "whole",
          filterKey: "",
          filterValue: "",
          targetKey: "",
          outputField: config.path[config.path.length - 1] || "list",
        });
      } else if (item.kind === "virtual-group") {
        // 虚拟分组点击 - 自动选择目标字段
        const bestTarget = detectBestTargetKey(itemKeys);
        const outputName = generateOutputFieldName(item.label, bestTarget);
        updateConfig({
          arrayMode: "filter",
          filterKey: item.filterKey || "",
          filterValue: item.label,
          targetKey: bestTarget,
          outputField: outputName,
        });
      } else if (item.kind === "raw-key") {
        // 原始字段点击 - 进入下一层
        updateConfig({
          path: [...config.path, item.key],
          arrayMode: "none",
          filterKey: "",
          filterValue: "",
          targetKey: "",
          outputField: "",
        });
      }
    } else if (colType === "target-keys") {
      // 目标字段选择
      const outputName = generateOutputFieldName(config.filterValue, item.key);
      updateConfig({
        targetKey: item.key,
        outputField: outputName,
      });
    }
  };

  return (
    <div className="finder-container">
      <div className="finder-columns">
        {columns.map((col, colIndex) => (
          <div key={`col-${colIndex}`} className="finder-column">
            <div className="finder-column-header">{col.title}</div>

            {col.type === "array-merged" && (
              <>
                {/* 提取整个列表 */}
                {col.items
                  .filter((item) => item.kind === "whole")
                  .map((item) => (
                    <div
                      key={item.key}
                      className={`finder-item ${item.isSelected ? "selected" : ""}`}
                      onClick={() => handleItemClick(colIndex, item, col.type)}
                    >
                      <List size={14} className={item.isSelected ? "text-white" : "text-green-500"} />
                      <span className="finder-item-text">{item.label}</span>
                    </div>
                  ))}

                {/* 虚拟分组 */}
                {col.items.some((item) => item.kind === "virtual-group") && (
                  <>
                    <div className="finder-divider" />
                    <div className="finder-section-label">
                      <Hash size={10} className="inline mr-1" />
                      按值筛选
                    </div>
                    {col.items
                      .filter((item) => item.kind === "virtual-group")
                      .map((item) => (
                        <div
                          key={item.key}
                          className={`finder-item ${item.isSelected ? "selected" : ""}`}
                          onClick={() => handleItemClick(colIndex, item, col.type)}
                        >
                          <Tag size={14} className={item.isSelected ? "text-white" : "text-orange-500"} />
                          <span className="finder-item-text">{item.label}</span>
                          {!item.isSelected && <ChevronRight size={14} className="finder-item-arrow" />}
                        </div>
                      ))}
                  </>
                )}

                {/* 原始字段 */}
                {col.items.some((item) => item.kind === "raw-key") && (
                  <>
                    <div className="finder-divider" />
                    <div className="finder-section-label">
                      <Folder size={10} className="inline mr-1" />
                      原始字段
                    </div>
                    {col.items
                      .filter((item) => item.kind === "raw-key")
                      .map((item) => (
                        <div
                          key={item.key}
                          className="finder-item"
                          onClick={() => handleItemClick(colIndex, item, col.type)}
                        >
                          {getNodeIcon(item.node ?? null, false)}
                          <span className="finder-item-text">{item.label}</span>
                          <ChevronRight size={14} className="finder-item-arrow" />
                        </div>
                      ))}
                  </>
                )}
              </>
            )}

            {col.type === "target-keys" && (
              <>
                {col.items.map((item) => (
                  <div
                    key={item.key}
                    className={`finder-item ${item.isSelected ? "selected" : ""}`}
                    onClick={() => handleItemClick(colIndex, item, col.type)}
                  >
                    <FileText size={14} className={item.isSelected ? "text-white" : "text-slate-400"} />
                    <span className="finder-item-text">{item.label}</span>
                  </div>
                ))}
              </>
            )}

            {col.type === "keys" && (
              <>
                {col.items.length === 0 && <div className="finder-empty-hint">没有更多字段</div>}
                {col.items.map((item) => (
                  <div
                    key={item.key}
                    className={`finder-item ${item.isSelected ? "selected" : ""}`}
                    onClick={() => handleItemClick(colIndex, item, col.type)}
                  >
                    {getNodeIcon(item.node ?? null, item.isSelected)}
                    <span className="finder-item-text">{item.label}</span>
                    {item.node && item.node.type !== "value" && (
                      <ChevronRight size={14} className="finder-item-arrow" />
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}

        {/* 预览和确认面板 */}
        <div className="finder-preview">
          <div className="finder-preview-header">提取配置</div>

          <div className="finder-preview-section">
            <div className="finder-preview-label">路径</div>
            <div className="finder-preview-path">
              {config.path.length > 0 ? config.path.join(" → ") : "未选择"}
              {config.arrayMode === "filter" && config.filterKey && config.filterValue && (
                <span className="finder-preview-filter">
                  [{config.filterKey}="{config.filterValue}"]
                </span>
              )}
              {config.targetKey && <span className="finder-preview-target"> → {config.targetKey}</span>}
            </div>
          </div>

          {previewValue !== undefined && (
            <div className="finder-preview-section">
              <div className="finder-preview-label">预览值</div>
              <div className="finder-preview-value">{formatPreview(previewValue)}</div>
            </div>
          )}

          <div className="finder-preview-section">
            <div className="finder-preview-label">保存到字段名</div>
            <input
              ref={inputRef}
              className="finder-preview-input"
              value={config.outputField}
              onChange={(e) => updateConfig({ outputField: e.target.value })}
              placeholder="输入字段名..."
            />
          </div>

          <div className="finder-preview-status">
            {canExtract ? (
              <span className="finder-status-ready">✓ 配置完成，可以提取</span>
            ) : (
              <span className="finder-status-pending">请完成路径选择和字段名</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPreview(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value.length > 100 ? value.slice(0, 100) + "..." : value;
  try {
    const str = JSON.stringify(value, null, 2);
    return str.length > 200 ? str.slice(0, 200) + "..." : str;
  } catch {
    return String(value);
  }
}
