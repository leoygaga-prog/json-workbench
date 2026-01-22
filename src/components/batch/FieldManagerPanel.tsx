import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Type, Hash, List, Braces, Search, CheckSquare, Square, CheckCircle2, Replace, ArrowRight, Quote, AlertTriangle } from "lucide-react";
import { useFileStore } from "../../store/fileStore";

type FieldType = "string" | "number" | "array" | "object" | "boolean" | "null" | "json_string" | "unknown";

interface SortableFieldItemProps {
  id: string;
  fieldKey: string;
  fieldType: FieldType;
  isEditing: boolean;
  editValue: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onConfirmEdit: (newKey: string) => void;
  onEditChange: (value: string) => void;
  onDelete: () => void;
  onToggleSelect: (event?: React.MouseEvent) => void;
  onSelectField: () => void;
}

// 根据类型返回对应的图标和颜色
function getTypeIcon(type: FieldType) {
  switch (type) {
    case "string":
      return { icon: Type, color: "#16a34a", label: "String" }; // Green
    case "json_string":
      return { icon: Quote, color: "#059669", label: "JSON String" }; // Darker Green with Quote icon
    case "number":
      return { icon: Hash, color: "#2563eb", label: "Number" }; // Blue
    case "array":
      return { icon: List, color: "#ea580c", label: "Array" }; // Orange
    case "object":
      return { icon: Braces, color: "#7c3aed", label: "Object" }; // Purple
    case "boolean":
      return { icon: Hash, color: "#0891b2", label: "Boolean" }; // Cyan
    case "null":
      return { icon: Type, color: "#94a3b8", label: "Null" }; // Gray
    default:
      return { icon: Type, color: "#64748b", label: "Unknown" }; // Gray
  }
}

// 检测值的类型
function detectType(value: unknown): FieldType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") {
    // 检测是否为 JSON 字符串
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || 
        (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      // 尝试解析以确认
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "object" && parsed !== null) {
          return "json_string";
        }
      } catch {
        // 解析失败，保持为普通字符串
      }
    }
    return "string";
  }
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "unknown";
}

// 检测字段的转换需求类型
function determineFieldConversionType(
  data: any[],
  fieldKey: string
): "parse" | "stringify" | null {
  if (!data || data.length === 0) return null;
  
  // 采样前 5 个非空值
  const samples = data
    .filter((row) => row && row[fieldKey] != null)
    .slice(0, 5);
  
  if (samples.length === 0) return null;
  
  const firstValue = samples[0][fieldKey];
  
  // 如果是对象或数组，需要 stringify
  if (typeof firstValue === "object" && firstValue !== null) {
    return "stringify";
  }
  
  // 如果是字符串，检查是否为 JSON 字符串
  if (typeof firstValue === "string") {
    const trimmed = firstValue.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      // 尝试解析确认
      try {
        const parsed = JSON.parse(firstValue);
        if (typeof parsed === "object" && parsed !== null) {
          return "parse";
        }
      } catch {
        // 解析失败，不是 JSON 字符串
      }
    }
  }
  
  return null;
}

function SortableFieldItem({
  id,
  fieldKey,
  fieldType,
  isEditing,
  editValue,
  isSelectionMode,
  isSelected,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onEditChange,
  onDelete,
  onToggleSelect,
  onSelectField,
}: SortableFieldItemProps) {
  const typeInfo = getTypeIcon(fieldType);
  const TypeIcon = typeInfo.icon;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isSelectionMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onConfirmEdit(editValue);
    } else if (e.key === "Escape") {
      onCancelEdit();
    }
  };

  const handleRowClick = (e: React.MouseEvent) => {
    if (isSelectionMode && !isEditing) {
      onToggleSelect(e);
    } else if (!isSelectionMode && !isEditing) {
      onSelectField();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`field-item ${isDragging ? "dragging" : ""} ${isSelectionMode ? "selection-mode" : ""} ${isSelected ? "selected" : ""}`}
      onClick={handleRowClick}
    >
      {isSelectionMode ? (
        <button
          className="field-checkbox"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e);
          }}
        >
          {isSelected ? (
            <CheckSquare size={16} className="field-checkbox-icon checked" />
          ) : (
            <Square size={16} className="field-checkbox-icon" />
          )}
        </button>
      ) : (
        <button
          className="field-drag-handle"
          {...attributes}
          {...listeners}
          type="button"
        >
          <GripVertical size={14} />
        </button>
      )}

      {isEditing ? (
        <div className="field-edit-row">
          <input
            type="text"
            className="field-edit-input"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button
            className="field-action-btn field-action-btn--confirm"
            type="button"
            onClick={() => onConfirmEdit(editValue)}
            title="确认"
          >
            <Check size={12} />
          </button>
          <button
            className="field-action-btn"
            type="button"
            onClick={onCancelEdit}
            title="取消"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <>
          <span 
            className="field-type-icon" 
            style={{ color: typeInfo.color }}
            title={typeInfo.label}
          >
            <TypeIcon size={12} />
          </span>
          <span className="field-name" onDoubleClick={isSelectionMode ? undefined : onStartEdit}>
            {fieldKey}
          </span>
          {!isSelectionMode && (
            <div className="field-actions">
              <button
                className="field-action-btn"
                type="button"
                onClick={onStartEdit}
                title="重命名"
              >
                <Pencil size={12} />
              </button>
              <button
                className="field-action-btn field-action-btn--danger"
                type="button"
                onClick={onDelete}
                title="删除字段"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FieldManagerPanel() {
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const reorderKeys = useFileStore((state) => state.reorderKeys);
  const batchRenameField = useFileStore((state) => state.batchRenameField);
  const batchDeleteField = useFileStore((state) => state.batchDeleteField);
  const batchDeleteFields = useFileStore((state) => state.batchDeleteFields);
  const batchRenameFields = useFileStore((state) => state.batchRenameFields);
  const batchConvertField: (field: string, mode: "parse" | "stringify") => { success: number; failed: number } =
    useFileStore((state) => state.batchConvertField);
  const setSelectedFieldKey = useFileStore((state) => state.setSelectedFieldKey);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [findStr, setFindStr] = useState("");
  const [replaceStr, setReplaceStr] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [convertResult, setConvertResult] = useState<{ success: number; failed: number } | null>(null);
  
  // 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    type: "single" | "batch";
    fieldName?: string;
    fieldCount?: number;
    fields?: string[];
  }>({ show: false, type: "single" });

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? null,
    [files, activeFileId],
  );

  // 从第一条记录提取字段列表和类型
  const { fieldKeys, fieldTypes } = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0) {
      return { fieldKeys: [], fieldTypes: {} as Record<string, FieldType> };
    }
    const firstRecord = activeFile.data[0];
    if (!firstRecord || typeof firstRecord !== "object" || Array.isArray(firstRecord)) {
      return { fieldKeys: [], fieldTypes: {} as Record<string, FieldType> };
    }
    
    const record = firstRecord as Record<string, unknown>;
    const types: Record<string, FieldType> = {};
    
    // 检测每个字段的类型
    Object.keys(record).forEach((key) => {
      types[key] = detectType(record[key]);
    });
    
    const recordKeys = Object.keys(record);
    
    // 如果有 keyOrder，优先使用并追加新字段
    let keys: string[];
    if (activeFile.keyOrder && activeFile.keyOrder.length > 0) {
      const orderSet = new Set(activeFile.keyOrder);
      const ordered = activeFile.keyOrder.filter((key) => key in record);
      const rest = recordKeys.filter((key) => !orderSet.has(key));
      keys = [...ordered, ...rest];
    } else {
      keys = recordKeys;
    }
    
    return { fieldKeys: keys, fieldTypes: types };
  }, [activeFile]);

  // 根据搜索词过滤字段
  const filteredKeys = useMemo(() => {
    if (!searchQuery.trim()) return fieldKeys;
    const query = searchQuery.toLowerCase();
    return fieldKeys.filter((key) => key.toLowerCase().includes(query));
  }, [fieldKeys, searchQuery]);

  // 检测选中字段的转换需求类型
  const selectedFieldConversionType = useMemo(() => {
    if (!activeFile || selectedFields.size !== 1) return null;
    const selectedField = Array.from(selectedFields)[0];
    if (!selectedField) return null;
    
    // 首先检查字段类型（从第一条记录）
    const fieldType = fieldTypes[selectedField];
    if (fieldType === "json_string") {
      return "parse";
    }
    if (fieldType === "object" || fieldType === "array") {
      return "stringify";
    }
    
    // 如果类型检测不确定，使用采样检测
    return determineFieldConversionType(activeFile.data, selectedField);
  }, [activeFile, selectedFields, fieldTypes]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fieldKeys.indexOf(active.id as string);
      const newIndex = fieldKeys.indexOf(over.id as string);
      const newOrder = arrayMove(fieldKeys, oldIndex, newIndex);
      reorderKeys(newOrder);
    }
  };

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditValue(key);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleConfirmEdit = (oldKey: string, newKey: string) => {
    if (newKey && newKey !== oldKey) {
      batchRenameField(oldKey, newKey);
    }
    setEditingKey(null);
    setEditValue("");
  };

  const handleDelete = (key: string) => {
    setDeleteConfirm({
      show: true,
      type: "single",
      fieldName: key,
    });
  };

  const confirmDelete = () => {
    if (deleteConfirm.type === "single" && deleteConfirm.fieldName) {
      batchDeleteField(deleteConfirm.fieldName);
    } else if (deleteConfirm.type === "batch" && deleteConfirm.fields) {
      batchDeleteFields(deleteConfirm.fields);
      setSelectedFields(new Set());
      setIsSelectionMode(false);
    }
    setDeleteConfirm({ show: false, type: "single" });
  };

  // 选择模式相关函数
  const handleToggleSelectionMode = () => {
    if (isSelectionMode) {
      // 退出选择模式时清空选择
      setSelectedFields(new Set());
      setLastSelectedIndex(null);
    }
    setIsSelectionMode(!isSelectionMode);
  };

  const handleToggleSelect = (key: string, event?: React.MouseEvent) => {
    const currentIndex = filteredKeys.indexOf(key);
    
    // Shift + Click 范围选择
    if (event?.shiftKey && lastSelectedIndex !== null && currentIndex !== -1) {
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      const rangeKeys = filteredKeys.slice(start, end + 1);
      
      setSelectedFields((prev) => {
        const next = new Set(prev);
        rangeKeys.forEach((k) => next.add(k));
        return next;
      });
      // 不更新 lastSelectedIndex，保持起始点
      return;
    }
    
    // 普通点击切换选择
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    
    // 更新最后选择的索引
    setLastSelectedIndex(currentIndex);
  };

  const handleSelectAll = () => {
    if (selectedFields.size === filteredKeys.length) {
      // 全选 -> 取消全选
      setSelectedFields(new Set());
    } else {
      // 全选
      setSelectedFields(new Set(filteredKeys));
    }
  };

  const handleBatchDelete = () => {
    if (selectedFields.size === 0) return;
    
    const fieldsArray = Array.from(selectedFields);
    setDeleteConfirm({
      show: true,
      type: "batch",
      fieldCount: fieldsArray.length,
      fields: fieldsArray,
    });
  };

  // 计算重命名预览
  const renamePreview = useMemo(() => {
    if (!findStr) return [];
    const selectedArray = Array.from(selectedFields);
    return selectedArray
      .filter((field) => field.includes(findStr))
      .map((field) => ({
        oldName: field,
        newName: field.replace(new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), replaceStr),
      }));
  }, [selectedFields, findStr, replaceStr]);

  const handleOpenRenameModal = () => {
    setFindStr("");
    setReplaceStr("");
    setShowRenameModal(true);
  };

  const handleBatchRename = () => {
    if (renamePreview.length === 0) return;
    
    const renameMap: Record<string, string> = {};
    renamePreview.forEach(({ oldName, newName }) => {
      if (oldName !== newName) {
        renameMap[oldName] = newName;
      }
    });
    
    if (Object.keys(renameMap).length === 0) return;
    
    batchRenameFields(renameMap);
    setShowRenameModal(false);
    setSelectedFields(new Set());
    setIsSelectionMode(false);
  };

  const handleConvertField = (mode: "parse" | "stringify") => {
    if (selectedFields.size === 0) return;
    
    // 只对第一个选中的字段进行转换（单字段操作）
    const field = Array.from(selectedFields)[0];
    if (!field) return;
    
    const result = batchConvertField(field, mode);
    setConvertResult(result);
    
    // 3秒后清除结果提示
    setTimeout(() => {
      setConvertResult(null);
    }, 3000);
  };

  if (!activeFile) {
    return (
      <div className="field-manager">
        <div className="field-manager-header">
          <span>字段管理</span>
        </div>
        <div className="field-manager-empty">请先选择文件</div>
      </div>
    );
  }

  return (
    <div className={`field-manager ${isCollapsed ? "collapsed" : ""}`}>
      <div className="field-manager-header-row">
        <button
          className="field-manager-header"
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span>字段管理</span>
          <span className="field-manager-count">{fieldKeys.length} 个字段</span>
        </button>
        {!isCollapsed && (
          <button
            className={`field-manager-mode-btn ${isSelectionMode ? "active" : ""}`}
            type="button"
            onClick={handleToggleSelectionMode}
            title={isSelectionMode ? "退出选择" : "批量管理"}
          >
            <CheckSquare size={14} />
          </button>
        )}
      </div>

      {/* 选择模式工具栏 */}
      {!isCollapsed && isSelectionMode && (
        <div className="field-selection-toolbar">
          <button
            className="field-select-all-btn"
            type="button"
            onClick={handleSelectAll}
          >
            {selectedFields.size === filteredKeys.length && filteredKeys.length > 0 ? (
              <CheckCircle2 size={14} />
            ) : (
              <Square size={14} />
            )}
            <span>全选</span>
          </button>
          <div className="field-selection-info">
            已选 {selectedFields.size} 项
          </div>
          <button
            className="field-batch-rename-btn"
            type="button"
            onClick={handleOpenRenameModal}
            disabled={selectedFields.size === 0}
            title="批量重命名"
          >
            <Replace size={14} />
          </button>
          <button
            className="field-batch-delete-btn"
            type="button"
            onClick={handleBatchDelete}
            disabled={selectedFields.size === 0}
            title="批量删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* 字段转换工具栏 - 仅当选中单个字段且可转换时显示 */}
      {!isCollapsed && 
       isSelectionMode && 
       selectedFields.size === 1 && 
       selectedFieldConversionType !== null && (
        <div className="field-convert-toolbar">
          {selectedFieldConversionType === "parse" && (
            <button
              className="field-convert-btn"
              type="button"
              onClick={() => handleConvertField("parse")}
              title="将 JSON 字符串解析为对象"
            >
              <Braces size={14} className="field-convert-icon parse" />
              <span>转为对象</span>
            </button>
          )}
          {selectedFieldConversionType === "stringify" && (
            <button
              className="field-convert-btn"
              type="button"
              onClick={() => handleConvertField("stringify")}
              title="将对象/数组转换为 JSON 字符串"
            >
              <Quote size={14} className="field-convert-icon stringify" />
              <span>转为字符串</span>
            </button>
          )}
          {convertResult && (
            <div className="field-convert-result">
              {convertResult.success > 0 && (
                <span className="field-convert-success">
                  成功: {convertResult.success}
                </span>
              )}
              {convertResult.failed > 0 && (
                <span className="field-convert-failed">
                  跳过: {convertResult.failed}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div className="field-search-wrapper">
          <Search size={12} className="field-search-icon" />
          <input
            type="text"
            className="field-search-input"
            placeholder="Search keys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          {searchQuery && (
            <button
              className="field-search-clear"
              type="button"
              onClick={() => setSearchQuery("")}
              title="清除搜索"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div className="field-manager-content">
          {fieldKeys.length === 0 ? (
            <div className="field-manager-empty">无字段</div>
          ) : filteredKeys.length === 0 ? (
            <div className="field-manager-empty">无匹配字段</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredKeys}
                strategy={verticalListSortingStrategy}
              >
                <div className="field-list">
                  {filteredKeys.map((key) => (
                    <SortableFieldItem
                      key={key}
                      id={key}
                      fieldKey={key}
                      fieldType={fieldTypes[key] || "unknown"}
                      isEditing={editingKey === key}
                      editValue={editValue}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedFields.has(key)}
                      onStartEdit={() => handleStartEdit(key)}
                      onCancelEdit={handleCancelEdit}
                      onConfirmEdit={(newKey) => handleConfirmEdit(key, newKey)}
                      onEditChange={setEditValue}
                      onDelete={() => handleDelete(key)}
                      onToggleSelect={(e) => handleToggleSelect(key, e)}
                      onSelectField={() => setSelectedFieldKey(key)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {/* 批量重命名模态框 */}
      {showRenameModal && (
        <div className="modal-backdrop" onClick={() => setShowRenameModal(false)}>
          <div className="modal batch-rename-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">批量重命名字段</div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowRenameModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="batch-rename-form">
              <div className="batch-rename-row">
                <label className="batch-rename-label">查找</label>
                <input
                  type="text"
                  className="batch-rename-input"
                  placeholder="输入要查找的字符串..."
                  value={findStr}
                  onChange={(e) => setFindStr(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="batch-rename-row">
                <label className="batch-rename-label">替换为</label>
                <input
                  type="text"
                  className="batch-rename-input"
                  placeholder="输入替换后的字符串（留空则删除）"
                  value={replaceStr}
                  onChange={(e) => setReplaceStr(e.target.value)}
                />
              </div>
            </div>

            <div className="batch-rename-preview-header">
              预览 ({renamePreview.length} 个匹配)
            </div>

            <div className="batch-rename-preview-list">
              {renamePreview.length === 0 ? (
                <div className="batch-rename-empty">
                  {findStr ? "没有匹配的字段" : "请输入要查找的字符串"}
                </div>
              ) : (
                renamePreview.map(({ oldName, newName }) => (
                  <div key={oldName} className="batch-rename-preview-item">
                    <span className="batch-rename-old">{oldName}</span>
                    <ArrowRight size={14} className="batch-rename-arrow" />
                    <span className="batch-rename-new">
                      {newName || <em className="batch-rename-empty-value">(空)</em>}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setShowRenameModal(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                onClick={handleBatchRename}
                disabled={renamePreview.length === 0}
              >
                重命名 ({renamePreview.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm.show && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ show: false, type: "single" })}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-icon">
              <AlertTriangle size={32} />
            </div>
            <div className="delete-confirm-content">
              <h3 className="delete-confirm-title">
                {deleteConfirm.type === "single" ? "删除字段" : "批量删除字段"}
              </h3>
              <p className="delete-confirm-message">
                {deleteConfirm.type === "single" ? (
                  <>
                    确定要删除字段 <strong>"{deleteConfirm.fieldName}"</strong> 吗？
                  </>
                ) : (
                  <>
                    确定要删除 <strong>{deleteConfirm.fieldCount}</strong> 个字段吗？
                  </>
                )}
              </p>
              {deleteConfirm.type === "batch" && deleteConfirm.fields && (
                <div className="delete-confirm-fields">
                  {deleteConfirm.fields.slice(0, 5).map((field) => (
                    <span key={field} className="delete-confirm-field-tag">{field}</span>
                  ))}
                  {deleteConfirm.fields.length > 5 && (
                    <span className="delete-confirm-field-more">
                      +{deleteConfirm.fields.length - 5} 个
                    </span>
                  )}
                </div>
              )}
              <p className="delete-confirm-warning">
                此操作会从所有记录中删除{deleteConfirm.type === "single" ? "该" : "这些"}字段，无法撤销。
              </p>
            </div>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-btn delete-confirm-btn-cancel"
                type="button"
                onClick={() => setDeleteConfirm({ show: false, type: "single" })}
              >
                取消
              </button>
              <button
                className="delete-confirm-btn delete-confirm-btn-confirm"
                type="button"
                onClick={confirmDelete}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
