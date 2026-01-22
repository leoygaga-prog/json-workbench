import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ListFilter, X, Plus, ChevronDown, Scissors } from "lucide-react";
import { useFileStore, FilterRule } from "../../store/fileStore";
import ConfirmDialog from "../ui/ConfirmDialog";

const MAX_SUGGESTIONS = 100;

export default function FilterBar() {
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const searchQuery = useFileStore((state) => state.searchQuery);
  const filterGroups = useFileStore((state) => state.filterGroups);
  const setSearchQuery = useFileStore((state) => state.setSearchQuery);
  const addFilterRule = useFileStore((state) => state.addFilterRule);
  const removeFilterRule = useFileStore((state) => state.removeFilterRule);
  const removeFilterGroup = useFileStore((state) => state.removeFilterGroup);
  const clearAllFilters = useFileStore((state) => state.clearAllFilters);
  const getFilteredData = useFileStore((state) => state.getFilteredData);
  const getAllFilterRules = useFileStore((state) => state.getAllFilterRules);
  const commitFilterToData = useFileStore((state) => state.commitFilterToData);

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState<Omit<FilterRule, "id">>({
    field: "",
    operator: "contains",
    value: "",
  });
  const debounceRef = useRef<number | null>(null);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? null,
    [files, activeFileId]
  );

  const totalRecords = activeFile?.data.length ?? 0;
  const filteredData = getFilteredData();
  const filteredCount = filteredData.length;
  const allRules = getAllFilterRules();
  const isFiltered = searchQuery.trim() !== "" || allRules.length > 0;

  // 获取字段列表
  const fieldKeys = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0) return [];
    const firstRecord = activeFile.data[0];
    if (!firstRecord || typeof firstRecord !== "object" || Array.isArray(firstRecord)) {
      return [];
    }
    return Object.keys(firstRecord as Record<string, unknown>);
  }, [activeFile]);

  // Feature 1: 获取选中字段的唯一值（用于自动建议）
  const uniqueValuesForField = useMemo(() => {
    if (!activeFile || !newRule.field) return [];
    
    const values = new Set<string>();
    
    for (const record of activeFile.data) {
      if (!record || typeof record !== "object") continue;
      const rec = record as Record<string, unknown>;
      const val = rec[newRule.field];
      
      if (val === null || val === undefined) {
        values.add("(Empty)");
      } else if (Array.isArray(val)) {
        val.forEach((item) => {
          if (item !== null && item !== undefined) {
            values.add(String(item));
          }
        });
      } else {
        values.add(String(val));
      }
      
      // 限制数量
      if (values.size >= MAX_SUGGESTIONS) break;
    }
    
    return Array.from(values).sort();
  }, [activeFile, newRule.field]);

  // 同步 store 的搜索值
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // 防抖搜索
  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  };

  const handleAddRule = () => {
    if (!newRule.field) return;
    addFilterRule({
      id: crypto.randomUUID(),
      ...newRule,
    });
    setNewRule({ field: "", operator: "contains", value: "" });
    setIsFilterModalOpen(false);
  };

  const getOperatorLabel = (op: FilterRule["operator"]) => {
    switch (op) {
      case "contains": return "包含";
      case "equals": return "等于";
      case "startsWith": return "开头是";
      case "endsWith": return "结尾是";
      case "notContains": return "不包含";
      case "isEmpty": return "为空";
      case "isNotEmpty": return "不为空";
      default: return op;
    }
  };

  if (!activeFile) return null;

  return (
    <div className="filter-bar">
      {/* Row 1: Search & Filter Button */}
      <div className="filter-bar-row">
        <div className="filter-search-wrapper">
          <Search size={14} className="filter-search-icon" />
          <input
            type="text"
            className="filter-search-input"
            placeholder="快速搜索 (按值匹配)..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {localSearch && (
            <button
              className="filter-search-clear"
              type="button"
              onClick={() => handleSearchChange("")}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className="filter-btn"
          type="button"
          onClick={() => setIsFilterModalOpen(true)}
        >
          <ListFilter size={14} />
          <span>高级筛选</span>
          {allRules.length > 0 && (
            <span className="filter-badge">{allRules.length}</span>
          )}
        </button>
      </div>

      {/* Row 2: Active Filter Groups */}
      {filterGroups.length > 0 && (
        <div className="filter-groups-row">
          {filterGroups.map((group, groupIndex) => (
            <div key={group.id} className="filter-group-wrapper">
              {groupIndex > 0 && (
                <span className="filter-logic-connector and">且</span>
              )}
              <div className="filter-group">
                {group.rules.map((rule, ruleIndex) => (
                  <div key={rule.id} className="filter-chip-wrapper">
                    {ruleIndex > 0 && (
                      <span className="filter-logic-connector or">
                        或
                      </span>
                    )}
                    <div className="filter-chip">
                      <span className="filter-chip-text">
                        {rule.field} {getOperatorLabel(rule.operator)} {rule.value && `"${rule.value}"`}
                      </span>
                      <button
                        className="filter-chip-remove"
                        type="button"
                        onClick={() => removeFilterRule(rule.id)}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                ))}
                {group.rules.length > 1 && (
                  <button
                    className="filter-group-remove"
                    type="button"
                    onClick={() => removeFilterGroup(group.id)}
                    title="移除整组"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            className="filter-clear-all"
            type="button"
            onClick={clearAllFilters}
          >
            清空全部
          </button>
        </div>
      )}

      {/* Row 3: Data Stats */}
      <div className="filter-stats-row">
        <div className="filter-stats">
          显示{" "}
          <span className={isFiltered ? "filter-stats-count--filtered" : ""}>
            {filteredCount}
          </span>
          {" "}条 / 共 {totalRecords} 条
          {isFiltered && filteredCount < totalRecords && (
            <span className="filter-stats-hint"> (已筛选)</span>
          )}
        </div>
        
        {/* Commit Filter Button - 仅当有筛选且数据量不同时显示 */}
        {isFiltered && filteredCount < totalRecords && (
          <button
            className="filter-commit-btn"
            type="button"
            onClick={() => setIsCommitDialogOpen(true)}
            title="仅保留筛选结果，删除其他数据"
          >
            <Scissors size={12} />
            <span>仅保留筛选结果</span>
          </button>
        )}
      </div>

      {/* Commit Confirm Dialog */}
      <ConfirmDialog
        isOpen={isCommitDialogOpen}
        title="确认覆盖数据"
        description={
          <>
            这将永久删除当前未显示的 <strong>{totalRecords - filteredCount}</strong> 条数据，
            仅保留筛选后的 <strong>{filteredCount}</strong> 条。
          </>
        }
        confirmText="确认覆盖"
        cancelText="取消"
        variant="danger"
        undoable={true}
        onConfirm={() => {
          commitFilterToData();
          setIsCommitDialogOpen(false);
        }}
        onCancel={() => setIsCommitDialogOpen(false)}
      />

      {/* Filter Modal */}
      {isFilterModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsFilterModalOpen(false)}>
          <div className="modal filter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <div className="panel-title">添加筛选规则</div>
              <button
                className="button"
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
              >
                关闭
              </button>
            </div>
            
            {/* Logic Explanation */}
            <div className="filter-logic-info">
              <div className="filter-logic-hint">
                <span className="filter-logic-hint-icon">💡</span>
                <span>同字段多值自动用「或」连接，不同字段用「且」连接</span>
              </div>
            </div>
            
            <div className="form-grid">
              <label>
                字段
                <select
                  value={newRule.field}
                  onChange={(e) => setNewRule({ ...newRule, field: e.target.value, value: "" })}
                >
                  <option value="">选择字段</option>
                  {fieldKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                条件
                <select
                  value={newRule.operator}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      operator: e.target.value as FilterRule["operator"],
                    })
                  }
                >
                  <option value="contains">包含</option>
                  <option value="equals">等于</option>
                  <option value="startsWith">开头是</option>
                  <option value="endsWith">结尾是</option>
                  <option value="notContains">不包含</option>
                  <option value="isEmpty">为空</option>
                  <option value="isNotEmpty">不为空</option>
                </select>
              </label>
              {newRule.operator !== "isEmpty" && newRule.operator !== "isNotEmpty" && (
                <label>
                  值
                  <div className="filter-value-input-wrapper">
                    <input
                      type="text"
                      list="filter-value-suggestions"
                      value={newRule.value}
                      onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                      placeholder={newRule.field ? "输入或选择值..." : "请先选择字段"}
                      disabled={!newRule.field}
                    />
                    {newRule.field && uniqueValuesForField.length > 0 && (
                      <ChevronDown size={14} className="filter-value-dropdown-icon" />
                    )}
                    <datalist id="filter-value-suggestions">
                      {uniqueValuesForField.map((val, idx) => (
                        <option key={`${val}-${idx}`} value={val === "(Empty)" ? "" : val}>
                          {val}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  {newRule.field && uniqueValuesForField.length > 0 && (
                    <span className="filter-value-hint">
                      {uniqueValuesForField.length} 个可选值
                    </span>
                  )}
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                onClick={handleAddRule}
                disabled={!newRule.field}
              >
                <Plus size={14} />
                添加规则
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
