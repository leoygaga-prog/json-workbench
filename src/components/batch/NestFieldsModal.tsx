interface NestFieldsModalProps {
  isOpen: boolean;
  availableFields: string[];
  targetField: string;
  selectedFields: string[];
  onTargetFieldChange: (value: string) => void;
  onToggleField: (field: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
}

export default function NestFieldsModal({
  isOpen,
  availableFields,
  targetField,
  selectedFields,
  onTargetFieldChange,
  onToggleField,
  onSelectAll,
  onDeselectAll,
  onCancel,
  onConfirm,
  confirmDisabled,
  loading,
}: NestFieldsModalProps) {
  if (!isOpen) return null;

  const allSelected =
    availableFields.length > 0 && selectedFields.length === availableFields.length;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="panel-header">
          <div>
            <div className="panel-title">字段嵌套 (Nest Fields)</div>
            <div className="panel-hint">Select fields to move into a new or existing object.</div>
          </div>
          <button className="button" type="button" onClick={onCancel}>
            关闭
          </button>
        </div>

        <div className="form-grid">
          <label>
            Target Field Name
            <input
              value={targetField}
              onChange={(e) => onTargetFieldChange(e.target.value)}
              placeholder="extra_info"
            />
          </label>

          <div className="card">
            <div className="panel-header">
              <div className="panel-title">字段选择</div>
              <div className="button-row">
                <button className="button" type="button" onClick={onSelectAll}>
                  Select All
                </button>
                <button className="button" type="button" onClick={onDeselectAll}>
                  Deselect All
                </button>
              </div>
            </div>
            {availableFields.length === 0 ? (
              <div className="panel-hint">无可用字段。</div>
            ) : (
              <div className="checkbox-grid">
                {availableFields.map((field) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field)}
                      onChange={() => onToggleField(field)}
                    />
                    {field}
                  </label>
                ))}
              </div>
            )}
            {allSelected && availableFields.length > 0 && (
              <div className="panel-hint">已全选 {availableFields.length} 个字段。</div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || loading}
          >
            {loading ? "处理中..." : "Confirm Nesting"}
          </button>
        </div>
      </div>
    </div>
  );
}
