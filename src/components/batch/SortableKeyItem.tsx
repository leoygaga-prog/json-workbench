import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableKeyItemProps {
  id: string;
  onRemove?: (id: string) => void;
}

export default function SortableKeyItem({ id, onRemove }: SortableKeyItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} className="sortable-item" style={style}>
      <span className="sortable-handle" {...attributes} {...listeners}>
        ⋮⋮
      </span>
      <span>{id}</span>
      {onRemove && (
        <button className="button sortable-remove" type="button" onClick={() => onRemove(id)}>
          移除
        </button>
      )}
    </div>
  );
}

