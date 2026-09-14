import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Delete,
  Grip,
  LayoutGrid,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api, APIError, errorMessage, newID, type Grid, type State, type WebApp } from './api'
import { AppIcon, Mark, colorNames } from './icons'
import { IconPicker } from './IconPicker'
import { EditDock } from './EditDock'
import { gridCollisions, gridKeyboardCoordinates, TRASH_ID } from './drag'

function Brand() {
  return (
    <div className="brand">
      <Mark />
      <span>
        launchpad<span className="brand-period">.</span>
      </span>
    </div>
  )
}
function AppFace({ app }: { app: WebApp }) {
  return (
    <>
      <div className={`app-icon color-${app.color}`}>
        <AppIcon name={app.icon} />
      </div>
      <div className="app-label">
        <span>{app.name}</span>
        <ArrowUpRight className="launch-arrow" size={18} />
      </div>
    </>
  )
}
function Tile({
  app,
  editing,
  disabled,
  index,
  count,
  onEdit,
  onMove,
}: {
  app: WebApp
  editing: boolean
  disabled: boolean
  index: number
  count: number
  onEdit: () => void
  onMove: (to: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: app.id,
    disabled: !editing || disabled,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`tile-wrap ${isDragging ? 'is-dragging' : ''}`}
    >
      {editing ? (
        <div className="app-tile editing-tile">
          <button
            ref={setActivatorNodeRef}
            className="tile-drag"
            disabled={disabled}
            aria-label={`Drag ${app.name} to move or remove`}
            {...attributes}
            {...listeners}
          >
            <AppFace app={app} />
            <span className="drag-cue">
              <Grip size={16} />
              Drag to move
            </span>
          </button>
          <div className="reorder-controls">
            <button
              className="reorder-button"
              aria-label={`Move ${app.name} earlier`}
              onClick={() => onMove(index - 1)}
              disabled={index === 0 || disabled}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              className="edit-app-button"
              aria-label={`Edit ${app.name}`}
              disabled={disabled}
              onClick={onEdit}
            >
              <Pencil size={15} />
              Edit
            </button>
            <button
              className="reorder-button"
              aria-label={`Move ${app.name} later`}
              onClick={() => onMove(index + 1)}
              disabled={index === count - 1 || disabled}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      ) : (
        <a href={app.url} className="app-tile" aria-label={`Open ${app.name}`}>
          <AppFace app={app} />
        </a>
      )}
    </div>
  )
}

function AppEditor({
  app,
  onClose,
  onSave,
}: {
  app: WebApp | null
  onClose: () => void
  onSave: (app: WebApp) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<WebApp>(
    () => app ?? { id: newID(), name: '', url: '', icon: 'globe', color: 'silver' },
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const el = dialog.current!
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el.showModal()
    // The close button owns autofocus on edit; text fields only focus after a tap.
    if (app) el.querySelector<HTMLButtonElement>('[data-editor-close]')?.focus({ preventScroll: true })
    return () => {
      el.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const raw = draft.url.trim()
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(raw) && !/^[^/]+:\d+(?:[/?#]|$)/.test(raw)
    const normalized = hasScheme ? raw : `https://${raw}`
    try {
      const parsed = new URL(normalized)
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      )
        throw new Error('Enter an http:// or https:// URL without embedded credentials.')
      setBusy(true)
      await onSave({ ...draft, name: draft.name.trim(), url: normalized })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor-dialog"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="dialog-content">
        <div className="dialog-heading">
          <div>
            <h2 id="editor-title">
              {app ? 'Edit app' : 'Add an app'}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            data-editor-close
            autoFocus={Boolean(app)}
          >
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="editor-form">
          <div className="editor-body">
            <div className="editor-details">
              <div className="app-preview">
                <div className={`app-icon color-${draft.color}`}>
                  <AppIcon name={draft.icon} />
                </div>
                <div>
                  <strong>{draft.name || 'App preview'}</strong>
                  {draft.url ? <span>{draft.url}</span> : null}
                </div>
              </div>
              <div className="field">
                <label htmlFor="app-name">App name</label>
                <input
                  id="app-name"
                  autoFocus={!app}
                  required
                  maxLength={60}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="e.g. Home Assistant"
                  disabled={busy}
                />
              </div>
              <div className="field">
                <label htmlFor="app-url">Website URL</label>
                <input
                  id="app-url"
                  required
                  maxLength={2048}
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                  placeholder="https://example.com"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <span className="field-hint">Opens in this tab. Use browser Back to return.</span>
              </div>
              <fieldset disabled={busy}>
                <legend>Color</legend>
                <div className="color-picker">
                  {colorNames.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`${color} color`}
                      aria-pressed={draft.color === color}
                      className={`color-choice color-${color} ${draft.color === color ? 'selected' : ''}`}
                      onClick={() => setDraft({ ...draft, color })}
                    >
                      {draft.color === color ? <Check size={18} /> : null}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <IconPicker
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : app ? 'Save changes' : 'Add app'}
              {!busy ? <Plus size={18} /> : null}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

function Unlock({ onUnlock }: { onUnlock: (state: State) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!pin || busy) return
    setBusy(true)
    setError('')
    try {
      onUnlock(await api<State>('login', 'POST', { pin }))
    } catch (err) {
      setError(errorMessage(err))
      setPin('')
      input.current?.focus()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page unlock-page">
      <header className="topbar">
        <Brand />
      </header>
      <main className="unlock-main">
        <form className="pin-panel" onSubmit={submit}>
          <div className="pin-heading">
            <h1>Enter PIN</h1>
          </div>
          <label className="sr-only" htmlFor="pin">
            PIN
          </label>
          <input
            ref={input}
            id="pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            maxLength={128}
            placeholder="Enter PIN"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            disabled={busy}
            aria-describedby={error ? 'pin-error' : undefined}
          />
          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                type="button"
                key={digit}
                disabled={busy}
                onClick={() => setPin((value) => (value + digit).slice(0, 128))}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              className="keypad-action"
              aria-label="Clear PIN"
              onClick={() => setPin('')}
              disabled={busy}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setPin((value) => (value + '0').slice(0, 128))}
              disabled={busy}
            >
              0
            </button>
            <button
              type="button"
              aria-label="Delete last digit"
              onClick={() => setPin((value) => value.slice(0, -1))}
              disabled={busy}
            >
              <Delete size={22} />
            </button>
          </div>
          {error ? (
            <p id="pin-error" className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button primary unlock-button" disabled={!pin || busy}>
            {busy ? 'Unlocking…' : 'Unlock launchpad'}
            <ArrowRight size={19} />
          </button>
        </form>
      </main>
    </div>
  )
}

export function App() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editor, setEditor] = useState<{ app: WebApp | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeID, setActiveID] = useState<string | null>(null)
  const [removed, setRemoved] = useState<{ app: WebApp; index: number } | null>(null)
  const savingRef = useRef(false)
  const requestVersion = useRef(0)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: gridKeyboardCoordinates }),
  )
  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setError('')
    try {
      const result = await api<State>('state')
      if (version === requestVersion.current) setState(result)
    } catch (err) {
      if (version === requestVersion.current) setError(errorMessage(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  // Refresh shared state when returning from another app or device; do not overwrite an open editor.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !savingRef.current && !editor && !editing) void load()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [load, editor, editing])
  async function save(apps: WebApp[]) {
    if (!state?.authenticated || savingRef.current)
      throw new Error('Wait for the current save to finish.')
    const before = state
    requestVersion.current++
    savingRef.current = true
    setSaving(true)
    setError('')
    setState({ ...state, apps })
    try {
      const result = await api<Grid>('apps', 'PUT', { apps, revision: before.revision })
      setState({ ...before, ...result })
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        setState({ authenticated: false, pinEnabled: true })
        setEditor(null)
        setEditing(false)
        setRemoved(null)
      } else {
        setState(before)
        setError(errorMessage(err))
      }
      throw err
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  async function move(from: number, to: number) {
    if (!state?.authenticated || from < 0 || to < 0) return
    try {
      await save(arrayMove(state.apps, from, to))
    } catch {
      /* Save displays the actionable error and rolls back. */
    }
  }
  async function remove(id: string) {
    if (!state?.authenticated || savingRef.current) return
    const index = state.apps.findIndex((app) => app.id === id)
    if (index < 0) return
    const app = state.apps[index]
    try {
      await save(state.apps.filter((item) => item.id !== id))
      setRemoved({ app, index })
    } catch {
      /* Save restores the tile and displays the error. */
    }
  }
  async function undoRemove() {
    if (!state?.authenticated || !removed || savingRef.current) return
    if (state.apps.some((app) => app.id === removed.app.id)) {
      setRemoved(null)
      return
    }
    if (state.apps.length >= 100) {
      setError('Remove another app before restoring this one. The grid holds up to 100 apps.')
      return
    }
    const apps = [...state.apps]
    apps.splice(Math.min(removed.index, apps.length), 0, removed.app)
    try {
      await save(apps)
      setRemoved(null)
    } catch {
      /* Keep Undo available if saving fails. */
    }
  }
  function drop(event: DragEndEvent) {
    setActiveID(null)
    if (!state?.authenticated || !event.over || event.active.id === event.over.id) return
    if (event.over.id === TRASH_ID) {
      void remove(String(event.active.id))
      return
    }
    void move(
      state.apps.findIndex((app) => app.id === event.active.id),
      state.apps.findIndex((app) => app.id === event.over!.id),
    )
  }
  async function lock() {
    requestVersion.current++
    try {
      await api('logout', 'POST', {})
      setState({ authenticated: false, pinEnabled: true })
      setEditing(false)
      setRemoved(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  if (state && !state.authenticated)
    return (
      <Unlock
        onUnlock={(next) => {
          requestVersion.current++
          setState(next)
        }}
      />
    )
  if (!state)
    return (
      <div className="page">
        <header className="topbar">
          <Brand />
        </header>
        <main className="loading-state" aria-live="polite">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button className="button secondary" onClick={load}>
                <RotateCcw size={18} />
                Try again
              </button>
            </>
          ) : (
            <>
              <div className="loading-mark">
                <Mark />
              </div>
              <p>Opening your launchpad…</p>
            </>
          )}
        </main>
      </div>
    )
  const activeApp = state.apps.find((app) => app.id === activeID)
  return (
    <div className="page">
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <button
            className={`button ${editing ? 'primary' : 'secondary'} edit-toggle`}
            onClick={() => setEditing(!editing)}
            disabled={saving}
          >
            {editing ? <Check size={18} /> : <Pencil size={17} />}
            {editing ? 'Done editing' : 'Edit apps'}
          </button>
          {state.pinEnabled ? (
            <button
              className="icon-button lock-button"
              onClick={lock}
              aria-label="Lock launchpad"
              title="Lock launchpad"
              disabled={saving}
            >
              <LockKeyhole size={20} />
            </button>
          ) : null}
        </div>
      </header>
      <main className="dashboard">
        <h1 className="sr-only">Your apps</h1>
        {error ? (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button className="button secondary" onClick={load} disabled={saving}>
              <RotateCcw size={17} />
              Reload apps
            </button>
          </div>
        ) : null}
        {state.apps.length === 0 ? (
          <div className="empty-message">
            <LayoutGrid size={30} />
            <h2>No apps yet</h2>
            <p>Add a website to get started.</p>
          </div>
        ) : null}
        <DndContext
          sensors={sensors}
          collisionDetection={gridCollisions}
          accessibility={{
            screenReaderInstructions: {
              draggable: 'Press Space to pick up an app. Use arrow keys to reorder, or Delete to target the trash. Press Space to drop, or Escape to cancel.',
            },
            announcements: {
              onDragStart: ({ active }) => `Picked up ${state.apps.find((app) => app.id === active.id)?.name ?? 'app'}.`,
              onDragOver: ({ over }) => over?.id === TRASH_ID ? 'Over trash. Drop to remove, or press Escape to cancel.' : 'Moving app.',
              onDragEnd: ({ over }) => over?.id === TRASH_ID ? 'Dropped in trash.' : 'Dropped app.',
              onDragCancel: () => 'Move cancelled.',
            },
          }}
          onDragStart={(event) => setActiveID(String(event.active.id))}
          onDragEnd={drop}
          onDragCancel={() => setActiveID(null)}
        >
          <SortableContext items={state.apps.map((app) => app.id)} strategy={rectSortingStrategy}>
            <div className={`app-grid ${editing ? 'is-editing' : ''}`}>
              {state.apps.map((app, index) => (
                <Tile
                  key={app.id}
                  app={app}
                  editing={editing}
                  disabled={saving}
                  index={index}
                  count={state.apps.length}
                  onEdit={() => setEditor({ app })}
                  onMove={(to) => void move(index, to)}
                />
              ))}
              {state.apps.length < 100 ? (
                <button
                  className="add-tile"
                  onClick={() => setEditor({ app: null })}
                  disabled={saving}
                >
                  <span className="add-symbol">
                    <Plus size={28} strokeWidth={1.5} />
                  </span>
                  <span className="add-label">
                    Add an app
                    <ChevronRight size={17} />
                  </span>
                </button>
              ) : null}
            </div>
          </SortableContext>
          {editing || removed ? (
            <EditDock
              editing={editing}
              disabled={saving}
              activeName={activeApp?.name}
              removedName={removed?.app.name}
              onUndo={() => void undoRemove()}
            />
          ) : null}
          <DragOverlay zIndex={20} dropAnimation={null}>
            {activeApp ? (
              <div className="app-tile drag-overlay">
                <AppFace app={activeApp} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <div className="grid-meta">
          <span aria-live="polite">
            {saving
              ? 'Saving changes…'
              : editing
                ? 'Changes save automatically'
                : `${state.apps.length} ${state.apps.length === 1 ? 'app' : 'apps'}`}
          </span>
        </div>
      </main>
      {editor ? (
        <AppEditor
          app={editor.app}
          onClose={() => setEditor(null)}
          onSave={(app) =>
            save(
              editor.app
                ? state.apps.map((item) => (item.id === app.id ? app : item))
                : [...state.apps, app],
            )
          }
        />
      ) : null}
    </div>
  )
}
