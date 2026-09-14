import { useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { RotateCcw, Trash2 } from 'lucide-react'
import { TRASH_ID } from './drag'

export function EditDock({
  editing,
  disabled,
  activeName,
  removedName,
  onUndo,
}: {
  editing: boolean
  disabled: boolean
  activeName?: string
  removedName?: string
  onUndo: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRASH_ID, disabled: !editing || disabled })
  const undo = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (removedName) undo.current?.focus({ preventScroll: true })
  }, [removedName])

  return (
    <aside className="edit-dock" aria-label="Editing tools">
      {removedName ? (
        <div className="undo-removal">
          <span role="status">Removed {removedName}</span>
          <button ref={undo} className="button secondary" disabled={disabled} onClick={onUndo}>
            <RotateCcw size={18} /> Undo
          </button>
        </div>
      ) : null}
      {editing ? (
        <div
          ref={setNodeRef}
          className={`trash-drop ${activeName ? 'drag-active' : ''} ${isOver ? 'is-over' : ''}`}
          role="group"
          aria-label="Trash"
        >
          <Trash2 size={27} aria-hidden="true" />
          <span>{isOver ? `Release to remove ${activeName}` : 'Drag here to remove'}</span>
        </div>
      ) : null}
    </aside>
  )
}
