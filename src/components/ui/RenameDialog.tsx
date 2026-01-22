import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

interface RenameDialogProps {
  isOpen: boolean;
  defaultName: string;
  extension: string; // e.g., ".json", ".jsonl", ".xlsx"
  onClose: () => void;
  onConfirm: (newName: string) => void;
  title?: string;
}

export default function RenameDialog({
  isOpen,
  defaultName,
  extension,
  onClose,
  onConfirm,
  title = "重命名导出",
}: RenameDialogProps) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      // 移除扩展名，只保留文件名部分
      const nameWithoutExt = defaultName.replace(new RegExp(`\\${extension}$`), "");
      setInputValue(nameWithoutExt);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, defaultName, extension]);

  // ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  const handleConfirm = () => {
    if (inputValue.trim()) {
      const finalName = inputValue.trim() + extension;
      onConfirm(finalName);
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div
        className="rename-dialog-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          className="rename-dialog-close"
          onClick={onClose}
          type="button"
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h2 className="rename-dialog-title">{title}</h2>

        {/* Input Section */}
        <div className="rename-dialog-input-section">
          <div className="rename-dialog-input-wrapper">
            <input
              type="text"
              className="rename-dialog-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="输入文件名"
              autoFocus
            />
            <span className="rename-dialog-extension">{extension}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="rename-dialog-actions">
          <button
            className="rename-dialog-btn cancel"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="rename-dialog-btn confirm"
            onClick={handleConfirm}
            type="button"
            disabled={!inputValue.trim()}
          >
            下载
          </button>
        </div>
      </div>
    </div>
  );
}
