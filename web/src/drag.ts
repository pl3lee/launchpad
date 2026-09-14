import { closestCenter, pointerWithin, type CollisionDetection, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

// App IDs are strings, so this cannot collide with a saved app ID.
export const TRASH_ID = -1

export const gridCollisions: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates ?? {
    x: args.collisionRect.left + args.collisionRect.width / 2,
    y: args.collisionRect.top + args.collisionRect.height / 2,
  }
  // Never treat trash as the nearest tile. A drop must actually land inside it.
  const trash = pointerWithin({
    ...args,
    pointerCoordinates: pointer,
    droppableContainers: args.droppableContainers.filter((item) => item.id === TRASH_ID),
  })
  if (trash.length) return trash
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((item) => item.id !== TRASH_ID),
  })
}

export const gridKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { collisionRect, droppableRects } = args.context
  const trash = droppableRects.get(TRASH_ID)
  if (event.code === 'Delete' && trash && collisionRect) {
    event.preventDefault()
    return {
      x: trash.left + (trash.width - collisionRect.width) / 2,
      y: trash.top + (trash.height - collisionRect.height) / 2,
    }
  }
  // Arrow keys reorder; Delete explicitly targets trash, then Space confirms.
  const tileRects = new Map(droppableRects)
  tileRects.delete(TRASH_ID)
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableRects: tileRects },
  })
}
