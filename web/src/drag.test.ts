import assert from 'node:assert/strict'
import test from 'node:test'
import { gridCollisions, TRASH_ID } from './drag.ts'

function collisions(pointerCoordinates: { x: number; y: number } | null) {
  const tile = { left: 0, top: 0, right: 200, bottom: 160, width: 200, height: 160 }
  const trash = { left: 0, top: 300, right: 440, bottom: 380, width: 440, height: 80 }
  return gridCollisions({
    active: { id: 'app', data: { current: {} }, rect: { current: { initial: tile, translated: null } } },
    // The dragged tile overlaps trash even when the pointer is just outside it.
    collisionRect: { ...tile, top: 220, bottom: 380 },
    pointerCoordinates,
    droppableRects: new Map<string | number, typeof tile>([['app', tile], [TRASH_ID, trash]]),
    droppableContainers: [['app', tile], [TRASH_ID, trash]].map(([id, rect]) => ({
      id: id as string | number,
      key: String(id),
      disabled: false,
      data: { current: {} },
      node: { current: null },
      rect: { current: rect as typeof tile },
    })),
  })
}

test('dropping just outside trash does not remove a tile that overlaps it', () => {
  assert.equal(collisions({ x: 100, y: 299 })[0]?.id, 'app')
  assert.equal(collisions({ x: 441, y: 340 })[0]?.id, 'app')
})

test('dropping inside trash takes priority over the sortable tiles', () => {
  assert.equal(collisions({ x: 100, y: 340 })[0]?.id, TRASH_ID)
})

test('keyboard dragging uses the dragged tile center to target trash', () => {
  assert.equal(collisions(null)[0]?.id, TRASH_ID)
})
