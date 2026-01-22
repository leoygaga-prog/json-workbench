import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, Filter, Check } from "lucide-react";
import { useFileStore } from "../../store/fileStore";

interface ValueDistribution {
  value: string;
  count: number;
  percentage: number;
}

const CATEGORICAL_HINTS = ["type", "status", "label", "id", "category", "state", "mode", "kind"];
const MAX_DISPLAY_VALUES = 20;

export default function DataInsightsPanel() {
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const addFilterRule = useFileStore((state) => state.addFilterRule);
  const getAllFilterRules = useFileStore((state) => state.getAllFilterRules);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedField, setSelectedField] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const allFilterRules = getAllFilterRules();

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? null,
    [files, activeFileId]
  );

  // 获取所有可用字段（扁平化）
  const availableFields = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0) return [];
    const firstRecord = activeFile.data[0];
    if (!firstRecord || typeof firstRecord !== "object" || Array.isArray(firstRecord)) {
      return [];
    }

    const fields: string[] = [];
    const collectKeys = (obj: Record<string, unknown>, prefix = "") => {
      Object.entries(obj).forEach(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          collectKeys(value as Record<string, unknown>, fullKey);
        } else {
          fields.push(fullKey);
        }
      });
    };
    collectKeys(firstRecord as Record<string, unknown>);
    return fields;
  }, [activeFile]);

  // 智能选择默认字段
  const smartDefaultField = useMemo(() => {
    if (availableFields.length === 0) return "";
    // 查找可能的分类字段
    for (const hint of CATEGORICAL_HINTS) {
      const match = availableFields.find(
        (f) => f.toLowerCase().endsWith(hint) || f.toLowerCase().includes(hint)
      );
      if (match) return match;
    }
    return availableFields[0];
  }, [availableFields]);

  // 如果没有选择字段，使用智能默认
  const effectiveField = selectedField || smartDefaultField;

  // 计算分布
  const distribution = useMemo<ValueDistribution[]>(() => {
    if (!activeFile || !effectiveField) return [];

    const counts = new Map<string, number>();
    let totalItems = 0;

    activeFile.data.forEach((record) => {
      if (!record || typeof record !== "object") return;

      // 获取嵌套字段的值
      const getValue = (obj: unknown, path: string): unknown => {
        const parts = path.split(".");
        let current: unknown = obj;
        for (const part of parts) {
          if (current && typeof current === "object" && !Array.isArray(current)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return undefined;
          }
        }
        return current;
      };

      const value = getValue(record, effectiveField);

      if (value === null || value === undefined) {
        // Null/Undefined -> (Empty)
        const key = "(Empty)";
        counts.set(key, (counts.get(key) || 0) + 1);
        totalItems++;
      } else if (Array.isArray(value)) {
        // 数组：展开并计数每个元素
        if (value.length === 0) {
          const key = "(Empty Array)";
          counts.set(key, (counts.get(key) || 0) + 1);
          totalItems++;
        } else {
          value.forEach((item) => {
            const key = String(item ?? "(Empty)");
            counts.set(key, (counts.get(key) || 0) + 1);
            totalItems++;
          });
        }
      } else {
        // String/Number/Boolean
        const key = String(value);
        counts.set(key, (counts.get(key) || 0) + 1);
        totalItems++;
      }
    });

    // 转换为数组并排序
    const sorted = Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        percentage: totalItems > 0 ? (count / totalItems) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 限制显示数量，其余归为 "Others"
    if (sorted.length > MAX_DISPLAY_VALUES) {
      const top = sorted.slice(0, MAX_DISPLAY_VALUES - 1);
      const othersCount = sorted.slice(MAX_DISPLAY_VALUES - 1).reduce((sum, item) => sum + item.count, 0);
      const othersPercentage = sorted.slice(MAX_DISPLAY_VALUES - 1).reduce((sum, item) => sum + item.percentage, 0);
      top.push({
        value: `(Others: ${sorted.length - MAX_DISPLAY_VALUES + 1} values)`,
        count: othersCount,
        percentage: othersPercentage,
      });
      return top;
    }

    return sorted;
  }, [activeFile, effectiveField]);

  // 最大计数（用于进度条宽度）
  const maxCount = useMemo(() => {
    if (distribution.length === 0) return 1;
    return Math.max(...distribution.map((d) => d.count));
  }, [distribution]);

  // 检查某个值是否已经在过滤规则中
  const isValueActive = (value: string): boolean => {
    return allFilterRules.some(
      (rule) =>
        rule.field === effectiveField &&
        rule.operator === "equals" &&
        rule.value === value
    );
  };

  // 点击统计行 -> 添加过滤规则
  const handleStatClick = (value: string) => {
    if (!effectiveField || value.startsWith("(Others:")) return;

    // 如果该值已经激活，不再添加
    if (isValueActive(value)) return;

    // 添加过滤规则（自动处理分组：同字段 OR，不同字段 AND）
    addFilterRule({
      id: crypto.randomUUID(),
      field: effectiveField,
      operator: value === "(Empty)" || value === "(Empty Array)" ? "isEmpty" : "equals",
      value: value === "(Empty)" || value === "(Empty Array)" ? "" : value,
    });

    // 提示用户
    setToastMessage("已添加筛选条件");
    setTimeout(() => setToastMessage(null), 1500);
  };

  if (!activeFile) {
    return (
      <div className="insights-panel">
        <div className="insights-header" onClick={() => setIsCollapsed(!isCollapsed)}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <BarChart3 size={14} />
          <span className="insights-title">数据洞察</span>
        </div>
        {!isCollapsed && (
          <div className="insights-empty">请先选择一个数据文件</div>
        )}
      </div>
    );
  }

  return (
    <div className="insights-panel">
      <div className="insights-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <BarChart3 size={14} />
        <span className="insights-title">数据洞察</span>
        <span className="insights-count">{activeFile.data.length} 条</span>
      </div>

      {!isCollapsed && (
        <div className="insights-content">
          {/* 字段选择器 */}
          <div className="insights-field-selector">
            <select
              value={effectiveField}
              onChange={(e) => setSelectedField(e.target.value)}
              className="insights-select"
            >
              {availableFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>

          {/* 分布列表 */}
          <div className="insights-list">
            {distribution.length === 0 ? (
              <div className="insights-empty">无数据</div>
            ) : (
              distribution.map((item, index) => {
                const isActive = isValueActive(item.value);
                return (
                  <button
                    key={`${item.value}-${index}`}
                    type="button"
                    className={`insights-row ${isActive ? "insights-row--active" : ""}`}
                    onClick={() => handleStatClick(item.value)}
                    title={isActive ? "已添加到筛选" : `点击筛选: ${effectiveField} = "${item.value}"`}
                  >
                    {/* 背景进度条 */}
                    <div
                      className={`insights-bar ${isActive ? "insights-bar--active" : ""}`}
                      style={{ width: `${(item.count / maxCount) * 100}%` }}
                    />
                    {/* 内容 */}
                    <div className="insights-row-content">
                      <span className={`insights-label ${isActive ? "insights-label--active" : ""}`} title={item.value}>
                        {isActive && <Check size={10} className="insights-check-icon" />}
                        {item.value.length > 24 ? `${item.value.slice(0, 24)}...` : item.value}
                      </span>
                      <div className="insights-stats">
                        <span className={`insights-count-num ${isActive ? "insights-count--active" : ""}`}>
                          {item.count}
                        </span>
                        <span className="insights-percentage">
                          ({item.percentage.toFixed(1)}%)
                        </span>
                        {!isActive && <Filter size={10} className="insights-filter-icon" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Toast 消息 */}
          {toastMessage && (
            <div className="insights-toast">{toastMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}
