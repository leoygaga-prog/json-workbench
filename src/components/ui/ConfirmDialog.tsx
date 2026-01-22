import { useEffect, useCallback } from "react";
import { Undo2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "info" | "primary";
  undoable?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  variant = "danger",
  undoable = true,
}: ConfirmDialogProps) {
  // ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const getConfirmButtonClass = () => {
    if (variant === "primary") return "confirm-dialog-btn confirm primary";
    if (variant === "danger") return "confirm-dialog-btn confirm danger";
    return "confirm-dialog-btn confirm info";
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div
        className="confirm-dialog-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        {/* Minimalist Content */}
        <div className="confirm-dialog-content">
          {/* Title */}
          <h2 id="confirm-dialog-title" className="confirm-dialog-title">
            {title}
          </h2>

          {/* Description */}
          <div className="confirm-dialog-description">{description}</div>

          {/* Undoable Hint */}
          {undoable && (
            <p className="confirm-dialog-hint">
              <Undo2 size={14} />
              <span>此操作稍后可通过「撤销」恢复</span>
            </p>
          )}
        </div>

        {/* Clean Buttons */}
        <div className="confirm-dialog-actions">
          <button
            className="confirm-dialog-btn cancel"
            onClick={onCancel}
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={getConfirmButtonClass()}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
