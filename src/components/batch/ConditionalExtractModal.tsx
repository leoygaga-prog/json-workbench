interface ConditionalExtractModalProps {
  isOpen: boolean;
  sourceFields: string[];
  sourceField: string;
  matchKey: string;
  matchValue: string;
  extractKey: string;
  targetField: string;
  previewKeys: string[];
  onSourceFieldChange: (value: string) => void;
  onMatchKeyChange: (value: string) => void;
  onMatchValueChange: (value: string) => void;
  onExtractKeyChange: (value: string) => void;
  onTargetFieldChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
}

export default function ConditionalExtractModal({
  isOpen,
  sourceFields,
  sourceField,
  matchKey,
  matchValue,
  extractKey,
  targetField,
  previewKeys,
  onSourceFieldChange,
  onMatchKeyChange,
  onMatchValueChange,
  onExtractKeyChange,
  onTargetFieldChange,
  onCancel,
  onConfirm,
  confirmDisabled,
  loading,
}: ConditionalExtractModalProps) {
  if (!isOpen) return null;

  const matchKeySelectValue = previewKeys.includes(matchKey) ? matchKey : "__custom__";
  const extractKeySelectValue = previewKeys.includes(extractKey) ? extractKey : "__custom__";

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="panel-header">
          <div>
            <div className="panel-title">按条件从数组提取 (Extract by Condition)</div>
            <div className="panel-hint">从数组对象中匹配条件并提取字段为新列。</div>
          </div>
          <button className="button" type="button" onClick={onCancel}>
            关闭
          </button>
        </div>

        <div className="form-grid">
          <label>
            来源字段
            <select value={sourceField} onChange={(e) => onSourceFieldChange(e.target.value)}>
              <option value="">选择</option>
              {sourceFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </label>

          <div className="card">
            <div className="panel-title">匹配条件</div>
            <div className="form-grid">
              <label>
                If item["Key"]
                <select
                  value={matchKeySelectValue}
                  onChange={(e) => {
                    const next = e.target.value;
                    onMatchKeyChange(next === "__custom__" ? "" : next);
                  }}
                >
                  <option value="">选择</option>
                  {previewKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                  <option value="__custom__">自定义...</option>
                </select>
                {matchKeySelectValue === "__custom__" && (
                  <input
                    value={matchKey}
                    onChange={(e) => onMatchKeyChange(e.target.value)}
                    placeholder="输入匹配 Key"
                  />
                )}
              </label>
              <label>
                等于 "Value"
                <input value={matchValue} onChange={(e) => onMatchValueChange(e.target.value)} />
              </label>
            </div>
          </div>

          <label>
            提取 item["Key"]
            <select
              value={extractKeySelectValue}
              onChange={(e) => {
                const next = e.target.value;
                onExtractKeyChange(next === "__custom__" ? "" : next);
              }}
            >
              <option value="">选择</option>
              {previewKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
              <option value="__custom__">自定义...</option>
            </select>
            {extractKeySelectValue === "__custom__" && (
              <input
                value={extractKey}
                onChange={(e) => onExtractKeyChange(e.target.value)}
                placeholder="输入提取 Key"
              />
            )}
          </label>

          <label>
            保存到字段名
            <input value={targetField} onChange={(e) => onTargetFieldChange(e.target.value)} />
          </label>

          {previewKeys.length > 0 && (
            <div className="card">
              <div className="panel-hint">检测到的 keys：{previewKeys.join(", ")}</div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="button" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="button primary"
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
