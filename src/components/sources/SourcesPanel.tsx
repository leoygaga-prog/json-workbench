import { useEffect, useMemo, useRef, useState } from "react";
import JSONbig from "json-bigint";
import { CheckSquare, Square, Trash2, UploadCloud, Merge, Copy, X, GitMerge, FileText, Edit2, ChevronRight, ChevronDown, Database } from "lucide-react";
import { useFileStore } from "../../store/fileStore";
import { cacheFile, enforceCacheLimit, loadCachedFiles, removeFileFromCache } from "../../utils/indexedDb";
import { DataWorkerClient } from "../../utils/workerClient";
import type { WorkerParsePayload } from "../../workers/dataWorker";
import DataInsightsPanel from "./DataInsightsPanel";
import ConfirmDialog from "../ui/ConfirmDialog";

export default function SourcesPanel() {
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const selectedFileIds = useFileStore((state) => state.selectedFileIds);
  const setActiveFile = useFileStore((state) => state.setActiveFile);
  const addFile = useFileStore((state) => state.addFile);
  const setFiles = useFileStore((state) => state.setFiles);
  const removeFile = useFileStore((state) => state.removeFile);
  const toggleFileSelection = useFileStore((state) => state.toggleFileSelection);
  const clearSelection = useFileStore((state) => state.clearSelection);
  const setCacheReady = useFileStore((state) => state.setCacheReady);
  const updateActiveErrorRow = useFileStore((state) => state.updateActiveErrorRow);
  const resolveActiveErrorRow = useFileStore((state) => state.resolveActiveErrorRow);
  const removeActiveErrorRow = useFileStore((state) => state.removeActiveErrorRow);
  const mergeFilesToNew = useFileStore((state) => state.mergeFilesToNew);
  const duplicateFile = useFileStore((state) => state.duplicateFile);
  const renameFile = useFileStore((state) => state.renameFile);
  const [loading, setLoading] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [progressStage, setProgressStage] = useState<string>("");
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixEdits, setFixEdits] = useState<Record<number, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<DataWorkerClient | null>(null);
  const jsonParser = useMemo(() => JSONbig({ storeAsString: true }), []);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? null,
    [files, activeFileId],
  );

  useEffect(() => {
    let active = true;
    loadCachedFiles()
      .then((cached) => {
        if (!active) return;
        if (cached.length > 0) {
          setFiles(cached);
        }
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage("IndexedDB 缓存加载失败");
      })
      .finally(() => {
        if (!active) return;
        setCacheReady();
      });
    return () => {
      active = false;
    };
  }, [setCacheReady, setFiles]);

  const handleUploadClick = () => {
    inputRef.current?.click();
  };

  const handleFileUpload = async (filesToProcess: File[]) => {
    if (filesToProcess.length === 0) return;
    setLoading(true);
    setErrorMessage(null);
    setProgressPercent(0);
    
    const totalFiles = filesToProcess.length;
    
    try {
      if (!workerRef.current) {
        workerRef.current = new DataWorkerClient();
      }
      
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        setProgressStage(`${file.name} (${i + 1}/${totalFiles})`);
        
        const payload = await buildParsePayload(file);
        const response = await workerRef.current.request(
          {
            id: crypto.randomUUID(),
            type: "parse",
            payload,
          },
          (progress) => {
            if (progress.type === "progress") {
              // 计算总体进度
              const fileProgress = progress.payload.percent;
              const overallProgress = ((i * 100) + fileProgress) / totalFiles;
              setProgressPercent(Math.round(overallProgress));
            }
          },
        );
        
        if (response.type === "parse") {
          const newFile = {
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: payload.kind,
            data: response.payload.data,
            errorRows: response.payload.errors,
          };
          addFile(newFile);
          await cacheFile(newFile);
          await enforceCacheLimit();
        } else if (response.type === "error") {
          setErrorMessage(`${file.name}: ${response.payload.message}`);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "解析失败");
    } finally {
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    await handleFileUpload(Array.from(fileList));
    event.target.value = "";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (droppedFiles.length === 0) return;
    await handleFileUpload(droppedFiles);
  };

  const handleOpenFix = () => {
    setFixEdits({});
    setShowFixModal(true);
  };

  const handleFixChange = (index: number, raw: string) => {
    setFixEdits((prev) => ({ ...prev, [index]: raw }));
    updateActiveErrorRow(index, raw);
  };

  const handleFixApply = async (index: number) => {
    if (!activeFile || !activeFile.errorRows) return;
    const row = activeFile.errorRows[index];
    if (!row) return;
    const raw = fixEdits[index] ?? row.raw;
    try {
      const parsed = jsonParser.parse(raw);
      resolveActiveErrorRow(index, parsed);
      await cacheFile({
        ...activeFile,
        data: [...activeFile.data, parsed],
        errorRows: activeFile.errorRows.filter((_, idx) => idx !== index),
      });
      await enforceCacheLimit();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "修复失败");
    }
  };

  const handleFixRemove = async (index: number) => {
    if (!activeFile || !activeFile.errorRows) return;
    removeActiveErrorRow(index);
    await cacheFile({
      ...activeFile,
      errorRows: activeFile.errorRows.filter((_, idx) => idx !== index),
    });
    await enforceCacheLimit();
  };

  const handleDeleteFile = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    removeFile(fileId);
    await removeFileFromCache(fileId);
  };

  const handleMergeFiles = () => {
    const targetCount = selectedFileIds.length > 1 ? selectedFileIds.length : 0;
    if (targetCount < 2) {
      setErrorMessage("请先选择至少 2 个文件");
      return;
    }
    setIsMergeDialogOpen(true);
  };

  const handleMergeConfirm = async () => {
    const newFile = mergeFilesToNew({ addSourceTag: true, sourceTagField: "_source" });
    if (newFile) {
      await cacheFile(newFile);
      await enforceCacheLimit();
    }
    setIsMergeDialogOpen(false);
  };

  const handleDuplicateFile = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    const newFile = duplicateFile(fileId);
    if (newFile) {
      await cacheFile(newFile);
      await enforceCacheLimit();
    }
  };

  const handleStartEditFileName = (e: React.MouseEvent, fileId: string, currentName: string) => {
    e.stopPropagation();
    setEditingFileId(fileId);
    setEditFileName(currentName);
  };

  const handleSaveFileName = async (fileId: string) => {
    if (editFileName.trim() && editFileName.trim() !== "") {
      renameFile(fileId, editFileName.trim());
      const file = files.find((f) => f.id === fileId);
      if (file) {
        await cacheFile({ ...file, name: editFileName.trim() });
      }
    }
    setEditingFileId(null);
    setEditFileName("");
  };

  const handleCancelEditFileName = () => {
    setEditingFileId(null);
    setEditFileName("");
  };

  const toggleExpand = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent switching active file when clicking arrow
    const newSet = new Set(expandedFiles);
    if (newSet.has(fileId)) {
      newSet.delete(fileId);
    } else {
      newSet.add(fileId);
    }
    setExpandedFiles(newSet);
  };

  return (
    <div className="panel sources-panel-split">
      {/* 上半部分：文件列表 */}
      <div className="sources-panel-top">
        <div
          className={`upload-dropzone ${isDragging ? "upload-dropzone--dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging ? (
            <div className="upload-dropzone-overlay">
              <UploadCloud size={28} />
              <span>释放以上传文件</span>
            </div>
          ) : (
            <>
              <div className="panel-header panel-header-modern panel-header-blue">
                <div className="panel-header-left">
                  <div className="panel-header-icon-box panel-header-icon-box-blue">
                    <Database size={20} className="panel-header-icon panel-header-icon-blue" />
                  </div>
                  <div className="panel-header-text">
                    <h2 className="panel-title-modern">数据源</h2>
                    <span className="panel-subtitle-modern">多文件 · JSON/JSONL/XLSX</span>
                  </div>
                </div>
              </div>
              <div className="upload-button-wrapper">
                <button
                  className="button primary button-full"
                  type="button"
                  onClick={handleUploadClick}
                  disabled={loading}
                >
                  <UploadCloud size={16} />
                  {loading ? "解析中..." : "上传文件"}
                </button>
              </div>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.jsonl,.xlsx,.xls"
          hidden
          multiple
          onChange={handleFileChange}
        />
        
        <div className={`list file-list ${selectedFileIds.length > 0 ? "has-selection" : ""}`}>
          {files.map((file) => {
            const isSelected = selectedFileIds.includes(file.id);
            const isActive = activeFileId === file.id;
            const isEditing = editingFileId === file.id;
            const isMerged = file.sourceFileIds && file.sourceFileIds.length > 0;
            const isExpanded = expandedFiles.has(file.id);
            const sourceFiles = isMerged && file.sourceFileIds
              ? files.filter((f) => file.sourceFileIds!.includes(f.id))
              : [];
            
            return (
              <div key={file.id}>
                <div
                  className={`file-item-gmail ${isActive ? "viewing" : ""} ${isSelected ? "checked" : ""}`}
                  onClick={() => !isEditing && setActiveFile(file.id)}
                >
                  {/* 复选框 - 悬停或有选中时显示 */}
                  <button
                    type="button"
                    className="file-checkbox-gmail"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFileSelection(file.id);
                    }}
                  >
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                  
                  {/* 文件图标和名称 */}
                  <div className="file-info-gmail">
                    <div className="file-name-row">
                      {/* 展开/折叠按钮（仅合并文件） */}
                      {isMerged && (
                        <button
                          type="button"
                          className="file-expand-btn"
                          onClick={(e) => toggleExpand(file.id, e)}
                          title={isExpanded ? "折叠源文件列表" : "展开源文件列表"}
                        >
                          {isExpanded ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                      )}
                      
                      {/* 类型图标 */}
                      {isMerged ? (
                        <GitMerge size={14} className="file-type-icon merged" />
                      ) : (
                        <FileText size={14} className="file-type-icon" />
                      )}
                      
                      {/* 文件名编辑或显示 */}
                      {isEditing ? (
                        <input
                          type="text"
                          value={editFileName}
                          onChange={(e) => setEditFileName(e.target.value)}
                          onBlur={() => handleSaveFileName(file.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveFileName(file.id);
                            } else if (e.key === "Escape") {
                              handleCancelEditFileName();
                            }
                          }}
                          className="file-name-input"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="file-name-content">
                          <strong
                            className="file-name-text"
                            onDoubleClick={(e) => handleStartEditFileName(e, file.id, file.name)}
                          >
                            {file.name}
                          </strong>
                          {/* 合并文件来源提示 */}
                          {isMerged && file.sourceFileIds && (
                            <span className="file-merged-hint" title={`合并自 ${file.sourceFileIds.length} 个文件`}>
                              合并自 {file.sourceFileIds.length} 个文件
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <span className="file-meta">
                      {file.type.toUpperCase()} · {file.data.length} 条
                    </span>
                    {file.errorRows && file.errorRows.length > 0 && (
                      <span className="file-error">错误：{file.errorRows.length}</span>
                    )}
                  </div>
                  
                  {/* 右侧：查看指示器 + 操作按钮 */}
                  <div className="file-right-section">
                    {isActive && (
                      <span className="file-current-badge">当前</span>
                    )}
                    <div className="file-actions-gmail">
                      {!isEditing && (
                        <button
                          type="button"
                          className="file-action-btn file-action-btn--edit"
                          onClick={(e) => handleStartEditFileName(e, file.id, file.name)}
                          title="重命名"
                        >
                          <Edit2 size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="file-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateFile(e, file.id);
                        }}
                        title="复制文件"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        className="file-action-btn file-action-btn--danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(e, file.id);
                        }}
                        title="删除文件"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* 源文件列表（展开时显示） */}
                {isMerged && isExpanded && sourceFiles.length > 0 && (
                  <div className="file-source-list">
                    {sourceFiles.map((sourceFile) => (
                      <div
                        key={sourceFile.id}
                        className="file-source-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFile(sourceFile.id);
                        }}
                      >
                        <div className="file-source-indent" />
                        <FileText size={12} className="file-source-icon" />
                        <span className="file-source-name">{sourceFile.name}</span>
                        <span className="file-source-meta">{sourceFile.data.length} 条</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {files.length === 0 && (
            <div className="card">暂无文件。</div>
          )}
          
          {/* 底部浮动操作栏 - Gmail 风格 */}
          {selectedFileIds.length > 0 && (
            <div className="batch-action-bar">
              <div className="batch-action-header">
                <span>已选择 {selectedFileIds.length} 个文件</span>
                <button
                  className="batch-action-close"
                  type="button"
                  onClick={clearSelection}
                  title="取消选择"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="batch-action-buttons">
                {selectedFileIds.length >= 2 && (
                  <button
                    className="batch-action-btn primary"
                    type="button"
                    onClick={handleMergeFiles}
                  >
                    <Merge size={14} />
                    <span>合并</span>
                  </button>
                )}
                <button
                  className="batch-action-btn danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm(`确定要删除选中的 ${selectedFileIds.length} 个文件吗？`)) {
                      selectedFileIds.forEach(async (id) => {
                        removeFile(id);
                        await removeFileFromCache(id);
                      });
                      clearSelection();
                    }
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
              </div>
            </div>
          )}
        </div>
        {activeFile?.errorRows && activeFile.errorRows.length > 0 && (
          <button className="button" type="button" onClick={handleOpenFix}>
            修复错误行（{activeFile.errorRows.length}）
          </button>
        )}
        {progressPercent !== null && (
          <div className="card">
            解析中... {progressPercent}% {progressStage && `(${progressStage})`}
          </div>
        )}
        {errorMessage && <div className="card">{errorMessage}</div>}
      </div>

      {/* 分隔线 */}
      <div className="sources-panel-divider" />

      {/* 下半部分：数据洞察 */}
      <div className="sources-panel-bottom">
        <DataInsightsPanel />
      </div>

      {/* 合并文件确认对话框 */}
      <ConfirmDialog
        isOpen={isMergeDialogOpen}
        title="确认合并文件"
        description={
          <>
            将合并 <strong>{selectedFileIds.length}</strong> 个文件，创建一个新文件。
            <br />
            新文件将包含所有选中文件的数据，并添加来源标记 (<strong>_source</strong>)。
          </>
        }
        confirmText="合并"
        cancelText="取消"
        variant="primary"
        undoable={false}
        onConfirm={handleMergeConfirm}
        onCancel={() => setIsMergeDialogOpen(false)}
      />

      {showFixModal && activeFile?.errorRows && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="panel-header">
              <div>
                <div className="panel-title">错误行</div>
                <div className="panel-hint">逐行修复 JSONL 错误</div>
              </div>
              <button className="button" type="button" onClick={() => setShowFixModal(false)}>
                关闭
              </button>
            </div>
            <div className="error-list">
              {activeFile.errorRows.map((row, index) => (
                <div key={`${row.line}-${index}`} className="error-row">
                  <div className="error-meta">
                    行 {row.line} · {row.message}
                  </div>
                  <textarea
                    value={fixEdits[index] ?? row.raw}
                    onChange={(e) => handleFixChange(index, e.target.value)}
                    rows={3}
                  />
                  <div className="button-row">
                    <button className="button" type="button" onClick={() => handleFixApply(index)}>
                      校验并添加
                    </button>
                    <button className="button" type="button" onClick={() => handleFixRemove(index)}>
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function buildParsePayload(file: File): Promise<WorkerParsePayload> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".jsonl")) {
    return { kind: "jsonl", text: await file.text() };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return { kind: "xlsx", buffer: await file.arrayBuffer() };
  }
  return { kind: "json", text: await file.text() };
}

