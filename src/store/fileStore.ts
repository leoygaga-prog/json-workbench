import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type FileType = "json" | "jsonl" | "xlsx";

export interface FileSource {
  id: string;
  name: string;
  size: number;
  type: FileType;
  data: unknown[];
  errorRows?: { line: number; raw: string; message: string }[];
  keyOrder?: string[];
  sourceFileIds?: string[]; // 合并文件的源文件 ID 列表
}

type ViewMode = "source" | "tree";

export interface FilterRule {
  id: string;
  field: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notContains" | "isEmpty" | "isNotEmpty";
  value: string;
}

/**
 * 过滤分组结构（固定两层逻辑）
 * - 组间：始终 AND（所有组必须匹配）
 * - 组内：始终 OR（任一规则匹配即可）
 * 
 * 示例：(Field1=A OR Field1=B) AND (Field2=X)
 */
export interface FilterGroup {
  id: string;
  rules: FilterRule[];
}

type SmartExtractConfig =
  | { mode: "object"; keys: string[]; expandAll?: boolean }
  | {
      mode: "array_single";
      matchKey: string;
      matchValue: string;
      extractKey: string;
      targetField: string;
    }
  | { mode: "pivot_array"; keyCol: string; valueCol: string }
  | {
      mode: "nested_tags";
      label: string;
      targetField: string;
      nestedKeys?: string[];
      labelKey?: string;
      valueKey?: string;
    };

type ExtractByPathConfig = {
  path: string[];
  filter?: { key: string; value: string };
  target?: string;
  outputField: string;
};

interface HistoryEntry {
  data: unknown[];
  keyOrder?: string[];
}

interface FileHistory {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

const MAX_HISTORY = 50;

interface FileState {
  files: FileSource[];
  activeFileId: string | null;
  selectedFileIds: string[];  // 多选文件 ID 列表
  selectedFieldKey: string | null; // 侧边栏选中的字段
  currentIndex: number;
  readOnly: boolean;
  viewMode: ViewMode;
  cacheReady: boolean;
  history: Record<string, FileHistory>;
  // 过滤相关状态
  searchQuery: string;
  filterGroups: FilterGroup[];  // 分组过滤：组内 OR，组间 AND
  filteredIndices: number[];  // 原始数据索引映射
  addFile: (file: FileSource) => void;
  setFiles: (files: FileSource[]) => void;
  setActiveFile: (id: string) => void;
  removeFile: (id: string) => void;  // 删除文件
  toggleFileSelection: (id: string) => void;  // 切换文件选中状态
  selectAllCompatibleFiles: (formatKeys: string[]) => void;  // 选中所有相同格式的文件
  clearSelection: () => void;  // 清除选择
  replaceFileData: (id: string, data: unknown[]) => void;  // 替换指定文件数据
  setIndex: (index: number) => void;
  updateRecord: (index: number, value: unknown) => void;
  replaceActiveFileData: (data: unknown[], saveHistory?: boolean) => void;
  setActiveFileType: (type: FileType) => void;
  setActiveFileKeyOrder: (order: string[]) => void;
  setSelectedFieldKey: (key: string | null) => void;
  appendActiveRecord: (value: unknown) => void;
  updateActiveErrorRow: (index: number, raw: string) => void;
  resolveActiveErrorRow: (index: number, value: unknown) => void;
  removeActiveErrorRow: (index: number) => void;
  toggleReadOnly: () => void;
  setViewMode: (mode: ViewMode) => void;
  initDemoData: () => void;
  setCacheReady: () => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getHistoryLength: () => { past: number; future: number };
  reorderKeys: (newOrder: string[]) => void;
  batchRenameField: (oldKey: string, newKey: string) => void;
  batchDeleteField: (key: string) => void;
  batchDeleteFields: (keys: string[]) => void;  // 批量删除多个字段
  batchRenameFields: (renameMap: Record<string, string>) => void;  // 批量重命名多个字段
  batchConvertField: (field: string, mode: "parse" | "stringify") => { success: number; failed: number };  // 字段 JSON 转换
  nestFields: (sourceFields: string[], targetField: string) => void;  // 字段嵌套
  smartExtract: (field: string, config: SmartExtractConfig) => { matched: number; columns: string[] };
  extractByPath: (field: string, config: ExtractByPathConfig) => { matched: number; columns: string[] };
  // 过滤相关 actions
  setSearchQuery: (query: string) => void;
  /**
   * 添加过滤规则
   * - 默认行为：同字段规则自动归入同组（OR 逻辑）
   * - 可指定 groupId 添加到特定组
   * - 可设置 forceNewGroup=true 强制创建新组（AND 逻辑）
   */
  addFilterRule: (rule: FilterRule, options?: { groupId?: string; forceNewGroup?: boolean }) => void;
  removeFilterRule: (ruleId: string) => void;
  removeFilterGroup: (groupId: string) => void;
  clearAllFilters: () => void;
  recalculateFilteredData: () => void;
  getFilteredData: () => unknown[];
  getOriginalIndex: (filteredIndex: number) => number;
  isFiltered: () => boolean;
  commitFilterToData: () => boolean;  // 将筛选结果覆盖原数据，返回是否成功
  // 辅助方法
  getAllFilterRules: () => FilterRule[];
  getGroupForField: (field: string) => FilterGroup | undefined;
  // 多文件操作
  mergeFilesToNew: (options?: {
    addSourceTag?: boolean;
    sourceTagField?: string;
  }) => FileSource | null;  // 返回新文件
  duplicateFile: (fileId: string, newName?: string) => FileSource | null;
  renameFile: (fileId: string, newName: string) => void;  // 重命名文件
}

const demoFile: FileSource = {
  id: "demo-1",
  name: "demo.json",
  size: 2048,
  type: "json",
  data: [
    {
      id: 1,
      title: "Example record",
      user: { id: "u-001", tags: ["alpha", "beta"] },
    },
    {
      id: 2,
      title: "Second record",
      user: { id: "u-002", tags: ["gamma"] },
    },
  ],
};

export const useFileStore = create<FileState>()(
  immer((set, get) => ({
    files: [],
    activeFileId: null,
    selectedFileIds: [],
    selectedFieldKey: null,
    currentIndex: 0,
    readOnly: false,
    viewMode: "source",
    cacheReady: false,
    history: {},
    searchQuery: "",
    filterGroups: [],
    filteredIndices: [],
    addFile: (file) =>
      set((state) => {
        state.files.push(file);
        state.history[file.id] = { past: [], future: [] };
        if (!state.activeFileId) {
          state.activeFileId = file.id;
          state.currentIndex = 0;
        }
      }),
    setFiles: (files) =>
      set((state) => {
        state.files = files;
        files.forEach((file) => {
          if (!state.history[file.id]) {
            state.history[file.id] = { past: [], future: [] };
          }
        });
        state.activeFileId = files[0]?.id ?? null;
        state.selectedFileIds = [];
        state.currentIndex = 0;
      }),
    setActiveFile: (id) =>
      set((state) => {
        state.activeFileId = id;
        state.currentIndex = 0;
      }),
    removeFile: (id) =>
      set((state) => {
        const index = state.files.findIndex((f) => f.id === id);
        if (index === -1) return;
        state.files.splice(index, 1);
        delete state.history[id];
        state.selectedFileIds = state.selectedFileIds.filter((fid) => fid !== id);
        // 如果删除的是当前激活的文件，切换到其他文件
        if (state.activeFileId === id) {
          state.activeFileId = state.files[0]?.id ?? null;
          state.currentIndex = 0;
        }
      }),
    toggleFileSelection: (id) =>
      set((state) => {
        const index = state.selectedFileIds.indexOf(id);
        if (index === -1) {
          state.selectedFileIds.push(id);
        } else {
          state.selectedFileIds.splice(index, 1);
        }
      }),
    selectAllCompatibleFiles: (formatKeys) =>
      set((state) => {
        // 累加模式：保留已选中的文件，添加所有相同格式的文件
        const existingSelection = new Set(state.selectedFileIds);
        
        // 找到所有具有相同格式（相同字段）的文件
        state.files.forEach((file) => {
          if (file.data.length === 0) return;
          const firstRecord = file.data[0];
          if (!firstRecord || typeof firstRecord !== "object" || Array.isArray(firstRecord)) return;
          const keys = Object.keys(firstRecord as Record<string, unknown>).sort().join(",");
          if (keys === formatKeys.join(",")) {
            existingSelection.add(file.id);
          }
        });
        
        state.selectedFileIds = Array.from(existingSelection);
      }),
    clearSelection: () =>
      set((state) => {
        state.selectedFileIds = [];
      }),
    replaceFileData: (id, data) =>
      set((state) => {
        const file = state.files.find((f) => f.id === id);
        if (!file) return;
        
        // 保存到历史记录
        if (!state.history[id]) {
          state.history[id] = { past: [], future: [] };
        }
        const history = state.history[id];
        const currentEntry = {
          data: JSON.parse(JSON.stringify(file.data)),
          keyOrder: file.keyOrder ? [...file.keyOrder] : undefined,
        };
        history.past.push(currentEntry);
        if (history.past.length > MAX_HISTORY) {
          history.past.shift();
        }
        history.future = [];
        
        file.data = data;
      }),
    setIndex: (index) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        const nextIndex = Math.max(0, Math.min(index, activeFile.data.length - 1));
        state.currentIndex = nextIndex;
      }),
    updateRecord: (index, value) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        if (index < 0 || index >= activeFile.data.length) return;
        activeFile.data[index] = value;
      }),
    replaceActiveFileData: (data, saveHistory = true) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        
        // 保存当前状态到历史记录
        if (saveHistory && state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          // 深拷贝当前数据
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          // 限制历史记录数量
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          // 清空 future（新操作会清除重做历史）
          history.future = [];
        }
        
        activeFile.data = data;
        state.currentIndex = Math.max(
          0,
          Math.min(state.currentIndex, data.length - 1),
        );
      }),
    setActiveFileType: (type) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        activeFile.type = type;
      }),
    setActiveFileKeyOrder: (order) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        activeFile.keyOrder = order;
      }),
    setSelectedFieldKey: (key) =>
      set((state) => {
        state.selectedFieldKey = key;
      }),
    appendActiveRecord: (value) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        activeFile.data.push(value);
      }),
    updateActiveErrorRow: (index, raw) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !activeFile.errorRows) return;
        if (index < 0 || index >= activeFile.errorRows.length) return;
        activeFile.errorRows[index] = {
          ...activeFile.errorRows[index],
          raw,
        };
      }),
    resolveActiveErrorRow: (index, value) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !activeFile.errorRows) return;
        if (index < 0 || index >= activeFile.errorRows.length) return;
        activeFile.data.push(value);
        activeFile.errorRows.splice(index, 1);
      }),
    removeActiveErrorRow: (index) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !activeFile.errorRows) return;
        if (index < 0 || index >= activeFile.errorRows.length) return;
        activeFile.errorRows.splice(index, 1);
      }),
    toggleReadOnly: () =>
      set((state) => {
        state.readOnly = !state.readOnly;
      }),
    setViewMode: (mode) =>
      set((state) => {
        state.viewMode = mode;
      }),
    initDemoData: () => {
      const { files } = get();
      if (files.length > 0) return;
      set((state) => {
        state.files = [demoFile];
        state.activeFileId = demoFile.id;
        state.currentIndex = 0;
      });
    },
    setCacheReady: () =>
      set((state) => {
        state.cacheReady = true;
      }),
    undo: () => {
      const { activeFileId, files, history } = get();
      if (!activeFileId) return false;
      const fileHistory = history[activeFileId];
      if (!fileHistory || fileHistory.past.length === 0) return false;
      
      const activeFile = files.find((f) => f.id === activeFileId);
      if (!activeFile) return false;
      
      set((state) => {
        const h = state.history[activeFileId];
        const file = state.files.find((f) => f.id === activeFileId);
        if (!h || !file) return;
        
        // 保存当前状态到 future
        const currentEntry: HistoryEntry = {
          data: JSON.parse(JSON.stringify(file.data)),
          keyOrder: file.keyOrder ? [...file.keyOrder] : undefined,
        };
        h.future.push(currentEntry);
        
        // 恢复上一个状态
        const previousEntry = h.past.pop()!;
        file.data = previousEntry.data;
        if (previousEntry.keyOrder) {
          file.keyOrder = previousEntry.keyOrder;
        }
        
        state.currentIndex = Math.max(
          0,
          Math.min(state.currentIndex, file.data.length - 1),
        );
      });
      return true;
    },
    redo: () => {
      const { activeFileId, files, history } = get();
      if (!activeFileId) return false;
      const fileHistory = history[activeFileId];
      if (!fileHistory || fileHistory.future.length === 0) return false;
      
      const activeFile = files.find((f) => f.id === activeFileId);
      if (!activeFile) return false;
      
      set((state) => {
        const h = state.history[activeFileId];
        const file = state.files.find((f) => f.id === activeFileId);
        if (!h || !file) return;
        
        // 保存当前状态到 past
        const currentEntry: HistoryEntry = {
          data: JSON.parse(JSON.stringify(file.data)),
          keyOrder: file.keyOrder ? [...file.keyOrder] : undefined,
        };
        h.past.push(currentEntry);
        
        // 恢复下一个状态
        const nextEntry = h.future.pop()!;
        file.data = nextEntry.data;
        if (nextEntry.keyOrder) {
          file.keyOrder = nextEntry.keyOrder;
        }
        
        state.currentIndex = Math.max(
          0,
          Math.min(state.currentIndex, file.data.length - 1),
        );
      });
      return true;
    },
    canUndo: () => {
      const { activeFileId, history } = get();
      if (!activeFileId) return false;
      const fileHistory = history[activeFileId];
      return fileHistory ? fileHistory.past.length > 0 : false;
    },
    canRedo: () => {
      const { activeFileId, history } = get();
      if (!activeFileId) return false;
      const fileHistory = history[activeFileId];
      return fileHistory ? fileHistory.future.length > 0 : false;
    },
    getHistoryLength: () => {
      const { activeFileId, history } = get();
      if (!activeFileId) return { past: 0, future: 0 };
      const fileHistory = history[activeFileId];
      return fileHistory 
        ? { past: fileHistory.past.length, future: fileHistory.future.length }
        : { past: 0, future: 0 };
    },
    reorderKeys: (newOrder) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 重排所有记录的字段顺序
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const oldRecord = record as Record<string, unknown>;
          const newRecord: Record<string, unknown> = {};
          // 先按新顺序插入存在的字段
          newOrder.forEach((key) => {
            if (key in oldRecord) {
              newRecord[key] = oldRecord[key];
            }
          });
          // 再插入不在新顺序中的字段
          Object.keys(oldRecord).forEach((key) => {
            if (!(key in newRecord)) {
              newRecord[key] = oldRecord[key];
            }
          });
          return newRecord;
        });
        activeFile.keyOrder = newOrder;
      }),
    batchRenameField: (oldKey, newKey) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !oldKey || !newKey || oldKey === newKey) return;
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 重命名所有记录中的字段
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const oldRecord = record as Record<string, unknown>;
          if (!(oldKey in oldRecord)) return record;
          
          const newRecord: Record<string, unknown> = {};
          Object.keys(oldRecord).forEach((key) => {
            if (key === oldKey) {
              newRecord[newKey] = oldRecord[key];
            } else {
              newRecord[key] = oldRecord[key];
            }
          });
          return newRecord;
        });
        
        // 更新 keyOrder
        if (activeFile.keyOrder) {
          const idx = activeFile.keyOrder.indexOf(oldKey);
          if (idx !== -1) {
            activeFile.keyOrder[idx] = newKey;
          }
        }
      }),
    batchDeleteField: (key) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !key) return;
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 删除所有记录中的字段
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const oldRecord = record as Record<string, unknown>;
          const newRecord: Record<string, unknown> = {};
          Object.keys(oldRecord).forEach((k) => {
            if (k !== key) {
              newRecord[k] = oldRecord[k];
            }
          });
          return newRecord;
        });
        
        // 更新 keyOrder
        if (activeFile.keyOrder) {
          activeFile.keyOrder = activeFile.keyOrder.filter((k) => k !== key);
        }
      }),
    batchDeleteFields: (keys) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !keys || keys.length === 0) return;
        
        const keysSet = new Set(keys);
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 删除所有记录中的指定字段
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const oldRecord = record as Record<string, unknown>;
          const newRecord: Record<string, unknown> = {};
          Object.keys(oldRecord).forEach((k) => {
            if (!keysSet.has(k)) {
              newRecord[k] = oldRecord[k];
            }
          });
          return newRecord;
        });
        
        // 更新 keyOrder
        if (activeFile.keyOrder) {
          activeFile.keyOrder = activeFile.keyOrder.filter((k) => !keysSet.has(k));
        }
      }),
    batchRenameFields: (renameMap) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !renameMap || Object.keys(renameMap).length === 0) return;
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 重命名所有记录中的字段
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const oldRecord = record as Record<string, unknown>;
          const newRecord: Record<string, unknown> = {};
          
          Object.keys(oldRecord).forEach((oldKey) => {
            const newKey = renameMap[oldKey] ?? oldKey;
            // 如果新键名已存在（非当前键），进行覆盖
            newRecord[newKey] = oldRecord[oldKey];
          });
          
          return newRecord;
        });
        
        // 更新 keyOrder
        if (activeFile.keyOrder) {
          activeFile.keyOrder = activeFile.keyOrder.map((k) => renameMap[k] ?? k);
        }
      }),
    batchConvertField: (field, mode) => {
      let successCount = 0;
      let failedCount = 0;
      
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile || !field) {
          return;
        }
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 转换字段
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          
          const oldRecord = record as Record<string, unknown>;
          const value = oldRecord[field];
          
          if (value === undefined || value === null) {
            failedCount++;
            return record;
          }
          
          const newRecord = { ...oldRecord };
          
          if (mode === "parse") {
            // JSON 字符串 -> 对象
            if (typeof value === "string") {
              try {
                const parsed = JSON.parse(value);
                // 只替换对象和数组，忽略基本类型
                if (typeof parsed === "object" && parsed !== null) {
                  newRecord[field] = parsed;
                  successCount++;
                } else {
                  failedCount++;
                }
              } catch {
                // 解析失败，保持原值
                failedCount++;
              }
            } else {
              failedCount++;
            }
          } else {
            // 对象/数组 -> JSON 字符串
            if (typeof value === "object" && value !== null) {
              try {
                newRecord[field] = JSON.stringify(value);
                successCount++;
              } catch {
                failedCount++;
              }
            } else {
              failedCount++;
            }
          }
          
          return newRecord;
        });
      });
      
      return { success: successCount, failed: failedCount };
    },
    nestFields: (sourceFields, targetField) =>
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        const trimmedTarget = targetField.trim();
        const cleanedSource = Array.from(
          new Set(sourceFields.map((field) => field.trim()).filter(Boolean)),
        ).filter((field) => field !== trimmedTarget);
        if (!activeFile || !trimmedTarget || cleanedSource.length === 0) return;
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        const sourceSet = new Set(cleanedSource);
        
        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const next = { ...(record as Record<string, unknown>) };
          const existing = next[trimmedTarget];
          const targetObject =
            existing && typeof existing === "object" && !Array.isArray(existing)
              ? { ...(existing as Record<string, unknown>) }
              : {};
          sourceSet.forEach((field) => {
            targetObject[field] = next[field];
            delete next[field];
          });
          next[trimmedTarget] = targetObject;
          return next;
        });
        
        if (activeFile.keyOrder && activeFile.keyOrder.length > 0) {
          const nextOrder = activeFile.keyOrder.filter((key) => !sourceSet.has(key));
          if (!nextOrder.includes(trimmedTarget)) {
            nextOrder.push(trimmedTarget);
          }
          activeFile.keyOrder = nextOrder;
        }
      }),
    smartExtract: (field, config) => {
      const trimmedField = field.trim();
      let result = { matched: 0, columns: [] as string[] };
      if (!trimmedField) return result;
      
      set((state) => {
        const activeFile = state.files.find(
          (file) => file.id === state.activeFileId,
        );
        if (!activeFile) return;
        
        // 保存历史
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        let columns: string[] = [];
        let matched = 0;
        
        if (config.mode === "object") {
          if (config.expandAll) {
            const allKeys = new Set<string>();
            activeFile.data.forEach((record) => {
              if (!record || typeof record !== "object" || Array.isArray(record)) return;
              const value = (record as Record<string, unknown>)[trimmedField];
              const objectValue = normalizeObject(value);
              if (!objectValue) return;
              Object.keys(objectValue).forEach((key) => allKeys.add(key));
            });
            columns = Array.from(allKeys);
          } else {
            columns = config.keys.map((key) => key.trim()).filter(Boolean);
          }
          
          activeFile.data = activeFile.data.map((record) => {
            if (!record || typeof record !== "object" || Array.isArray(record)) {
              return record;
            }
            const next = { ...(record as Record<string, unknown>) };
            const objectValue = normalizeObject(next[trimmedField]);
            if (!objectValue) return next;
            matched += 1;
            columns.forEach((key) => {
              next[key] = key in objectValue ? objectValue[key] : null;
            });
            return next;
          });
        } else if (config.mode === "array_single") {
          const targetField = config.targetField.trim();
          columns = targetField ? [targetField] : [];
          
          activeFile.data = activeFile.data.map((record) => {
            if (!record || typeof record !== "object" || Array.isArray(record)) {
              return record;
            }
            const next = { ...(record as Record<string, unknown>) };
            if (!targetField) return next;
            const arrayValue = normalizeArray(next[trimmedField]);
            if (!arrayValue) {
              next[targetField] = null;
              return next;
            }
            const matchedItem = arrayValue.find((item) => {
              if (!item || typeof item !== "object") return false;
              const candidate = getValueByPath(
                item as Record<string, unknown>,
                config.matchKey,
              );
              return String(candidate ?? "") === config.matchValue;
            }) as Record<string, unknown> | undefined;
            if (!matchedItem) {
              next[targetField] = null;
              return next;
            }
            const extracted = getValueByPath(matchedItem, config.extractKey);
            next[targetField] = extracted ?? null;
            matched += 1;
            return next;
          });
        } else if (config.mode === "pivot_array") {
          const labelSet = new Set<string>();
          activeFile.data.forEach((record) => {
            if (!record || typeof record !== "object" || Array.isArray(record)) return;
            const arrayValue = normalizeArray(
              (record as Record<string, unknown>)[trimmedField],
            );
            if (!arrayValue) return;
            arrayValue.forEach((item) => {
              if (!item || typeof item !== "object") return;
              const label = getValueByPath(
                item as Record<string, unknown>,
                config.keyCol,
              );
              if (label === undefined || label === null) return;
              labelSet.add(String(label));
            });
          });
          
          columns = Array.from(labelSet);
          
          activeFile.data = activeFile.data.map((record) => {
            if (!record || typeof record !== "object" || Array.isArray(record)) {
              return record;
            }
            const next = { ...(record as Record<string, unknown>) };
            const arrayValue = normalizeArray(next[trimmedField]);
            const lookup: Record<string, unknown> = {};
            if (arrayValue) {
              arrayValue.forEach((item) => {
                if (!item || typeof item !== "object") return;
                const label = getValueByPath(
                  item as Record<string, unknown>,
                  config.keyCol,
                );
                if (label === undefined || label === null) return;
                const value = getValueByPath(
                  item as Record<string, unknown>,
                  config.valueCol,
                );
                lookup[String(label)] = value;
              });
            }
            let rowMatched = false;
            columns.forEach((col) => {
              if (Object.prototype.hasOwnProperty.call(lookup, col)) {
                rowMatched = true;
              }
              next[col] = lookup[col] ?? null;
            });
            if (rowMatched) matched += 1;
            return next;
          });
        } else if (config.mode === "nested_tags") {
          const targetField = config.targetField.trim();
          const nestedKeys = config.nestedKeys ?? ["tags", "labels", "annotations", "attributes"];
          const labelKey = config.labelKey ?? "label";
          const valueKey = config.valueKey ?? "value";
          columns = targetField ? [targetField] : [];
          
          activeFile.data = activeFile.data.map((record) => {
            if (!record || typeof record !== "object" || Array.isArray(record)) {
              return record;
            }
            const next = { ...(record as Record<string, unknown>) };
            if (!targetField) return next;
            const parsed = parseMaybeJSON(next[trimmedField]);
            const foundValue = findNestedTagValueDeep(
              parsed,
              config.label,
              nestedKeys,
              labelKey,
              valueKey,
            );
            if (foundValue !== undefined && foundValue !== null) {
              matched += 1;
            }
            next[targetField] = foundValue ?? null;
            return next;
          });
        }
        
        if (activeFile.keyOrder && activeFile.keyOrder.length > 0 && columns.length > 0) {
          const existing = new Set(activeFile.keyOrder);
          const nextOrder = [...activeFile.keyOrder];
          columns.forEach((col) => {
            if (!existing.has(col)) {
              nextOrder.push(col);
            }
          });
          activeFile.keyOrder = nextOrder;
        }
        
        result = { matched, columns };
      });
      
      return result;
    },
    extractByPath: (field, config) => {
      const trimmedField = field.trim();
      const outputField = config.outputField.trim();
      let result = { matched: 0, columns: [] as string[] };
      if (!trimmedField || !outputField) return result;

      set((state) => {
        const activeFile = state.files.find((file) => file.id === state.activeFileId);
        if (!activeFile) return;

        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(activeFile.data)),
            keyOrder: activeFile.keyOrder ? [...activeFile.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }

        let matched = 0;
        const columns = [outputField];

        activeFile.data = activeFile.data.map((record) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            return record;
          }
          const next = { ...(record as Record<string, unknown>) };
          const rootValue = getValueAtPath(next, trimmedField);
          let current = traverseByPath(rootValue, config.path);

          if (config.filter && Array.isArray(current)) {
            const match = current.find((item) => {
              const parsed = parseMaybeJSON(item);
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
              const candidate = getValueByPath(parsed as Record<string, unknown>, config.filter!.key);
              return String(candidate ?? "") === config.filter!.value;
            }) as Record<string, unknown> | undefined;
            current = match ?? null;
          }

          let extracted: unknown = null;
          const targetKey = config.target?.trim() ?? "";
          if (targetKey) {
            if (Array.isArray(current)) {
              const values = current
                .map((item) => {
                  const parsed = parseMaybeJSON(item);
                  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
                  return getValueByPath(parsed as Record<string, unknown>, targetKey);
                })
                .filter((value) => value !== undefined);
              extracted = values.length > 0 ? values : null;
            } else if (current && typeof current === "object") {
              extracted = getValueByPath(current as Record<string, unknown>, targetKey);
            } else {
              extracted = null;
            }
          } else {
            extracted = current ?? null;
          }

          if (extracted !== null && extracted !== undefined) {
            matched += 1;
          }
          next[outputField] = extracted ?? null;
          return next;
        });

        if (activeFile.keyOrder && activeFile.keyOrder.length > 0) {
          if (!activeFile.keyOrder.includes(outputField)) {
            activeFile.keyOrder = [...activeFile.keyOrder, outputField];
          }
        }

        result = { matched, columns };
      });

      return result;
    },
    setSearchQuery: (query) => {
      set((state) => {
        state.searchQuery = query;
      });
      get().recalculateFilteredData();
    },
    addFilterRule: (rule, options) => {
      set((state) => {
        const { groupId, forceNewGroup } = options ?? {};
        
        if (groupId) {
          // 添加到指定组
          const group = state.filterGroups.find((g) => g.id === groupId);
          if (group) {
            group.rules.push(rule);
          }
        } else if (forceNewGroup) {
          // 强制创建新组（AND 逻辑）
          state.filterGroups.push({
            id: crypto.randomUUID(),
            rules: [rule],
          });
        } else {
          // 默认行为：同字段规则自动归入同组（OR 逻辑）
          const existingGroup = state.filterGroups.find((g) =>
            g.rules.some((r) => r.field === rule.field)
          );
          if (existingGroup) {
            existingGroup.rules.push(rule);
          } else {
            // 创建新组
            state.filterGroups.push({
              id: crypto.randomUUID(),
              rules: [rule],
            });
          }
        }
      });
      get().recalculateFilteredData();
    },
    removeFilterRule: (ruleId) => {
      set((state) => {
        state.filterGroups.forEach((group) => {
          group.rules = group.rules.filter((r) => r.id !== ruleId);
        });
        // 移除空组
        state.filterGroups = state.filterGroups.filter((g) => g.rules.length > 0);
      });
      get().recalculateFilteredData();
    },
    removeFilterGroup: (groupId) => {
      set((state) => {
        state.filterGroups = state.filterGroups.filter((g) => g.id !== groupId);
      });
      get().recalculateFilteredData();
    },
    clearAllFilters: () => {
      set((state) => {
        state.searchQuery = "";
        state.filterGroups = [];
        state.filteredIndices = [];
        state.currentIndex = 0;
      });
    },
    recalculateFilteredData: () => {
      const { files, activeFileId, searchQuery, filterGroups } = get();
      const activeFile = files.find((f) => f.id === activeFileId);
      if (!activeFile) {
        set((state) => {
          state.filteredIndices = [];
          state.currentIndex = 0;
        });
        return;
      }
      
      const data = activeFile.data;
      const allRules = filterGroups.flatMap((g) => g.rules);
      const hasFilters = searchQuery.trim() !== "" || allRules.length > 0;
      
      if (!hasFilters) {
        set((state) => {
          state.filteredIndices = [];
          state.currentIndex = Math.min(state.currentIndex, data.length - 1);
        });
        return;
      }
      
      const matchedIndices: number[] = [];
      
      // 规则检查函数
      const checkRule = (rec: Record<string, unknown>, rule: FilterRule): boolean => {
        const fieldValue = String(rec[rule.field] ?? "");
        switch (rule.operator) {
          case "contains":
            return fieldValue.toLowerCase().includes(rule.value.toLowerCase());
          case "equals":
            return fieldValue === rule.value;
          case "startsWith":
            return fieldValue.toLowerCase().startsWith(rule.value.toLowerCase());
          case "endsWith":
            return fieldValue.toLowerCase().endsWith(rule.value.toLowerCase());
          case "notContains":
            return !fieldValue.toLowerCase().includes(rule.value.toLowerCase());
          case "isEmpty":
            return !fieldValue || fieldValue.trim() === "";
          case "isNotEmpty":
            return Boolean(fieldValue && fieldValue.trim() !== "");
          default:
            return true;
        }
      };
      
      data.forEach((record, index) => {
        if (!record || typeof record !== "object") return;
        
        // 搜索查询检查
        let matchesSearch = true;
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          matchesSearch = JSON.stringify(record).toLowerCase().includes(query);
        }
        
        if (!matchesSearch) return;
        
        // 过滤规则检查：组间 AND，组内 OR
        if (filterGroups.length === 0) {
          matchedIndices.push(index);
          return;
        }
        
        const rec = record as Record<string, unknown>;
        
        // 每个组必须至少有一个规则匹配（AND 逻辑）
        const passesAllGroups = filterGroups.every((group) => {
          if (group.rules.length === 0) return true;
          // 组内任一规则匹配即可（OR 逻辑）
          return group.rules.some((rule) => checkRule(rec, rule));
        });
        
        if (passesAllGroups) {
          matchedIndices.push(index);
        }
      });
      
      set((state) => {
        state.filteredIndices = matchedIndices;
        // 重置 currentIndex 防止越界
        state.currentIndex = 0;
      });
    },
    getFilteredData: () => {
      const { files, activeFileId, searchQuery, filterGroups, filteredIndices } = get();
      const activeFile = files.find((f) => f.id === activeFileId);
      if (!activeFile) return [];
      
      const allRules = filterGroups.flatMap((g) => g.rules);
      const hasFilters = searchQuery.trim() !== "" || allRules.length > 0;
      if (!hasFilters) {
        return activeFile.data;
      }
      
      return filteredIndices.map((idx) => activeFile.data[idx]);
    },
    getOriginalIndex: (filteredIndex) => {
      const { filteredIndices, searchQuery, filterGroups } = get();
      const allRules = filterGroups.flatMap((g) => g.rules);
      const hasFilters = searchQuery.trim() !== "" || allRules.length > 0;
      if (!hasFilters) {
        return filteredIndex;
      }
      return filteredIndices[filteredIndex] ?? filteredIndex;
    },
    isFiltered: () => {
      const { searchQuery, filterGroups } = get();
      const allRules = filterGroups.flatMap((g) => g.rules);
      return searchQuery.trim() !== "" || allRules.length > 0;
    },
    commitFilterToData: () => {
      const { files, activeFileId, filteredIndices, searchQuery, filterGroups } = get();
      const activeFile = files.find((f) => f.id === activeFileId);
      
      // 验证：必须有激活文件且有筛选条件
      const allRules = filterGroups.flatMap((g) => g.rules);
      const hasFilter = searchQuery.trim() !== "" || allRules.length > 0;
      
      if (!activeFile || !hasFilter) {
        return false;
      }
      
      // 获取筛选后的数据
      const filteredData = filteredIndices.length > 0
        ? filteredIndices.map((i) => activeFile.data[i])
        : activeFile.data;
      
      set((state) => {
        const file = state.files.find((f) => f.id === state.activeFileId);
        if (!file) return;
        
        // 保存历史（支持撤销）
        if (state.activeFileId) {
          if (!state.history[state.activeFileId]) {
            state.history[state.activeFileId] = { past: [], future: [] };
          }
          const history = state.history[state.activeFileId];
          const currentEntry: HistoryEntry = {
            data: JSON.parse(JSON.stringify(file.data)),
            keyOrder: file.keyOrder ? [...file.keyOrder] : undefined,
          };
          history.past.push(currentEntry);
          if (history.past.length > MAX_HISTORY) {
            history.past.shift();
          }
          history.future = [];
        }
        
        // 覆盖原数据
        file.data = JSON.parse(JSON.stringify(filteredData));
        
        // 清空所有筛选条件
        state.searchQuery = "";
        state.filterGroups = [];
        state.filteredIndices = [];
        state.currentIndex = 0;
      });
      
      return true;
    },
    getAllFilterRules: () => {
      const { filterGroups } = get();
      return filterGroups.flatMap((g) => g.rules);
    },
    getGroupForField: (field) => {
      const { filterGroups } = get();
      return filterGroups.find((g) => g.rules.some((r) => r.field === field));
    },
    mergeFilesToNew: (options) => {
      const { files, selectedFileIds, activeFileId } = get();
      
      // 确定要合并的文件 ID
      const targetIds = selectedFileIds.length > 1 
        ? selectedFileIds 
        : (activeFileId ? [activeFileId] : []);
      
      if (targetIds.length < 2) {
        return null; // 需要至少 2 个文件
      }
      
      const addSourceTag = options?.addSourceTag ?? true;
      const sourceTagField = options?.sourceTagField ?? "_source";
      
      // 收集所有数据
      const mergedData: unknown[] = [];
      const sourceFiles = files.filter((f) => targetIds.includes(f.id));
      
      sourceFiles.forEach((file) => {
        file.data.forEach((record) => {
          if (addSourceTag && record && typeof record === "object" && !Array.isArray(record)) {
            // 添加来源标记
            mergedData.push({
              ...record as Record<string, unknown>,
              [sourceTagField]: file.name,
            });
          } else {
            mergedData.push(record);
          }
        });
      });
      
      // 创建新文件
      const newFileId = crypto.randomUUID();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const newFile: FileSource = {
        id: newFileId,
        name: `merged_${timestamp}.json`,
        size: JSON.stringify(mergedData).length,
        type: "json",
        data: mergedData,
        sourceFileIds: targetIds, // 保存源文件 ID 列表
      };
      
      set((state) => {
        state.files.push(newFile);
        state.history[newFileId] = { past: [], future: [] };
        state.activeFileId = newFileId;
        state.selectedFileIds = [];
        state.currentIndex = 0;
        // 清空过滤器
        state.searchQuery = "";
        state.filterGroups = [];
        state.filteredIndices = [];
      });
      
      return newFile;
    },
    duplicateFile: (fileId, newName) => {
      const { files } = get();
      const sourceFile = files.find((f) => f.id === fileId);
      
      if (!sourceFile) return null;
      
      const newFileId = crypto.randomUUID();
      const duplicatedFile: FileSource = {
        id: newFileId,
        name: newName ?? `${sourceFile.name.replace(/\.[^.]+$/, "")}_copy.json`,
        size: sourceFile.size,
        type: sourceFile.type,
        data: JSON.parse(JSON.stringify(sourceFile.data)),
        keyOrder: sourceFile.keyOrder ? [...sourceFile.keyOrder] : undefined,
      };
      
      set((state) => {
        state.files.push(duplicatedFile);
        state.history[newFileId] = { past: [], future: [] };
        state.activeFileId = newFileId;
        state.currentIndex = 0;
      });
      
      return duplicatedFile;
    },
    renameFile: (fileId, newName) => {
      set((state) => {
        const file = state.files.find((f) => f.id === fileId);
        if (file && newName.trim()) {
          file.name = newName.trim();
        }
      });
    },
  })),
);

function normalizeArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function parseMaybeJSON(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getValueByPath(target: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = target;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function getValueAtPath(target: Record<string, unknown>, path: string): unknown {
  return getValueByPath(target, path);
}

function traverseByPath(value: unknown, path: string[]): unknown {
  let current: unknown = parseMaybeJSON(value);
  for (const segment of path) {
    current = parseMaybeJSON(current);
    if (Array.isArray(current)) {
      const nextValues: unknown[] = [];
      current.forEach((item) => {
        const parsedItem = parseMaybeJSON(item);
        if (!parsedItem || typeof parsedItem !== "object" || Array.isArray(parsedItem)) return;
        const child = (parsedItem as Record<string, unknown>)[segment];
        if (child !== undefined) {
          const parsedChild = parseMaybeJSON(child);
          if (Array.isArray(parsedChild)) {
            parsedChild.forEach((inner) => nextValues.push(inner));
          } else {
            nextValues.push(parsedChild);
          }
        }
      });
      current = nextValues;
      continue;
    }
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function findNestedTagValueDeep(
  value: unknown,
  targetLabel: string,
  nestedKeys: string[],
  labelKey: string,
  valueKey: string,
): unknown {
  const parsed = parseMaybeJSON(value);
  if (!parsed || typeof parsed !== "object") return undefined;
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findNestedTagValueDeep(item, targetLabel, nestedKeys, labelKey, valueKey);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (nestedKeys.includes(key)) {
      const nestedArray = normalizeArray(parseMaybeJSON(child));
      if (nestedArray) {
        const match = nestedArray.find((tagItem) => {
          if (!tagItem || typeof tagItem !== "object") return false;
          const label = getValueByPath(tagItem as Record<string, unknown>, labelKey);
          return String(label ?? "") === targetLabel;
        }) as Record<string, unknown> | undefined;
        if (match) {
          const valueFound = getValueByPath(match, valueKey);
          return valueFound === undefined ? null : valueFound;
        }
      }
    }
    const found = findNestedTagValueDeep(child, targetLabel, nestedKeys, labelKey, valueKey);
    if (found !== undefined) return found;
  }
  return undefined;
}

