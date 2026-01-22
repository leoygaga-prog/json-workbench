import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  AlignJustify,
  ArrowLeftRight,
  Binary,
  Braces,
  BoxSelect,
  Check,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Filter,
  Layers,
  Link,
  PencilLine,
  PlusSquare,
  Redo2,
  Replace,
  ShieldCheck,
  Trash2,
  Undo2,
  Unlink,
  Users,
  X,
  Settings,
} from "lucide-react";
import { useFileStore } from "../../store/fileStore";
import { cacheFile, enforceCacheLimit } from "../../utils/indexedDb";
import { DataWorkerClient } from "../../utils/workerClient";
import { buildSchemaTree, normalizeSamples } from "../../utils/schemaUtils";
import type { BatchAction } from "../../workers/dataWorker";
import SortableKeyItem from "./SortableKeyItem";
import FieldManagerPanel from "./FieldManagerPanel";
import FilterBar from "./FilterBar";
import RenameDialog from "../ui/RenameDialog";
import NestFieldsModal from "./NestFieldsModal";
import SmartExtractModal from "./SmartExtractModal";
import type { DrillArrayMode, DrillPathConfig } from "./DrillDownBrowser";

type ActionKind =
  | "addField"
  | "deleteField"
  | "renameField"
  | "updateValue"
  | "typeConvert"
  | "smartExtract"
  | "nestFields"
  | "flattenStrip"
  | "keyReorder"
  | "escapeString"
  | "unescapeString"
  | "parseJSON";

export default function BatchPanel() {
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const selectedFileIds = useFileStore((state) => state.selectedFileIds);
  const replaceActiveFileData = useFileStore((state) => state.replaceActiveFileData);
  const replaceFileData = useFileStore((state) => state.replaceFileData);
  const setActiveFileKeyOrder = useFileStore((state) => state.setActiveFileKeyOrder);
  const extractByPath = useFileStore((state) => state.extractByPath);
  const undo = useFileStore((state) => state.undo);
  const redo = useFileStore((state) => state.redo);
  const canUndo = useFileStore((state) => state.canUndo);
  const canRedo = useFileStore((state) => state.canRedo);
  
  // 要处理的文件：如果有多选，使用多选；否则使用当前激活的文件
  const targetFileIds = selectedFileIds.length > 0 ? selectedFileIds : (activeFileId ? [activeFileId] : []);
  const isBatchMode = selectedFileIds.length > 1;
  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportStage, setExportStage] = useState<string>("");
  const [showStatus, setShowStatus] = useState(true);
  const [exportDropdownOpen, setExportDropdownOpen] = useState<"json" | "jsonl" | "excel" | null>(null);
  const [formatCleanDropdownOpen, setFormatCleanDropdownOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDialogConfig, setRenameDialogConfig] = useState<{
    type: "json" | "jsonl" | "excel";
    defaultName: string;
  } | null>(null);

  const [addKey, setAddKey] = useState("");
  const [addMode, setAddMode] = useState<"static" | "copy">("static");
  const [addValue, setAddValue] = useState("");
  const [addFromKey, setAddFromKey] = useState("");

  const [deleteKeys, setDeleteKeys] = useState<string[]>([]);

  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");

  const [updateKey, setUpdateKey] = useState("");
  const [updateMode, setUpdateMode] = useState<"set" | "prefixSuffix">("set");
  const [updateValue, setUpdateValue] = useState("");
  const [updatePrefix, setUpdatePrefix] = useState("");
  const [updateSuffix, setUpdateSuffix] = useState("");

  const [typeKey, setTypeKey] = useState("");
  const [typeTarget, setTypeTarget] = useState<"string" | "number" | "boolean">(
    "string",
  );

  const [smartExtractSourceField, setSmartExtractSourceField] = useState("");
  const [drillConfig, setDrillConfig] = useState<DrillPathConfig>({
    path: [],
    arrayMode: "none" as DrillArrayMode,
    filterKey: "",
    filterValue: "",
    targetKey: "",
    outputField: "",
  });

  const [nestTargetField, setNestTargetField] = useState("");
  const [nestSelectedFields, setNestSelectedFields] = useState<string[]>([]);

  const [flattenDepth, setFlattenDepth] = useState<number>(0); // 0 = 全部扁平化
  const [useSmartEAV, setUseSmartEAV] = useState(false); // 智能转换 name/value 结构
  const [keepPrefix, setKeepPrefix] = useState(true); // 是否保留前缀
  const [flattenMode, setFlattenMode] = useState<"all" | "selected">("all"); // 扁平化模式
  const [flattenSelectedFields, setFlattenSelectedFields] = useState<string[]>([]); // 选中的字段
  const [orderText, setOrderText] = useState("");
  const [escapeKey, setEscapeKey] = useState("");
  const [orderItems, setOrderItems] = useState<string[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [escapeSelectedFields, setEscapeSelectedFields] = useState<string[]>([]); // 转义选中的字段
  const [unescapeSelectedFields, setUnescapeSelectedFields] = useState<string[]>([]); // 去转义选中的字段
  const [parseJSONSelectedFields, setParseJSONSelectedFields] = useState<string[]>([]); // 解析JSON选中的字段

  const workerRef = useRef<DataWorkerClient | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? null,
    [files, activeFileId],
  );

  const sampleKeys = useMemo(() => {
    if (!activeFile) return [];
    const keys = new Set<string>();
    activeFile.data.slice(0, 100).forEach((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      Object.keys(row as Record<string, unknown>).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [activeFile]);

  const drillSchema = useMemo(() => {
    if (!activeFile || !smartExtractSourceField) return null;
    const samples = normalizeSamples(activeFile.data).map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
      return getValueAtPath(row as Record<string, unknown>, smartExtractSourceField);
    });
    return buildSchemaTree(samples);
  }, [activeFile, smartExtractSourceField]);

  const nestAvailableFields = useMemo(() => {
    const trimmedTarget = nestTargetField.trim();
    return sampleKeys.filter((key) => key !== trimmedTarget);
  }, [sampleKeys, nestTargetField]);

  // 检测可以"去转义"的字段（字符串类型且包含转义序列如 \" \n \t 等）
  const unescapeCandidateFields = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0) return [];
    const sample = activeFile.data.slice(0, 100);
    const candidates: { key: string; preview: string }[] = [];
    const seen = new Set<string>();
    
    // 检测转义序列的正则表达式
    const escapePattern = /\\[nrt"'\\]/;
    
    sample.forEach((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const record = row as Record<string, unknown>;
      
      Object.entries(record).forEach(([key, value]) => {
        if (seen.has(key)) return;
        if (typeof value === "string") {
          // 检查是否包含转义序列
          if (escapePattern.test(value)) {
            candidates.push({
              key,
              preview: value.length > 40 ? value.slice(0, 40) + "..." : value,
            });
            seen.add(key);
          }
        }
      });
    });
    
    return candidates;
  }, [activeFile]);

  // 检测可以"转义"的字段（字符串包含特殊字符，或对象/数组需要序列化）
  const escapeCandidateFields = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0) return [];
    const sample = activeFile.data.slice(0, 100);
    const candidates: { key: string; type: "string" | "object"; preview: string }[] = [];
    const seen = new Set<string>();
    
    // 需要转义的特殊字符
    const specialCharPattern = /["\n\r\t\\]/;
    
    sample.forEach((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const record = row as Record<string, unknown>;
      
      Object.entries(record).forEach(([key, value]) => {
        if (seen.has(key)) return;
        
        if (typeof value === "string") {
          // 字符串：检查是否包含需要转义的特殊字符
          if (specialCharPattern.test(value)) {
            candidates.push({
              key,
              type: "string",
              preview: value.length > 30 ? value.slice(0, 30) + "..." : value,
            });
            seen.add(key);
          }
        } else if (value !== null && typeof value === "object") {
          // 对象/数组：需要序列化
          candidates.push({
            key,
            type: "object",
            preview: Array.isArray(value) ? `[数组 ${value.length} 项]` : `{对象}`,
          });
          seen.add(key);
        }
      });
    });
    
    return candidates;
  }, [activeFile]);

  // 检测可以"解析JSON"的字段（字符串类型且看起来像 JSON）
  const parseJSONCandidateFields = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0) return [];
    const sample = activeFile.data.slice(0, 100);
    const candidates: { key: string; preview: string }[] = [];
    const seen = new Set<string>();
    
    sample.forEach((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const record = row as Record<string, unknown>;
      
      Object.entries(record).forEach(([key, value]) => {
        if (seen.has(key)) return;
        if (typeof value === "string") {
          const trimmed = value.trim();
          // 检查是否以 { 或 [ 开头和结尾，可能是 JSON
          if (
            (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"))
          ) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed !== null && typeof parsed === "object") {
                candidates.push({
                  key,
                  preview: trimmed.length > 30 ? trimmed.slice(0, 30) + "..." : trimmed,
                });
                seen.add(key);
              }
            } catch {
              // 解析失败，不添加
            }
          }
        }
      });
    });
    
    return candidates;
  }, [activeFile]);

  const availableKeys = useMemo(() => {
    const lower = orderSearch.trim().toLowerCase();
    return sampleKeys
      .filter((key) => !orderItems.includes(key))
      .filter((key) => (lower ? key.toLowerCase().includes(lower) : true));
  }, [sampleKeys, orderItems, orderSearch]);

  // 检测选中字段的当前类型（用于类型转换功能）
  const detectedFieldType = useMemo(() => {
    if (!activeFile || activeFile.data.length === 0 || !typeKey) {
      return { type: "unknown" as const, label: "未知", color: "#94a3b8" };
    }
    
    const sample = activeFile.data[0];
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      return { type: "unknown" as const, label: "未知", color: "#94a3b8" };
    }
    
    const value = (sample as Record<string, unknown>)[typeKey];
    
    if (value === null || value === undefined) {
      return { type: "null" as const, label: "空值", color: "#94a3b8" };
    }
    
    const jsType = typeof value;
    
    switch (jsType) {
      case "string":
        return { type: "string" as const, label: "字符串", color: "#f59e0b" };
      case "number":
        return { type: "number" as const, label: "数字", color: "#10b981" };
      case "boolean":
        return { type: "boolean" as const, label: "布尔", color: "#8b5cf6" };
      case "object":
        return { 
          type: "object" as const, 
          label: Array.isArray(value) ? "数组" : "对象", 
          color: "#3b82f6" 
        };
      default:
        return { type: "unknown" as const, label: "未知", color: "#94a3b8" };
    }
  }, [activeFile, typeKey]);

  // 动态生成可用的目标类型选项
  const availableTypeTargets = useMemo(() => {
    const allOptions = [
      { value: "string" as const, label: "字符串", icon: "abc" },
      { value: "number" as const, label: "数字", icon: "123" },
      { value: "boolean" as const, label: "布尔", icon: "✓/✗" },
    ];
    
    // 如果当前类型是基础类型，排除它
    if (detectedFieldType.type === "string" || 
        detectedFieldType.type === "number" || 
        detectedFieldType.type === "boolean") {
      return allOptions.filter(opt => opt.value !== detectedFieldType.type);
    }
    
    // 对于复杂类型或未知类型，显示所有选项
    return allOptions;
  }, [detectedFieldType.type]);

  useEffect(() => {
    if (!activeFile) {
      setOrderItems([]);
      return;
    }
    if (activeFile.keyOrder && activeFile.keyOrder.length > 0) {
      // 过滤掉不在 sampleKeys 中的旧字段，保持现有顺序
      const validOrderItems = activeFile.keyOrder.filter((key) => sampleKeys.includes(key));
      setOrderItems(validOrderItems);
    } else {
      setOrderItems(sampleKeys);
    }
  }, [activeFile, sampleKeys]);

  useEffect(() => {
    if (!smartExtractSourceField) {
      setDrillConfig({
        path: [],
        arrayMode: "none",
        filterKey: "",
        filterValue: "",
        targetKey: "",
        outputField: "",
      });
      return;
    }
    setDrillConfig({
      path: [],
      arrayMode: "none",
      filterKey: "",
      filterValue: "",
      targetKey: "",
      outputField: "",
    });
  }, [smartExtractSourceField]);

  useEffect(() => {
    setDrillConfig((prev) => {
      if (prev.outputField.trim()) return prev;
      if (prev.filterValue.trim()) {
        return { ...prev, outputField: prev.filterValue.trim() };
      }
      if (prev.targetKey.trim()) {
        return { ...prev, outputField: prev.targetKey.trim() };
      }
      if (prev.arrayMode === "whole" && prev.path.length > 0) {
        return { ...prev, outputField: prev.path[prev.path.length - 1] };
      }
      return prev;
    });
  }, [drillConfig.filterValue, drillConfig.targetKey, drillConfig.arrayMode, drillConfig.path]);

  // 当打开去转义 modal 时，自动选中所有检测到的字段
  useEffect(() => {
    if (activeAction === "unescapeString") {
      const detectedKeys = unescapeCandidateFields.map((item) => item.key);
      setUnescapeSelectedFields(detectedKeys);
    } else {
      setUnescapeSelectedFields([]);
    }
  }, [activeAction, unescapeCandidateFields]);

  // 当打开转义 modal 时，自动选中所有检测到的字段
  useEffect(() => {
    if (activeAction === "escapeString") {
      const detectedKeys = escapeCandidateFields.map((item) => item.key);
      setEscapeSelectedFields(detectedKeys);
    } else {
      setEscapeSelectedFields([]);
    }
  }, [activeAction, escapeCandidateFields]);

  // 当打开解析JSON modal 时，自动选中所有检测到的字段
  useEffect(() => {
    if (activeAction === "parseJSON") {
      const detectedKeys = parseJSONCandidateFields.map((item) => item.key);
      setParseJSONSelectedFields(detectedKeys);
    } else {
      setParseJSONSelectedFields([]);
    }
  }, [activeAction, parseJSONCandidateFields]);

  // 当类型转换字段改变时，自动选择第一个有效的目标类型
  useEffect(() => {
    if (availableTypeTargets.length > 0) {
      // 如果当前选中的目标类型不在可用列表中，自动选择第一个
      const isCurrentTargetValid = availableTypeTargets.some(opt => opt.value === typeTarget);
      if (!isCurrentTargetValid) {
        setTypeTarget(availableTypeTargets[0].value);
      }
    }
  }, [typeKey, availableTypeTargets, typeTarget]);

  // 键盘快捷键：Ctrl+Z 撤回，Ctrl+Shift+Z / Ctrl+Y 重做
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(".export-dropdown-wrapper") &&
        !target.closest(".export-dropdown-wrapper-compact") &&
        (exportDropdownOpen || formatCleanDropdownOpen)
      ) {
        setExportDropdownOpen(null);
        setFormatCleanDropdownOpen(false);
      }
    };
    if (exportDropdownOpen || formatCleanDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [exportDropdownOpen, formatCleanDropdownOpen]);

  // 打开弹窗时重置表单状态，确保使用最新字段
  useEffect(() => {
    if (activeAction) {
      // 重置所有表单状态
      setAddKey("");
      setAddMode("static");
      setAddValue("");
      setAddFromKey("");
      setDeleteKeys([]);
      setRenameFrom("");
      setRenameTo("");
      setUpdateKey("");
      setUpdateMode("set");
      setUpdateValue("");
      setUpdatePrefix("");
      setUpdateSuffix("");
      setTypeKey("");
      setTypeTarget("string");
      setSmartExtractSourceField("");
      setDrillConfig({
        path: [],
        arrayMode: "none",
        filterKey: "",
        filterValue: "",
        targetKey: "",
        outputField: "",
      });
      setNestTargetField("");
      setNestSelectedFields([]);
      setFlattenDepth(0);
      setUseSmartEAV(false);
      setKeepPrefix(true);
      setFlattenMode("all");
      setFlattenSelectedFields([]);
      setEscapeKey("");
      setOrderSearch("");
      setEscapeSelectedFields([]);
      setUnescapeSelectedFields([]);
      setParseJSONSelectedFields([]);
      // orderItems 由另一个 useEffect 管理，这里刷新一下
      if (activeFile) {
        if (activeFile.keyOrder && activeFile.keyOrder.length > 0) {
          // 过滤掉不在 sampleKeys 中的旧字段
          const validOrderItems = activeFile.keyOrder.filter((key) => sampleKeys.includes(key));
          setOrderItems(validOrderItems);
        } else {
          setOrderItems(sampleKeys);
        }
      }
    }
  }, [activeAction, activeFile, sampleKeys]);

  const executeBatch = async (action: BatchAction) => {
    if (targetFileIds.length === 0) return;
    setLoading(true);
    setWarning(null);
    
    const allWarnings: string[] = [];
    
    try {
      if (!workerRef.current) {
        workerRef.current = new DataWorkerClient();
      }
      
      // 处理所有目标文件
      for (const fileId of targetFileIds) {
        const file = files.find((f) => f.id === fileId);
        if (!file) continue;
        
        const response = await workerRef.current.request({
          id: crypto.randomUUID(),
          type: "batch",
          payload: { action, data: file.data },
        });
        
        if (response.type === "batch") {
          // 更新文件数据
          if (fileId === activeFileId) {
            replaceActiveFileData(response.payload.data);
          } else {
            replaceFileData(fileId, response.payload.data);
          }
          
          if (response.payload.warnings.length > 0) {
            allWarnings.push(`${file.name}: ${response.payload.warnings.slice(0, 2).join("；")}`);
          }
          
          await cacheFile({
            ...file,
            data: response.payload.data,
          });
        } else if (response.type === "error") {
          allWarnings.push(`${file.name}: ${response.payload.message}`);
        }
      }
      
      await enforceCacheLimit();
      
      if (allWarnings.length > 0) {
        setWarning(allWarnings.slice(0, 3).join(" | "));
      }
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const handleConfirm = () => {
    switch (activeAction) {
      case "addField":
        executeBatch({
          kind: "addField",
          key: addKey.trim(),
          mode: addMode,
          value: addValue,
          fromKey: addFromKey,
        });
        break;
      case "deleteField":
        executeBatch({ kind: "deleteField", keys: deleteKeys });
        break;
      case "renameField":
        executeBatch({ kind: "renameField", from: renameFrom, to: renameTo });
        break;
      case "updateValue":
        executeBatch({
          kind: "updateValue",
          key: updateKey,
          mode: updateMode,
          value: updateValue,
          prefix: updatePrefix,
          suffix: updateSuffix,
        });
        break;
      case "typeConvert":
        executeBatch({ kind: "typeConvert", key: typeKey, target: typeTarget });
        break;
      case "smartExtract": {
        if (!smartExtractSourceField.trim()) return;
        const outputField = drillConfig.outputField.trim();
        if (!outputField) return;
        if (
          drillConfig.arrayMode === "filter" &&
          (!drillConfig.filterKey.trim() ||
            !drillConfig.filterValue.trim() ||
            !drillConfig.targetKey.trim())
        ) {
          return;
        }
        const result = extractByPath(smartExtractSourceField, {
          path: drillConfig.path,
          filter:
            drillConfig.arrayMode === "filter"
              ? { key: drillConfig.filterKey.trim(), value: drillConfig.filterValue }
              : undefined,
          target: drillConfig.arrayMode === "filter" ? drillConfig.targetKey.trim() : "",
          outputField,
        });
        if (result.columns.length > 0) {
          const message = `提取完成：生成 ${result.columns.length} 列，匹配 ${result.matched} 条记录`;
          setWarning(message);
        } else {
          setWarning("未生成新列，请检查配置");
        }
        setActiveAction(null);
        break;
      }
      case "nestFields": {
        const targetField = nestTargetField.trim();
        const sourceFields = nestSelectedFields.filter((field) => field !== targetField);
        if (!targetField || sourceFields.length === 0) return;
        executeBatch({
          kind: "nestFields",
          sourceFields,
          targetField,
        });
        break;
      }
      case "flattenStrip": {
        executeBatch({
          kind: "flattenStrip",
          depth: flattenDepth === 0 ? undefined : flattenDepth,
          keepPrefix,
          useSmartEAV,
          targetKeys: flattenMode === "selected" ? flattenSelectedFields : undefined,
        });
        break;
      }
      case "keyReorder": {
        const order =
          orderText.trim().length > 0
            ? orderText
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : orderItems;
        if (order.length > 0) {
          setActiveFileKeyOrder(order);
          executeBatch({ kind: "keyReorder", order });
        }
        break;
      }
      case "escapeString": {
        // 转义：支持单个字段或多字段
        if (escapeSelectedFields.length > 0) {
          executeBatch({ kind: "escapeString", targetKeys: escapeSelectedFields });
        } else if (escapeKey.trim()) {
          executeBatch({ kind: "escapeString", key: escapeKey });
        }
        break;
      }
      case "unescapeString": {
        // 去转义：仅移除转义字符
        if (unescapeSelectedFields.length > 0) {
          executeBatch({ kind: "unescapeString", targetKeys: unescapeSelectedFields });
        } else if (escapeKey.trim()) {
          executeBatch({ kind: "unescapeString", key: escapeKey });
        }
        break;
      }
      case "parseJSON": {
        // 解析JSON：将JSON字符串解析为对象/数组
        if (parseJSONSelectedFields.length > 0) {
          executeBatch({ kind: "parseJSON", targetKeys: parseJSONSelectedFields });
        }
        break;
      }
      default:
        break;
    }
  };

  const handleNestTargetChange = (value: string) => {
    setNestTargetField(value);
    const trimmed = value.trim();
    if (trimmed) {
      setNestSelectedFields((prev) => prev.filter((field) => field !== trimmed));
    }
  };

  const toggleNestField = (field: string) => {
    setNestSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((item) => item !== field) : [...prev, field],
    );
  };

  const selectAllNestFields = () => {
    setNestSelectedFields(nestAvailableFields);
  };

  const deselectAllNestFields = () => {
    setNestSelectedFields([]);
  };

  const nestConfirmDisabled =
    loading || nestTargetField.trim().length === 0 || nestSelectedFields.length === 0;

  const smartExtractConfirmDisabled =
    loading ||
    !smartExtractSourceField.trim() ||
    !drillConfig.outputField.trim() ||
    (drillConfig.arrayMode === "filter" &&
      (!drillConfig.filterKey.trim() ||
        !drillConfig.filterValue.trim() ||
        !drillConfig.targetKey.trim()));

  const generateDefaultFileName = (type: "json" | "jsonl" | "excel") => {
    if (!activeFile) return "";
    const baseName = stripExt(activeFile.name);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const ext = type === "excel" ? ".xlsx" : `.${type}`;
    return `${baseName}_export_${timestamp}${ext}`;
  };

  const handleExportJson = async (filename?: string) => {
    if (!activeFile) return;
    setExportProgress(0);
    const text = await stringifyInWorker(activeFile.data, "json", workerRef, (percent, stage) => {
      setExportProgress(percent);
      setExportStage(stage);
    });
    const finalName = filename || `${stripExt(activeFile.name)}.json`;
    downloadText(text, finalName);
    setExportProgress(null);
    setExportDropdownOpen(null);
  };

  const handleExportJsonl = async (filename?: string) => {
    if (!activeFile) return;
    setExportProgress(0);
    const text = await stringifyInWorker(activeFile.data, "jsonl", workerRef, (percent, stage) => {
      setExportProgress(percent);
      setExportStage(stage);
    });
    const finalName = filename || `${stripExt(activeFile.name)}.jsonl`;
    downloadText(text, finalName);
    setExportProgress(null);
    setExportDropdownOpen(null);
  };

  const handleExportExcel = (filename?: string) => {
    if (!activeFile) return;
    const worksheet = XLSX.utils.json_to_sheet(activeFile.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "data");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const finalName = filename || `${stripExt(activeFile.name)}.xlsx`;
    link.download = finalName;
    link.click();
    URL.revokeObjectURL(url);
    setExportDropdownOpen(null);
  };

  const handleQuickExport = (type: "json" | "jsonl" | "excel") => {
    const filename = generateDefaultFileName(type);
    if (type === "json") {
      handleExportJson(filename);
    } else if (type === "jsonl") {
      handleExportJsonl(filename);
    } else {
      handleExportExcel(filename);
    }
  };

  const handleRenameExport = (type: "json" | "jsonl" | "excel") => {
    const defaultName = generateDefaultFileName(type);
    setRenameDialogConfig({ type, defaultName });
    setRenameDialogOpen(true);
    setExportDropdownOpen(null);
  };

  const handleRenameConfirm = (newName: string) => {
    if (!renameDialogConfig) return;
    const { type } = renameDialogConfig;
    if (type === "json") {
      handleExportJson(newName);
    } else if (type === "jsonl") {
      handleExportJsonl(newName);
    } else {
      handleExportExcel(newName);
    }
  };


  return (
    <div className="panel">
      <div className="panel-header panel-header-modern panel-header-purple">
        <div className="panel-header-left">
          <div className="panel-header-icon-box panel-header-icon-box-purple">
            <Settings size={20} className="panel-header-icon panel-header-icon-purple" />
          </div>
          <div className="panel-header-text">
            <h2 className="panel-title-modern">批量控制</h2>
            <span className="panel-subtitle-modern">规则化批处理</span>
          </div>
        </div>
        <div className="history-buttons">
          <button
            className="button history-btn"
            type="button"
            onClick={() => undo()}
            disabled={!canUndo()}
            title="撤回 (Ctrl+Z)"
          >
            <Undo2 size={14} />
            <span>撤回</span>
          </button>
          <button
            className="button history-btn"
            type="button"
            onClick={() => redo()}
            disabled={!canRedo()}
            title="重做 (Ctrl+Shift+Z)"
          >
            <Redo2 size={14} />
            <span>重做</span>
          </button>
        </div>
      </div>
      
      <div className="panel-content">
        {/* 过滤栏 */}
        <FilterBar />
        
        {/* 上半部分：批量操作按钮 */}
        <div className="batch-panel-top">
          {/* 批量模式提示 */}
          {isBatchMode && (
            <div className="batch-selection-info">
              <Users size={14} />
              <span>批量模式：将同时处理 {selectedFileIds.length} 个文件</span>
            </div>
          )}
          
          {/* Section 1: 字段管理 (Field Management) */}
          <div className="batch-group batch-group-manage">
            <div className="batch-group-title-header batch-group-title-manage">
              <div className="batch-group-title-accent batch-group-title-accent-blue"></div>
              <span className="batch-group-title-text">字段管理</span>
            </div>
            <div className="action-grid action-grid-manage">
              <ActionCard icon={PlusSquare} label="新增字段" onClick={() => setActiveAction("addField")} theme="blue" />
              <ActionCard icon={Trash2} label="删除字段" onClick={() => setActiveAction("deleteField")} theme="blue" />
              <ActionCard icon={PencilLine} label="重命名" onClick={() => setActiveAction("renameField")} theme="blue" />
              <ActionCard icon={AlignJustify} label="字段排序" onClick={() => setActiveAction("keyReorder")} theme="blue" />
            </div>
          </div>

          {/* Section 2: 智能清洗 (Smart Cleaning) */}
          <div className="batch-group batch-group-clean">
            <div className="batch-group-title-header batch-group-title-clean">
              <div className="batch-group-title-accent batch-group-title-accent-emerald"></div>
              <span className="batch-group-title-text">智能清洗</span>
            </div>
            <div className="action-grid action-grid-clean">
              {/* Row 1: 格式转换下拉菜单 + 解析JSON */}
              {/* 格式转换下拉菜单 */}
              <div className="export-dropdown-wrapper">
                <button
                  className="action-card-modern action-card-emerald export-dropdown-trigger format-clean-trigger"
                  type="button"
                  onClick={() => {
                    setFormatCleanDropdownOpen(!formatCleanDropdownOpen);
                    setExportDropdownOpen(null);
                  }}
                >
                  <div className="action-icon-wrapper">
                    <ArrowLeftRight size={16} />
                  </div>
                  <span className="action-label">格式转换</span>
                  <ChevronDown size={12} className="export-dropdown-chevron" />
                </button>
                {formatCleanDropdownOpen && (
                  <div className="format-clean-dropdown-menu">
                    {/* Item: Unescape */}
                    <button
                      className="format-clean-item group"
                      onClick={() => {
                        setActiveAction("unescapeString");
                        setFormatCleanDropdownOpen(false);
                      }}
                    >
                      <div className="format-clean-item-left">
                        <div className="format-clean-icon-box">
                          <Unlink size={14} />
                        </div>
                        <span className="format-clean-item-label">去转义</span>
                      </div>
                      <ChevronRight size={12} className="format-clean-arrow" />
                    </button>

                    {/* Item: Escape */}
                    <button
                      className="format-clean-item group"
                      onClick={() => {
                        setActiveAction("escapeString");
                        setFormatCleanDropdownOpen(false);
                      }}
                    >
                      <div className="format-clean-item-left">
                        <div className="format-clean-icon-box">
                          <Link size={14} />
                        </div>
                        <span className="format-clean-item-label">转义</span>
                      </div>
                      <ChevronRight size={12} className="format-clean-arrow" />
                    </button>

                    {/* Item: Type Convert */}
                    <button
                      className="format-clean-item group"
                      onClick={() => {
                        setActiveAction("typeConvert");
                        setFormatCleanDropdownOpen(false);
                      }}
                    >
                      <div className="format-clean-item-left">
                        <div className="format-clean-icon-box">
                          <Binary size={14} />
                        </div>
                        <span className="format-clean-item-label">类型转换</span>
                      </div>
                      <ChevronRight size={12} className="format-clean-arrow" />
                    </button>
                  </div>
                )}
              </div>

              {/* 解析 JSON */}
              <ActionCard 
                icon={Braces} 
                label="解析 JSON" 
                onClick={() => setActiveAction("parseJSON")} 
                theme="emerald" 
              />

              {/* Row 2: 批量赋值 */}
              <ActionCard icon={Replace} label="批量赋值" onClick={() => setActiveAction("updateValue")} theme="emerald" />
            </div>
          </div>

          {/* Section 3: 结构重塑 (Structure Reshaping) */}
          <div className="batch-group batch-group-reshape">
            <div className="batch-group-title-header batch-group-title-reshape">
              <div className="batch-group-title-accent batch-group-title-accent-purple"></div>
              <span className="batch-group-title-text">结构重塑</span>
            </div>
            <div className="action-grid action-grid-reshape">
              <ActionCard icon={Filter} label="智能提取" onClick={() => setActiveAction("smartExtract")} theme="purple" highlight />
              <ActionCard icon={Layers} label="扁平化" onClick={() => setActiveAction("flattenStrip")} theme="purple" />
              <ActionCard icon={BoxSelect} label="组合对象" onClick={() => setActiveAction("nestFields")} theme="purple" />
            </div>
          </div>

          {/* Section 4: 数据导出 (Export) - File Card Grid */}
          <div className="batch-group-export-compact">
            {/* Header with accent bar - Victory Gradient */}
            <div className="export-section-header-with-accent">
              <div className="export-section-accent-bar export-section-accent-bar-gradient"></div>
              <span className="export-section-header-text">数据交付</span>
            </div>
            
            {/* The Grid */}
            <div className="export-file-grid-polished">
              {/* JSON Card - Orange/Amber Theme */}
              <button
                className="export-file-card-polished export-file-card-json group"
                type="button"
                onClick={() => handleQuickExport("json")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRenameExport("json");
                }}
                title="左键：快速导出 | 右键：重命名"
              >
                <FileJson size={24} className="export-file-icon-polished export-file-icon-json" strokeWidth={1.5} />
                <span className="export-file-label-polished export-file-label-json">JSON</span>
              </button>

              {/* JSONL Card - Blue Theme */}
              <button
                className="export-file-card-polished export-file-card-jsonl group"
                type="button"
                onClick={() => handleQuickExport("jsonl")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRenameExport("jsonl");
                }}
                title="左键：快速导出 | 右键：重命名"
              >
                <FileDown size={24} className="export-file-icon-polished export-file-icon-jsonl" strokeWidth={1.5} />
                <span className="export-file-label-polished export-file-label-jsonl">JSONL</span>
              </button>

              {/* Excel Card - Emerald/Green Theme */}
              <button
                className="export-file-card-polished export-file-card-excel group"
                type="button"
                onClick={() => handleQuickExport("excel")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRenameExport("excel");
                }}
                title="左键：快速导出 | 右键：重命名"
              >
                <FileSpreadsheet size={24} className="export-file-icon-polished export-file-icon-excel" strokeWidth={1.5} />
                <span className="export-file-label-polished export-file-label-excel">Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* 下半部分：字段管理器 */}
        <div className="batch-panel-bottom">
          <FieldManagerPanel />
          
          {(warning || exportProgress !== null) && showStatus && (
            <div className="status-bar" style={{ marginTop: 12 }}>
              <div className="status-icon">
                <ShieldCheck size={16} />
              </div>
              <div className="status-content">
                {warning && <div>{warning}</div>}
                {exportProgress !== null && (
                  <div>
                    导出中... {exportProgress}% {exportStage && `(${exportStage})`}
                  </div>
                )}
              </div>
              <button className="status-close" type="button" onClick={() => setShowStatus(false)}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {activeAction && activeAction !== "nestFields" && activeAction !== "smartExtract" && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="panel-header">
              <div className="panel-title">批处理配置</div>
              <button className="button" type="button" onClick={() => setActiveAction(null)}>
                关闭
              </button>
            </div>

            {activeAction === "addField" && (
              <div className="form-grid">
                <label>
                  字段名
                  <input value={addKey} onChange={(e) => setAddKey(e.target.value)} />
                </label>
                <label>
                  模式
                  <select value={addMode} onChange={(e) => setAddMode(e.target.value as "static" | "copy")}>
                    <option value="static">静态值</option>
                    <option value="copy">复制</option>
                  </select>
                </label>
                {addMode === "static" ? (
                  <label>
                    值
                    <input value={addValue} onChange={(e) => setAddValue(e.target.value)} />
                  </label>
                ) : (
                  <label>
                    来源字段
                    <select value={addFromKey} onChange={(e) => setAddFromKey(e.target.value)}>
                      <option value="">选择</option>
                      {sampleKeys.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {activeAction === "deleteField" && (
              <div className="form-grid">
                <div className="checkbox-grid">
                  {sampleKeys.map((key) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={deleteKeys.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDeleteKeys((prev) => [...prev, key]);
                          } else {
                            setDeleteKeys((prev) => prev.filter((item) => item !== key));
                          }
                        }}
                      />
                      {key}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeAction === "renameField" && (
              <div className="form-grid">
                <label>
                  旧字段
                  <select value={renameFrom} onChange={(e) => setRenameFrom(e.target.value)}>
                    <option value="">选择</option>
                    {sampleKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  新字段
                  <input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
                </label>
              </div>
            )}

            {activeAction === "updateValue" && (
              <div className="form-grid">
                <label>
                  字段
                  <select value={updateKey} onChange={(e) => setUpdateKey(e.target.value)}>
                    <option value="">选择</option>
                    {sampleKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  模式
                  <select
                    value={updateMode}
                    onChange={(e) => setUpdateMode(e.target.value as "set" | "prefixSuffix")}
                  >
                    <option value="set">重置赋值</option>
                    <option value="prefixSuffix">前缀+原值+后缀</option>
                  </select>
                </label>
                {updateMode === "set" ? (
                  <label>
                    值
                    <input value={updateValue} onChange={(e) => setUpdateValue(e.target.value)} />
                  </label>
                ) : (
                  <>
                    <label>
                      前缀
                      <input value={updatePrefix} onChange={(e) => setUpdatePrefix(e.target.value)} />
                    </label>
                    <label>
                      后缀
                      <input value={updateSuffix} onChange={(e) => setUpdateSuffix(e.target.value)} />
                    </label>
                  </>
                )}
              </div>
            )}

            {activeAction === "typeConvert" && (
              <div className="form-grid">
                <label>
                  选择字段
                  <select value={typeKey} onChange={(e) => setTypeKey(e.target.value)}>
                    <option value="">选择要转换的字段</option>
                    {sampleKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>

                {/* 当前类型检测指示器 */}
                {typeKey && (
                  <div className="type-detect-indicator">
                    <span className="type-detect-label">当前检测类型:</span>
                    <span 
                      className="type-detect-badge"
                      style={{ 
                        backgroundColor: `${detectedFieldType.color}15`,
                        color: detectedFieldType.color,
                        borderColor: `${detectedFieldType.color}40`
                      }}
                    >
                      <span 
                        className="type-detect-dot"
                        style={{ backgroundColor: detectedFieldType.color }}
                      />
                      {detectedFieldType.label}
                    </span>
                  </div>
                )}

                {/* 目标类型选择 */}
                {typeKey && (
                  <label>
                    转换为
                    <select
                      value={typeTarget}
                      onChange={(e) =>
                        setTypeTarget(e.target.value as "string" | "number" | "boolean")
                      }
                    >
                      {availableTypeTargets.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.icon})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* 转换说明 */}
                {typeKey && (
                  <div className="type-convert-hints">
                    {detectedFieldType.type === "string" && typeTarget === "number" && (
                      <div className="type-convert-hint-item type-convert-hint-warning">
                        ⚠️ 非数字字符将被转换为 NaN
                      </div>
                    )}
                    {detectedFieldType.type === "string" && typeTarget === "boolean" && (
                      <div className="type-convert-hint-item type-convert-hint-info">
                        💡 空字符串 → false，其他 → true
                      </div>
                    )}
                    {detectedFieldType.type === "number" && typeTarget === "string" && (
                      <div className="type-convert-hint-item type-convert-hint-info">
                        💡 数字将转为文本形式，如 123 → "123"
                      </div>
                    )}
                    {detectedFieldType.type === "number" && typeTarget === "boolean" && (
                      <div className="type-convert-hint-item type-convert-hint-info">
                        💡 0 → false，其他数字 → true
                      </div>
                    )}
                    {detectedFieldType.type === "boolean" && typeTarget === "string" && (
                      <div className="type-convert-hint-item type-convert-hint-info">
                        💡 true → "true"，false → "false"
                      </div>
                    )}
                    {detectedFieldType.type === "boolean" && typeTarget === "number" && (
                      <div className="type-convert-hint-item type-convert-hint-info">
                        💡 true → 1，false → 0
                      </div>
                    )}
                    {(detectedFieldType.type === "object" || detectedFieldType.type === "null") && (
                      <div className="type-convert-hint-item type-convert-hint-warning">
                        ⚠️ 复杂类型转换可能产生意外结果
                      </div>
                    )}
                  </div>
                )}

                {!typeKey && (
                  <div className="card type-convert-placeholder">
                    <span className="text-muted">👆 请先选择要转换的字段</span>
                  </div>
                )}
              </div>
            )}

            {activeAction === "flattenStrip" && (
              <div className="form-grid">
                {/* 扁平化选项 */}
                <div className="flatten-options">
                  <label>
                    扁平化范围
                    <select
                      value={flattenMode}
                      onChange={(e) => {
                        setFlattenMode(e.target.value as "all" | "selected");
                        if (e.target.value === "all") {
                          setFlattenSelectedFields([]);
                        }
                      }}
                    >
                      <option value="all">全部字段</option>
                      <option value="selected">指定字段</option>
                    </select>
                  </label>

                  {/* 字段选择（多选下拉） */}
                  {flattenMode === "selected" && (
                    <label>
                      选择要扁平化的字段
                      <select
                        multiple
                        value={flattenSelectedFields}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                          setFlattenSelectedFields(selected);
                        }}
                        style={{ height: "120px" }}
                      >
                        {sampleKeys
                          .filter((key) => {
                            // 只显示可能包含嵌套结构的字段
                            const sample = activeFile?.data?.[0];
                            if (!sample || typeof sample !== "object") return true;
                            const value = (sample as Record<string, unknown>)[key];
                            return value !== null && typeof value === "object";
                          })
                          .map((key) => (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          ))}
                      </select>
                      <div className="field-hint">按住 Ctrl/Cmd 多选</div>
                    </label>
                  )}

                  <label>
                    扁平化深度
                    <select
                      value={flattenDepth}
                      onChange={(e) => setFlattenDepth(Number(e.target.value))}
                    >
                      <option value={0}>全部层级（完全扁平化）</option>
                      <option value={1}>仅 1 层</option>
                      <option value={2}>仅 2 层</option>
                      <option value={3}>仅 3 层</option>
                    </select>
                  </label>

                  <div className="flatten-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={keepPrefix}
                        onChange={(e) => setKeepPrefix(e.target.checked)}
                      />
                      <span>保留字段前缀</span>
                    </label>
                    <div className="toggle-hint">
                      {keepPrefix
                        ? `扁平化后保留父级字段名作为前缀，如 user.name、user.age`
                        : `扁平化后不保留前缀，直接使用子字段名，如 name、age`}
                    </div>
                  </div>

                  <div className="flatten-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={useSmartEAV}
                        onChange={(e) => setUseSmartEAV(e.target.checked)}
                      />
                      <span>智能转换 label/value 结构</span>
                    </label>
                    <div className="toggle-hint">
                      {useSmartEAV
                        ? `将 [{label:"Title", value:"Hello"}] 转为 {Title: "Hello"}`
                        : `标准模式：保留原始数组索引 (tags.0.label, tags.0.value)`}
                    </div>
                  </div>
                </div>

                {/* 预览说明 */}
                <div className="card flatten-preview">
                  <strong>操作预览：</strong>
                  <br />
                  {flattenMode === "all" ? (
                    <>将递归扁平化整个数据结构{flattenDepth > 0 ? `（深度限制：${flattenDepth} 层）` : ""}</>
                  ) : flattenSelectedFields.length > 0 ? (
                    <>
                      将扁平化以下字段：
                      <span className="flatten-field-tags">
                        {flattenSelectedFields.map((f) => (
                          <span key={f} className="flatten-field-tag">{f}</span>
                        ))}
                      </span>
                      {flattenDepth > 0 ? `（深度限制：${flattenDepth} 层）` : ""}
                    </>
                  ) : (
                    <span className="text-muted">请选择要扁平化的字段</span>
                  )}
                </div>
              </div>
            )}

            {activeAction === "keyReorder" && (
              <div className="form-grid">
                <label>
                  字段顺序（逗号分隔）
                  <textarea
                    value={orderText}
                    onChange={(e) => setOrderText(e.target.value)}
                    rows={4}
                  />
                </label>
                <div className="card">
                  也可直接拖拽下方列表进行排序（默认取样前 100 条的字段）。
                </div>
                <div className="sortable-list">
                  <DndContext
                    collisionDetection={closestCenter}
                    sensors={sensors}
                    onDragEnd={(event) => {
                      const { active, over } = event;
                      if (over && active.id !== over.id) {
                        setOrderItems((items) => {
                          const oldIndex = items.indexOf(String(active.id));
                          const newIndex = items.indexOf(String(over.id));
                          return arrayMove(items, oldIndex, newIndex);
                        });
                      }
                    }}
                  >
                    <SortableContext items={orderItems}>
                      {orderItems.map((key) => (
                        <SortableKeyItem
                          key={key}
                          id={key}
                          onRemove={(id) =>
                            setOrderItems((items) => items.filter((item) => item !== id))
                          }
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
                <div className="card">
                  <div className="panel-header">
                    <div className="panel-title">可用字段</div>
                    <button
                      className="button"
                      type="button"
                      onClick={() => setOrderItems(sampleKeys)}
                    >
                      重置采样
                    </button>
                  </div>
                  <input
                    className="input"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="搜索字段..."
                  />
                  <div className="available-keys">
                    {availableKeys.length === 0 && <div className="panel-hint">无可用字段。</div>}
                    {availableKeys.map((key) => (
                      <button
                        key={key}
                        className="button"
                        type="button"
                        onClick={() => setOrderItems((items) => [...items, key])}
                      >
                        + {key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeAction === "escapeString" && (
              <div className="form-grid">
                <div className="card smart-parse-info">
                  <strong>转义</strong>
                  <p>
                    将特殊字符转为转义序列，或将对象/数组序列化为 JSON 字符串。
                  </p>
                  <ul style={{ margin: "8px 0 0 0", paddingLeft: "16px", fontSize: "12px", color: "#64748b" }}>
                    <li>字符串：<code>"</code> → <code>\"</code>，换行 → <code>\n</code></li>
                    <li>对象/数组：序列化为 JSON 字符串</li>
                  </ul>
                </div>

                {/* 检测结果 - 可选择的字段卡片 */}
                {escapeCandidateFields.length > 0 ? (
                  <div className="flatten-detection">
                    <div className="flatten-detection-header">
                      <span className="flatten-detection-title">
                        ✅ 检测到 {escapeCandidateFields.length} 个可转义的字段
                      </span>
                    </div>
                    <div className="smart-parse-field-cards">
                      {escapeCandidateFields.map(({ key, type, preview }) => {
                        const isSelected = escapeSelectedFields.includes(key);
                        return (
                          <div
                            key={key}
                            className={`smart-parse-field-card ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              if (isSelected) {
                                setEscapeSelectedFields(escapeSelectedFields.filter((f) => f !== key));
                              } else {
                                setEscapeSelectedFields([...escapeSelectedFields, key]);
                              }
                            }}
                          >
                            <div className="smart-parse-field-card-header">
                              <span className="smart-parse-field-name">{key}</span>
                              <span className="smart-parse-field-type" style={{ 
                                fontSize: "10px", 
                                color: type === "object" ? "#7c3aed" : "#16a34a",
                                marginLeft: "6px"
                              }}>
                                {type === "object" ? "对象" : "字符串"}
                              </span>
                              <div
                                className={`smart-parse-field-checkbox ${isSelected ? "checked" : ""}`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                            <p className="smart-parse-field-preview">{preview}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flatten-empty">
                    未检测到需要转义的字段。
                  </div>
                )}

                {/* 手动选择字段（备用） */}
                <label>
                  或手动选择字段
                  <select value={escapeKey} onChange={(e) => setEscapeKey(e.target.value)}>
                    <option value="">选择</option>
                    {sampleKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {activeAction === "unescapeString" && (
              <div className="form-grid">
                <div className="card smart-parse-info">
                  <strong>去转义</strong>
                  <p>
                    将转义序列还原为原始字符，不解析 JSON 结构。
                  </p>
                  <ul style={{ margin: "8px 0 0 0", paddingLeft: "16px", fontSize: "12px", color: "#64748b" }}>
                    <li><code>\"</code> → <code>"</code></li>
                    <li><code>\n</code> → 换行符</li>
                    <li><code>\t</code> → 制表符</li>
                    <li><code>\\</code> → <code>\</code></li>
                  </ul>
                </div>

                {/* 检测结果 - 可选择的字段卡片 */}
                {unescapeCandidateFields.length > 0 ? (
                  <div className="flatten-detection">
                    <div className="flatten-detection-header">
                      <span className="flatten-detection-title">
                        ✅ 检测到 {unescapeCandidateFields.length} 个包含转义序列的字段
                      </span>
                    </div>
                    <div className="smart-parse-field-cards">
                      {unescapeCandidateFields.map(({ key, preview }) => {
                        const isSelected = unescapeSelectedFields.includes(key);
                        return (
                          <div
                            key={key}
                            className={`smart-parse-field-card ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              if (isSelected) {
                                setUnescapeSelectedFields(unescapeSelectedFields.filter((f) => f !== key));
                              } else {
                                setUnescapeSelectedFields([...unescapeSelectedFields, key]);
                              }
                            }}
                          >
                            <div className="smart-parse-field-card-header">
                              <span className="smart-parse-field-name">{key}</span>
                              <div
                                className={`smart-parse-field-checkbox ${isSelected ? "checked" : ""}`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                            <p className="smart-parse-field-preview">{preview}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flatten-empty">
                    ℹ️ 未检测到明显的转义序列（如 \"、\n、\t 等）。
                  </div>
                )}

              </div>
            )}

            {activeAction === "parseJSON" && (
              <div className="form-grid">
                <div className="card smart-parse-info parse-json-info">
                  <strong>解析 JSON</strong>
                  <p>
                    将 JSON 字符串解析为对象/数组（支持递归解析嵌套结构）。
                    例如：将字符串 <code>{`{"name":"test"}`}</code> 解析为实际对象 <code>{`{name: "test"}`}</code>
                  </p>
                </div>

                {/* 检测结果 - 可选择的字段卡片（绿色主题） */}
                {parseJSONCandidateFields.length > 0 ? (
                  <div className="flatten-detection parse-json-detection">
                    <div className="flatten-detection-header">
                      <span className="flatten-detection-title" style={{ color: "#047857" }}>
                        ✅ 检测到 {parseJSONCandidateFields.length} 个 JSON 字符串字段
                      </span>
                    </div>
                    <div className="smart-parse-field-cards parse-json-field-cards">
                      {parseJSONCandidateFields.map(({ key, preview }) => {
                        const isSelected = parseJSONSelectedFields.includes(key);
                        return (
                          <div
                            key={key}
                            className={`smart-parse-field-card ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              if (isSelected) {
                                setParseJSONSelectedFields(parseJSONSelectedFields.filter((f) => f !== key));
                              } else {
                                setParseJSONSelectedFields([...parseJSONSelectedFields, key]);
                              }
                            }}
                          >
                            <div className="smart-parse-field-card-header">
                              <span className="smart-parse-field-name">{key}</span>
                              <div
                                className={`smart-parse-field-checkbox ${isSelected ? "checked" : ""}`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                            <p className="smart-parse-field-preview">{preview}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flatten-empty">
                    未检测到 JSON 字符串字段。请确保数据中包含以 {"{"} 或 {"["} 开头的字符串值。
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setActiveAction(null)}>
                取消
              </button>
              <button
                className="button primary"
                type="button"
                onClick={handleConfirm}
                disabled={
                  loading ||
                  (activeAction === "flattenStrip" && flattenMode === "selected" && flattenSelectedFields.length === 0) ||
                  (activeAction === "escapeString" && escapeSelectedFields.length === 0 && !escapeKey.trim()) ||
                  (activeAction === "unescapeString" && unescapeSelectedFields.length === 0 && !escapeKey.trim()) ||
                  (activeAction === "parseJSON" && parseJSONSelectedFields.length === 0)
                }
              >
                {loading
                  ? "处理中..."
                  : activeAction === "escapeString" && escapeSelectedFields.length > 0
                    ? `转义选中字段 (${escapeSelectedFields.length})`
                    : activeAction === "unescapeString" && unescapeSelectedFields.length > 0
                      ? `去转义选中字段 (${unescapeSelectedFields.length})`
                      : activeAction === "parseJSON" && parseJSONSelectedFields.length > 0
                        ? `解析选中字段 (${parseJSONSelectedFields.length})`
                        : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NestFieldsModal
        isOpen={activeAction === "nestFields"}
        availableFields={nestAvailableFields}
        targetField={nestTargetField}
        selectedFields={nestSelectedFields}
        onTargetFieldChange={handleNestTargetChange}
        onToggleField={toggleNestField}
        onSelectAll={selectAllNestFields}
        onDeselectAll={deselectAllNestFields}
        onCancel={() => setActiveAction(null)}
        onConfirm={handleConfirm}
        confirmDisabled={nestConfirmDisabled}
        loading={loading}
      />

      <SmartExtractModal
        isOpen={activeAction === "smartExtract"}
        sourceFields={sampleKeys}
        sourceField={smartExtractSourceField}
        schema={drillSchema}
        config={drillConfig}
        sampleData={activeFile?.data}
        onSourceFieldChange={setSmartExtractSourceField}
        onConfigChange={setDrillConfig}
        onCancel={() => setActiveAction(null)}
        onConfirm={handleConfirm}
        confirmDisabled={smartExtractConfirmDisabled}
        loading={loading}
      />

      {/* Rename Dialog */}
      {renameDialogConfig && (
        <RenameDialog
          isOpen={renameDialogOpen}
          defaultName={renameDialogConfig.defaultName}
          extension={renameDialogConfig.type === "excel" ? ".xlsx" : `.${renameDialogConfig.type}`}
          onClose={() => {
            setRenameDialogOpen(false);
            setRenameDialogConfig(null);
          }}
          onConfirm={handleRenameConfirm}
        />
      )}
    </div>
  );
}

function stripExt(name: string) {
  return name.replace(/\.(json|jsonl|xlsx|xls)$/i, "");
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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


async function stringifyInWorker(
  data: unknown,
  format: "json" | "jsonl",
  workerRef: React.MutableRefObject<DataWorkerClient | null>,
  onProgress?: (percent: number, stage: string) => void,
) {
  if (!workerRef.current) {
    workerRef.current = new DataWorkerClient();
  }
  const response = await workerRef.current.request(
    {
      id: crypto.randomUUID(),
      type: "stringify",
      payload: { data, format },
    },
    (progress) => {
      if (progress.type === "progress" && onProgress) {
        onProgress(progress.payload.percent, progress.payload.stage);
      }
    },
  );
  if (response.type === "stringify") {
    return response.payload.text;
  }
  if (response.type === "error") {
    throw new Error(response.payload.message);
  }
  return "";
}

interface ActionCardProps {
  icon: typeof FileJson;
  label: string;
  onClick: () => void;
  theme?: "blue" | "emerald" | "purple";
  highlight?: boolean;
}

function ActionCard({ icon: Icon, label, onClick, theme = "blue", highlight = false }: ActionCardProps) {
  const themeClasses = {
    blue: "action-card-blue",
    emerald: "action-card-emerald",
    purple: "action-card-purple",
  };
  
  return (
    <button 
      className={`action-card-modern ${themeClasses[theme]} ${highlight ? "action-card-highlight" : ""}`} 
      type="button" 
      onClick={onClick}
    >
      <div className="action-icon-wrapper">
        <Icon size={16} />
      </div>
      <span className="action-label">{label}</span>
    </button>
  );
}

