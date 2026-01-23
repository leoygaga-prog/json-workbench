import { useEffect, useMemo, useRef, useState } from "react";
import JSONbig from "json-bigint";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Decoration, DecorationSet } from "@codemirror/view";
import { Copy, Check, FileEdit, Code2, Network, Minimize2, Maximize2, Lock, Unlock } from "lucide-react";
import { useFileStore } from "../../store/fileStore";
import TreeView, { TreePath } from "./TreeView";
import {
  addArrayItemAtPath,
  addObjectEntryAtPath,
  removeAtPath,
  renameKeyAtPath,
  setAtPath,
} from "../../utils/objectPath";

export default function DetailPanel() {
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const currentIndex = useFileStore((state) => state.currentIndex);
  const readOnly = useFileStore((state) => state.readOnly);
  const viewMode = useFileStore((state) => state.viewMode);
  const setIndex = useFileStore((state) => state.setIndex);
  const updateRecord = useFileStore((state) => state.updateRecord);
  const toggleReadOnly = useFileStore((state) => state.toggleReadOnly);
  const setViewMode = useFileStore((state) => state.setViewMode);
  const getFilteredData = useFileStore((state) => state.getFilteredData);
  const getOriginalIndex = useFileStore((state) => state.getOriginalIndex);
  const isFilteredFn = useFileStore((state) => state.isFiltered);
  const selectedFieldKey = useFileStore((state) => state.selectedFieldKey);
  const [editorValue, setEditorValue] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  // 显示范围：single = 当前单条记录，all = 全部数据
  const [displayScope, setDisplayScope] = useState<"single" | "all">("single");
  // 复制状态：记录刚被复制的行索引
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const codeMirrorRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? null,
    [files, activeFileId],
  );
  
  // 获取过滤后的数据
  const filteredData = getFilteredData();
  const isFiltered = isFilteredFn();
  const totalRecords = activeFile?.data.length ?? 0;
  const displayData = filteredData;
  const recordCount = displayData.length;
  const currentRecord = displayData[currentIndex] ?? null;
  const allData = displayData;
  const jsonParser = useMemo(() => JSONbig({ storeAsString: true }), []);
  
  // 编辑器是否只读：全局只读 或 全部数据模式
  const isEditorReadOnly = readOnly || displayScope === "all";

  // 切换文件时重置为单条记录模式
  useEffect(() => {
    setDisplayScope("single");
  }, [activeFileId]);

  // 当切换记录、视图模式或显示范围时，同步更新编辑器内容
  useEffect(() => {
    // 如果当前是树形视图，不更新编辑器内容（避免干扰）
    if (viewMode !== "source") {
      return;
    }
    
    if (displayScope === "all") {
      // 全部数据模式：显示压缩的全部数据
      const nextValue = JSON.stringify(allData);
      setEditorValue(nextValue);
      setParseError(null);
    } else {
      // 单条记录模式
      if (!currentRecord) {
        setEditorValue("");
        setParseError(null);
        return;
      }
      const nextValue = JSON.stringify(currentRecord, null, 2);
      setEditorValue(nextValue);
      setParseError(null);
    }
    // 当切换记录、视图模式或显示范围时更新
  }, [currentIndex, viewMode, displayScope, currentRecord, allData]);

  const flashMessage = (message: string) => {
    setActionMessage(message);
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => {
      setActionMessage(null);
    }, 2000);
  };

  const handleCopyLine = async (record: unknown, idx: number, e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发行点击
    try {
      await navigator.clipboard.writeText(JSON.stringify(record));
      setCopiedIndex(idx);
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedIndex(null);
      }, 1500);
    } catch {
      flashMessage("复制失败");
    }
  };

  const commitEditorValue = (value: string) => {
    try {
      const parsed = jsonParser.parse(value);
      // 使用原始索引更新
      const originalIdx = getOriginalIndex(currentIndex);
      updateRecord(originalIdx, parsed);
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "JSON 解析失败");
    }
  };

  const handleEditorChange = (value?: string) => {
    const nextValue = value ?? "";
    setEditorValue(nextValue);
    // 只读模式或全部数据模式不允许编辑
    if (isEditorReadOnly) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      commitEditorValue(nextValue);
    }, 400);
  };

  const handleFormat = () => {
    // 格式化：切换到单条记录视图，格式化显示
    if (viewMode !== "source") {
      setViewMode("source");
    }
    setDisplayScope("single");
    flashMessage("单条记录视图");
  };

  const handleMinify = () => {
    // 压缩：切换到全部数据视图，压缩显示（只读）
    if (viewMode !== "source") {
      setViewMode("source");
    }
    setDisplayScope("all");
    flashMessage("全部数据视图（只读）");
  };

  const handleValidate = () => {
    try {
      if (viewMode !== "source") {
        setViewMode("source");
      }
      jsonParser.parse(editorValue);
      setParseError(null);
      flashMessage("校验通过");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "JSON 解析失败");
    }
  };

  // 自定义语法高亮样式（匹配 Monaco 主题）
  const jsonHighlightStyle = HighlightStyle.define([
    { tag: t.propertyName, color: "#7e22ce", fontWeight: "bold" }, // 键名：紫色，粗体
    { tag: t.string, color: "#047857" }, // 字符串值：绿色
    { tag: t.number, color: "#b45309" }, // 数字：橙色
    { tag: [t.keyword, t.null, t.bool], color: "#1d4ed8", fontWeight: "bold" }, // 关键字/null/布尔：蓝色，粗体
    { tag: t.punctuation, color: "#94a3b8" }, // 标点符号：灰色
    { tag: [t.bracket, t.squareBracket, t.paren], color: "#64748b" }, // 括号：深灰色
    { tag: t.operator, color: "#94a3b8" }, // 操作符：灰色
  ]);

  // 字段高亮效果（整行高亮，仿照树形视图）
  const highlightFieldEffect = StateEffect.define<number | null>();
  const highlightField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      decorations = decorations.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(highlightFieldEffect)) {
          if (effect.value === null) {
            decorations = Decoration.none;
          } else {
            const line = tr.state.doc.lineAt(effect.value);
            decorations = Decoration.none.update({
              add: [
                Decoration.line({
                  class: "json-field-highlight-line",
                }).range(line.from),
              ],
            });
          }
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // CodeMirror 扩展配置
  const editorExtensions = useMemo(() => {
    return [
      json(),
      syntaxHighlighting(jsonHighlightStyle),
      highlightField,
      EditorState.tabSize.of(2), // 缩进：2 个空格
      EditorView.updateListener.of((update) => {
        if (update.view) {
          editorViewRef.current = update.view;
        }
      }),
      EditorView.theme({
        "&": {
          fontSize: "13px",
          fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
          backgroundColor: "#ffffff",
          color: "#1e293b",
        },
        ".cm-content": {
          padding: "0",
          fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
          fontFeatureSettings: '"liga" 1, "calt" 1',
          fontVariantLigatures: "common-ligatures",
          caretColor: "#1e293b",
          lineHeight: "1.5",
        },
        ".cm-focused": {
          outline: "none",
        },
        ".cm-editor": {
          height: "auto",
          backgroundColor: "#ffffff",
        },
        ".cm-scroller": {
          overflow: "visible",
        },
        ".cm-line": {
          backgroundColor: "transparent",
          padding: "0",
          lineHeight: "1.5",
        },
        ".cm-line.cm-activeLine": {
          backgroundColor: "#f8fafc",
        },
        ".cm-selectionBackground": {
          backgroundColor: "#dbeafe",
        },
        ".cm-selectionMatch": {
          backgroundColor: "#e2e8f0",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "#dbeafe",
        },
        "&.cm-focused .cm-selectionMatch": {
          backgroundColor: "#e2e8f0",
        },
        ".cm-cursor": {
          borderLeftColor: "#1e293b",
          borderLeftWidth: "2px",
          marginLeft: "-1px",
        },
        "&.cm-focused .cm-cursor": {
          borderLeftColor: "#1e293b",
        },
        ".cm-gutters": {
          backgroundColor: "transparent",
          border: "none",
          display: "none",
        },
        ".cm-lineNumbers": {
          color: "#94a3b8",
        },
        ".json-field-highlight-line": {
          backgroundColor: "rgba(59, 130, 246, 0.12)",
          transition: "background-color 0.6s ease-out",
        },
      }),
      EditorView.editable.of(!isEditorReadOnly),
      EditorView.lineWrapping,
    ];
  }, [isEditorReadOnly]);

  // 字段高亮和跳转效果（仿照树形视图的蓝色高亮）
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    if (viewMode !== "source") return;
    if (!selectedFieldKey) {
      // 清除高亮
      view.dispatch({
        effects: highlightFieldEffect.of(null),
      });
      return;
    }

    const searchText = `"${selectedFieldKey}":`;
    const doc = view.state.doc;
    const text = doc.toString();
    const index = text.indexOf(searchText);

    if (index === -1) return;

    // 获取字段所在的行号
    const line = doc.lineAt(index);
    const lineStart = line.from;

    // 滚动到目标位置并高亮整行
    view.dispatch({
      effects: [
        EditorView.scrollIntoView(lineStart, { y: "center" }),
        highlightFieldEffect.of(lineStart),
      ],
    });

    // 1.5秒后清除高亮
    const timer = setTimeout(() => {
      if (editorViewRef.current) {
        editorViewRef.current.dispatch({
          effects: highlightFieldEffect.of(null),
        });
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [selectedFieldKey, viewMode, editorValue]);

  const handleTreeValueUpdate = (path: TreePath, rawValue: string) => {
    if (!currentRecord) return;
    const parsed = parseLooseValue(jsonParser, rawValue);
    const updated = setAtPath(currentRecord, path, parsed);
    const originalIdx = getOriginalIndex(currentIndex);
    updateRecord(originalIdx, updated);
  };

  const handleTreeKeyRename = (path: TreePath, newKey: string) => {
    if (!currentRecord || !newKey) return;
    const updated = renameKeyAtPath(currentRecord, path, newKey);
    const originalIdx = getOriginalIndex(currentIndex);
    updateRecord(originalIdx, updated);
  };

  const handleTreeRemove = (path: TreePath) => {
    if (!currentRecord) return;
    const updated = removeAtPath(currentRecord, path);
    const originalIdx = getOriginalIndex(currentIndex);
    updateRecord(originalIdx, updated);
  };

  const handleTreeAddObjectEntry = (
    path: TreePath,
    key: string,
    rawValue: string,
  ) => {
    if (!currentRecord || !key) return;
    const parsed = parseLooseValue(jsonParser, rawValue);
    const updated = addObjectEntryAtPath(currentRecord, path, key, parsed);
    const originalIdx = getOriginalIndex(currentIndex);
    updateRecord(originalIdx, updated);
  };

  const handleTreeAddArrayItem = (path: TreePath, rawValue: string) => {
    if (!currentRecord) return;
    const parsed = parseLooseValue(jsonParser, rawValue);
    const updated = addArrayItemAtPath(currentRecord, path, parsed);
    const originalIdx = getOriginalIndex(currentIndex);
    updateRecord(originalIdx, updated);
  };

  return (
    <div className="panel">
      <div className="panel-header panel-header-modern panel-header-emerald">
        <div className="panel-header-left">
          <div className="panel-header-icon-box panel-header-icon-box-emerald">
            <FileEdit size={20} className="panel-header-icon panel-header-icon-emerald" />
          </div>
          <div className="panel-header-text">
            <h2 className="panel-title-modern">详情编辑</h2>
            <span className="panel-subtitle-modern">
              {displayScope === "single" ? "单条记录" : "全部数据（只读预览）"}
            </span>
          </div>
        </div>
        <button
          className={`lock-toggle-btn ${readOnly ? "lock-toggle-btn-locked" : "lock-toggle-btn-unlocked"}`}
          type="button"
          onClick={toggleReadOnly}
          title={readOnly ? "点击解锁 (Click to Edit)" : "点击锁定 (Click to Read-Only)"}
        >
          {readOnly ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </div>

      <div className="editor-toolbar">
        {/* LEFT: View Mode Switcher */}
        <div className={`view-mode-switcher ${displayScope === "all" ? "view-mode-switcher-disabled" : ""}`}>
          <button
            className={`view-mode-btn ${viewMode === "source" ? "view-mode-btn-active" : ""}`}
            type="button"
            onClick={() => setViewMode("source")}
            disabled={readOnly}
          >
            <Code2 size={14} />
            <span>源码</span>
          </button>
          <button
            className={`view-mode-btn ${viewMode === "tree" ? "view-mode-btn-active" : ""}`}
            type="button"
            onClick={() => {
              setViewMode("tree");
              if (displayScope === "all") {
                setDisplayScope("single");
              }
            }}
            disabled={readOnly || displayScope === "all"}
          >
            <Network size={14} />
            <span>树形</span>
          </button>
        </div>

        {/* RIGHT: Format Actions */}
        <div className="format-actions">
          <button
            className="format-action-btn"
            type="button"
            onClick={displayScope === "single" ? handleMinify : handleFormat}
          >
            {displayScope === "single" ? (
              <>
                <Minimize2 size={14} />
                <span>压缩</span>
              </>
            ) : (
              <>
                <Maximize2 size={14} />
                <span>展开</span>
              </>
            )}
          </button>
          <button className="format-action-btn" type="button" onClick={handleValidate}>
            校验
          </button>
        </div>
        <div className="toolbar-status">
          {recordCount === 0 ? (
            isFiltered ? (
              <span className="status-no-match">无匹配记录</span>
            ) : (
              "无记录"
            )
          ) : isFiltered ? (
            <span className="status-filtered">
              筛选结果：{currentIndex + 1} / {recordCount}
              <span className="status-total">（共 {totalRecords} 条）</span>
            </span>
          ) : (
            `第 ${currentIndex + 1} 条 / 共 ${recordCount} 条`
          )}
          <div className="button-row">
            <button
              className="button"
              type="button"
              onClick={() => setIndex(currentIndex - 1)}
              disabled={currentIndex <= 0}
            >
              上一条
            </button>
            <button
              className="button"
              type="button"
              onClick={() => setIndex(currentIndex + 1)}
              disabled={currentIndex >= recordCount - 1}
            >
              下一条
            </button>
          </div>
        </div>
      </div>

      {/* 空状态：无匹配记录 */}
      {recordCount === 0 && isFiltered ? (
        <div className="editor-shell editor-shell--empty">
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">没有匹配的记录</div>
            <div className="empty-state-hint">请尝试调整筛选条件</div>
          </div>
        </div>
      ) : displayScope === "all" ? (
        // 压缩模式：每行一条数据，点击可选中
        <div className="editor-shell editor-shell--lines">
          <div className="all-data-badge">
            📋 点击任意行可跳转到对应记录
            {isFiltered && <span className="all-data-badge-filtered">（已筛选）</span>}
          </div>
          <div className="jsonl-list">
            {allData.map((record, idx) => (
              <div
                key={idx}
                className={`jsonl-line ${idx === currentIndex ? "active" : ""} ${copiedIndex === idx ? "copied" : ""}`}
                onClick={() => {
                  setIndex(idx);
                  setDisplayScope("single");
                  flashMessage(`已跳转到第 ${idx + 1} 条`);
                }}
              >
                <span className="jsonl-line-number">{idx + 1}</span>
                <span className="jsonl-line-content">
                  {JSON.stringify(record)}
                </span>
                <button
                  className="jsonl-copy-btn"
                  type="button"
                  onClick={(e) => handleCopyLine(record, idx, e)}
                  title="复制此行"
                >
                  {copiedIndex === idx ? (
                    <Check size={12} className="jsonl-copy-icon--success" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : viewMode === "source" ? (
        <div className="editor-shell editor-shell--monaco" ref={codeMirrorRef}>
          <CodeMirror
            value={editorValue}
            onChange={(value) => handleEditorChange(value)}
            extensions={editorExtensions}
            editable={!isEditorReadOnly}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              dropCursor: false,
              allowMultipleSelections: false,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: false,
              highlightSelectionMatches: false,
              tabSize: 2,
            }}
          />
        </div>
      ) : (
        <div className="editor-shell editor-shell--tree">
          {currentRecord ? (
          <TreeView
            value={currentRecord as Record<string, unknown>}
            readOnly={readOnly}
            selectedFieldKey={selectedFieldKey}
            onUpdateValue={handleTreeValueUpdate}
            onRenameKey={handleTreeKeyRename}
            onRemoveNode={handleTreeRemove}
            onAddObjectEntry={handleTreeAddObjectEntry}
            onAddArrayItem={handleTreeAddArrayItem}
          />
          ) : (
            "未选中记录。"
          )}
        </div>
      )}

      {actionMessage && <div className="card">{actionMessage}</div>}
      {parseError && <div className="card">JSON 错误：{parseError}</div>}
    </div>
  );
}

function parseLooseValue(
  parser: ReturnType<typeof JSONbig>,
  rawValue: string,
): unknown {
  try {
    return parser.parse(rawValue);
  } catch {
    return rawValue;
  }
}

