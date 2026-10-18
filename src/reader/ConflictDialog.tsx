import type { ProgressRow } from '../types'

export function ConflictDialog({
  remote,
  onKeepMine,
  onUseTheirs,
}: {
  remote: ProgressRow
  onKeepMine: () => void
  onUseTheirs: () => void
}) {
  const savedAt = remote.lastReadAt ? new Date(remote.lastReadAt).toLocaleString() : 'another time'

  return (
    <div className="modal-backdrop">
      <div className="card modal">
        <h2>Reading position conflict</h2>
        <p className="muted">
          Another device saved a different position for this book, at {savedAt}. Which one should win?
        </p>
        <div className="modal-actions">
          <button className="secondary" onClick={onUseTheirs}>
            Use that position
          </button>
          <button className="primary" onClick={onKeepMine}>
            Keep mine
          </button>
        </div>
      </div>
    </div>
  )
}
