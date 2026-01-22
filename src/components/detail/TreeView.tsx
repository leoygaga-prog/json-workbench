import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit3, ChevronRight, ChevronDown } from "lucide-react";

export type TreeValue =
  | Record<string, unknown>
  | unknown[]
  | null
  | string
  | number
  | boolean;

export type TreePath = Array<string | number>;

interface TreeViewProps {
  value: TreeValue;
  readOnly?: boolean;
  selectedFieldKey?: string | null;
  onUpdateValue?: (path: TreePath, rawValue: string) => void;
  onRenameKey?: (path: TreePath, newKey: string) => void;
  onRemoveNode?: (path: TreePath) => void;
  onAddObjectEntry?: (path: TreePath, key: string, rawValue: string) => void;
  onAddArrayItem?: (path: TreePath, rawValue: string) => void;
}

interface EditState {
  path: string;
  type: "key" | "value";
  value: string;
}

interface AddState {
  path: string;
  isObject: boolean;
  key: string;
  value: string;
}

export default function TreeView({
  value,
  readOnly = false,
  selectedFieldKey = null,
  onUpdateValue,
  onRenameKey,
  onRemoveNode,
  onAddObjectEntry,
  onAddArrayItem,
}: TreeViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<EditState | null>(null);
  const [addState, setAddState] = useState<AddState | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [highlightedPathKey, setHighlightedPathKey] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const toggleCollapse = useCallback((pathKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  }, []);

  const startEdit = useCallback((path: TreePath, type: "key" | "value", currentValue: unknown) => {
    setEditState({
      path: pathId(path),
      type,
      value: type === "key" ? String(path[path.length - 1]) : formatValue(currentValue),
    });
  }, []);

  const saveEdit = useCallback((path: TreePath) => {
    if (!editState) return;
    if (editState.type === "key" && onRenameKey) {
      onRenameKey(path, editState.value.trim());
    } else if (editState.type === "value" && onUpdateValue) {
      onUpdateValue(path, editState.value);
    }
    setEditState(null);
  }, [editState, onRenameKey, onUpdateValue]);

  const cancelEdit = useCallback(() => {
    setEditState(null);
  }, []);

  const startAdd = useCallback((path: TreePath, isObject: boolean) => {
    setAddState({
      path: pathId(path),
      isObject,
      key: "",
      value: "",
    });
  }, []);

  const saveAdd = useCallback((path: TreePath) => {
    if (!addState) return;
    if (addState.isObject && onAddObjectEntry) {
      onAddObjectEntry(path, addState.key.trim(), addState.value || '""');
    } else if (!addState.isObject && onAddArrayItem) {
      onAddArrayItem(path, addState.value || '""');
    }
    setAddState(null);
  }, [addState, onAddObjectEntry, onAddArrayItem]);

  const cancelAdd = useCallback(() => {
    setAddState(null);
  }, []);

  useEffect(() => {
    if (!selectedFieldKey) {
      setHighlightedPathKey(null);
      return;
    }
    const matchPath = findPathByKey(value, selectedFieldKey);
    if (!matchPath) {
      setHighlightedPathKey(null);
      return;
    }
    
    const nextPathKey = pathId(matchPath);
    setHighlightedPathKey(nextPathKey);
    setCollapsed((prev) => {
      const next = new Set(prev);
      const ancestors = getAncestorPathKeys(matchPath);
      ancestors.forEach((key) => next.delete(key));
      return next;
    });
  }, [selectedFieldKey, value]);

  useEffect(() => {
    if (!highlightedPathKey || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedPathKey]);

  return (
    <div className="json-tree">
      <JsonNode
        value={value}
        path={[]}
        depth={0}
        keyName={null}
        isLast={true}
        collapsed={collapsed}
        editState={editState}
        addState={addState}
        hoveredPath={hoveredPath}
        highlightedPathKey={highlightedPathKey}
        readOnly={readOnly}
        onToggleCollapse={toggleCollapse}
        onStartEdit={startEdit}
        onEditChange={(val) => setEditState((prev) => prev ? { ...prev, value: val } : null)}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
        onStartAdd={startAdd}
        onAddKeyChange={(val) => setAddState((prev) => prev ? { ...prev, key: val } : null)}
        onAddValueChange={(val) => setAddState((prev) => prev ? { ...prev, value: val } : null)}
        onSaveAdd={saveAdd}
        onCancelAdd={cancelAdd}
        onRemove={onRemoveNode}
        onHover={setHoveredPath}
        highlightRef={highlightRef}
      />
    </div>
  );
}

interface JsonNodeProps {
  value: TreeValue;
  path: TreePath;
  depth: number;
  keyName: string | number | null;
  isLast: boolean;
  collapsed: Set<string>;
  editState: EditState | null;
  addState: AddState | null;
  hoveredPath: string | null;
  highlightedPathKey: string | null;
  readOnly: boolean;
  onToggleCollapse: (pathKey: string) => void;
  onStartEdit: (path: TreePath, type: "key" | "value", currentValue: unknown) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: (path: TreePath) => void;
  onCancelEdit: () => void;
  onStartAdd: (path: TreePath, isObject: boolean) => void;
  onAddKeyChange: (value: string) => void;
  onAddValueChange: (value: string) => void;
  onSaveAdd: (path: TreePath) => void;
  onCancelAdd: () => void;
  onRemove?: (path: TreePath) => void;
  onHover: (pathKey: string | null) => void;
  highlightRef: React.RefObject<HTMLDivElement>;
}

function JsonNode({
  value,
  path,
  depth,
  keyName,
  isLast,
  collapsed,
  editState,
  addState,
  hoveredPath,
  highlightedPathKey,
  readOnly,
  onToggleCollapse,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartAdd,
  onAddKeyChange,
  onAddValueChange,
  onSaveAdd,
  onCancelAdd,
  onRemove,
  onHover,
  highlightRef,
}: JsonNodeProps) {
  const pathKey = pathId(path);
  const isCollapsed = collapsed.has(pathKey);
  const isHovered = hoveredPath === pathKey;
  const isHighlighted = highlightedPathKey === pathKey;
  const isEditingKey = editState?.path === pathKey && editState.type === "key";
  const isEditingValue = editState?.path === pathKey && editState.type === "value";
  const isAddingHere = addState?.path === pathKey;
  const canRename = path.length > 0 && typeof path[path.length - 1] === "string";
  const canRemove = path.length > 0;

  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isContainer = isObject || isArray;

  const handleMouseEnter = () => onHover(pathKey);
  const handleMouseLeave = () => onHover(null);

  // Render key part with breadcrumb style for flattened keys
  const renderKey = () => {
    if (keyName === null) return null;
    
    if (isEditingKey && editState) {
      return (
        <InlineInput
          value={editState.value}
          onChange={onEditChange}
          onSave={() => onSaveEdit(path)}
          onCancel={onCancelEdit}
          className="json-key-input"
        />
      );
    }

    const keyStr = String(keyName);
    const isNumericKey = typeof keyName === "number";
    
    // For numeric keys (array indices), render simply
    if (isNumericKey) {
      return (
        <span
          className={`json-key json-key--index ${canRename && !readOnly ? "editable" : ""}`}
          onClick={() => canRename && !readOnly && onStartEdit(path, "key", keyName)}
        >
          {keyStr}
        </span>
      );
    }

    // Split by dots for breadcrumb rendering
    const parts = keyStr.split(".");
    
    // Single part key - render with primary style
    if (parts.length === 1) {
      return (
        <span
          className={`json-key json-key--leaf ${canRename && !readOnly ? "editable" : ""}`}
          onClick={() => canRename && !readOnly && onStartEdit(path, "key", keyName)}
        >
          {keyStr}
        </span>
      );
    }

    // Multiple parts - render as breadcrumb
    const prefixParts = parts.slice(0, -1);
    const leafPart = parts[parts.length - 1];
    
    // Helper to check if a string is a numeric index
    const isNumericPart = (part: string) => /^\d+$/.test(part);

    return (
      <span
        className={`json-key json-key--breadcrumb ${canRename && !readOnly ? "editable" : ""}`}
        onClick={() => canRename && !readOnly && onStartEdit(path, "key", keyName)}
      >
        {prefixParts.map((part, idx) => (
          <span key={idx} className="json-key-prefix">
            {isNumericPart(part) ? (
              <span className="json-key-index-badge">{part}</span>
            ) : (
              <span className="json-key-prefix-text">{part}</span>
            )}
            <span className="json-key-separator">›</span>
          </span>
        ))}
        {isNumericPart(leafPart) ? (
          <span className="json-key-index-badge json-key-index-badge--leaf">{leafPart}</span>
        ) : (
          <span className="json-key-leaf-text">{leafPart}</span>
        )}
      </span>
    );
  };

  // Render primitive value
  const renderPrimitiveValue = () => {
    if (isEditingValue && editState) {
      return (
        <InlineInput
          value={editState.value}
          onChange={onEditChange}
          onSave={() => onSaveEdit(path)}
          onCancel={onCancelEdit}
          className="json-value-input"
        />
      );
    }

    return (
      <span
        className={`json-value ${getValueClass(value)} ${!readOnly ? "editable" : ""}`}
        onClick={() => !readOnly && onStartEdit(path, "value", value)}
      >
        {formatDisplayValue(value)}
      </span>
    );
  };

  // Render action buttons (only on hover)
  const renderActions = () => {
    if (readOnly || !isHovered || isEditingKey || isEditingValue) return null;

    return (
      <span className="json-actions">
        {isContainer && (
          <button
            type="button"
            className="json-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartAdd(path, isObject);
            }}
            title={isObject ? "添加字段" : "添加元素"}
          >
            <Plus size={12} />
          </button>
        )}
        {!isContainer && (
          <button
            type="button"
            className="json-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit(path, "value", value);
            }}
            title="编辑值"
          >
            <Edit3 size={12} />
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            className="json-action-btn json-action-btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(path);
            }}
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        )}
      </span>
    );
  };

  // Render add form
  const renderAddForm = () => {
    if (!isAddingHere || !addState) return null;

    return (
      <div className="json-add-form" style={{ paddingLeft: (depth + 1) * 16 }}>
        {addState.isObject && (
          <input
            type="text"
            className="json-add-input"
            placeholder="key"
            value={addState.key}
            onChange={(e) => onAddKeyChange(e.target.value)}
            autoFocus
          />
        )}
        {addState.isObject && <span className="json-colon">:</span>}
        <input
          type="text"
          className="json-add-input"
          placeholder="value"
          value={addState.value}
          onChange={(e) => onAddValueChange(e.target.value)}
          autoFocus={!addState.isObject}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveAdd(path);
            if (e.key === "Escape") onCancelAdd();
          }}
        />
        <button type="button" className="json-add-btn" onClick={() => onSaveAdd(path)}>
          确定
        </button>
        <button type="button" className="json-add-btn" onClick={onCancelAdd}>
          取消
        </button>
      </div>
    );
  };

  // Container (Object or Array)
  if (isContainer) {
    const entries = isArray
      ? (value as unknown[]).map((v, i) => [i, v] as const)
      : Object.entries(value as Record<string, unknown>);
    const bracket = isArray ? ["[", "]"] : ["{", "}"];
    const isEmpty = entries.length === 0;

    return (
      <div className="json-node">
        <div
          ref={isHighlighted ? highlightRef : undefined}
          className={`json-line ${isHovered ? "hovered" : ""} ${isHighlighted ? "json-line--highlight" : ""}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span className="json-indent" style={{ width: depth * 16 }}>
            {depth > 0 && <span className="json-guide" />}
          </span>
          <span
            className="json-toggle"
            onClick={() => onToggleCollapse(pathKey)}
          >
            {isEmpty ? (
              <span className="json-toggle-placeholder" />
            ) : isCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </span>
          {renderKey()}
          {keyName !== null && <span className="json-colon">:</span>}
          <span className="json-bracket">{bracket[0]}</span>
          {isCollapsed && !isEmpty && (
            <span className="json-collapsed-hint">
              {isArray ? `${entries.length} items` : `${entries.length} keys`}
            </span>
          )}
          {(isCollapsed || isEmpty) && (
            <span className="json-bracket">{bracket[1]}</span>
          )}
          {(isCollapsed || isEmpty) && !isLast && <span className="json-comma">,</span>}
          {renderActions()}
        </div>

        {!isCollapsed && !isEmpty && (
          <>
            {entries.map(([key, child], index) => (
              <JsonNode
                key={`${pathKey}-${key}`}
                value={child as TreeValue}
                path={[...path, key]}
                depth={depth + 1}
                keyName={key}
                isLast={index === entries.length - 1}
                collapsed={collapsed}
                editState={editState}
                addState={addState}
                hoveredPath={hoveredPath}
                highlightedPathKey={highlightedPathKey}
                readOnly={readOnly}
                onToggleCollapse={onToggleCollapse}
                onStartEdit={onStartEdit}
                onEditChange={onEditChange}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onStartAdd={onStartAdd}
                onAddKeyChange={onAddKeyChange}
                onAddValueChange={onAddValueChange}
                onSaveAdd={onSaveAdd}
                onCancelAdd={onCancelAdd}
                onRemove={onRemove}
                onHover={onHover}
                highlightRef={highlightRef}
              />
            ))}
            {renderAddForm()}
            <div className="json-line">
              <span className="json-indent" style={{ width: depth * 16 }}>
                {depth > 0 && <span className="json-guide" />}
              </span>
              <span className="json-toggle-placeholder" />
              <span className="json-bracket">{bracket[1]}</span>
              {!isLast && <span className="json-comma">,</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // Primitive value
  return (
    <div className="json-node">
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={`json-line ${isHovered ? "hovered" : ""} ${isHighlighted ? "json-line--highlight" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="json-indent" style={{ width: depth * 16 }}>
          {depth > 0 && <span className="json-guide" />}
        </span>
        <span className="json-toggle-placeholder" />
        {renderKey()}
        {keyName !== null && <span className="json-colon">:</span>}
        {renderPrimitiveValue()}
        {!isLast && <span className="json-comma">,</span>}
        {renderActions()}
      </div>
    </div>
  );
}

// Inline input component for editing
interface InlineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
}

function InlineInput({ value, onChange, onSave, onCancel, className }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    onSave();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className={`json-inline-input ${className || ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}

// Helper functions
function pathId(path: TreePath): string {
  return path.length === 0 ? "root" : path.map(String).join(".");
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatDisplayValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function getValueClass(value: unknown): string {
  if (value === null) return "json-null";
  if (typeof value === "string") return "json-string";
  if (typeof value === "number") return "json-number";
  if (typeof value === "boolean") return "json-boolean";
  return "";
}

function findPathByKey(value: TreeValue, targetKey: string): TreePath | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const child = value[i] as TreeValue;
      const childPath = findPathByKey(child, targetKey);
      if (childPath) {
        return [i, ...childPath];
      }
    }
    return null;
  }
  
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries) {
    if (key === targetKey) {
      return [key];
    }
    const childPath = findPathByKey(child as TreeValue, targetKey);
    if (childPath) {
      return [key, ...childPath];
    }
  }
  return null;
}

function getAncestorPathKeys(path: TreePath): string[] {
  const keys: string[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const slice = path.slice(0, i);
    if (slice.length > 0) {
      keys.push(pathId(slice));
    }
  }
  return keys;
}
