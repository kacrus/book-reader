import { useEffect, useState } from 'react'
import { getValidToken, NeedsInteractiveAuth } from '../auth/googleAuth'
import { ReconnectButton } from '../auth/ReconnectButton'
import { listFolder } from '../drive/driveClient'
import type { SheetsStore } from '../sheets/sheetsClient'
import { BookIcon, ChevronIcon, FolderIcon } from './icons'
import { formatBookTitle, formatDuration, isEpub, isFolder } from '../types'
import type { DriveFile } from '../types'

function FolderContents({
  folderId,
  sheetsStore,
  onOpenBook,
}: {
  folderId: string
  sheetsStore: SheetsStore
  onOpenBook: (file: DriveFile) => void
}) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId])

  async function load() {
    setError(null)
    setNeedsAuth(false)
    try {
      const token = await getValidToken()
      setFiles(await listFolder(folderId, token))
    } catch (err) {
      if (err instanceof NeedsInteractiveAuth) setNeedsAuth(true)
      else setError(err instanceof Error ? err.message : 'Failed to load folder')
    }
  }

  if (needsAuth) return <ReconnectButton onReconnected={load} />
  if (error) return <p className="error">{error}</p>
  if (files === null) return <p className="muted list-placeholder">Loading…</p>
  if (files.length === 0) return <p className="muted list-placeholder">Empty folder</p>

  return (
    <ul className="folder-list">
      {files.map((file) => {
        if (isFolder(file)) {
          return <FolderItem key={file.id} file={file} sheetsStore={sheetsStore} onOpenBook={onOpenBook} />
        }
        if (!isEpub(file)) return null
        const totalSeconds = sheetsStore.getTotalReadingSeconds(file.id)
        return (
          <li key={file.id}>
            <button className="book-item" onClick={() => onOpenBook(file)}>
              <BookIcon />
              <span className="item-label">{formatBookTitle(file.name)}</span>
              {totalSeconds > 0 && <span className="book-meta">{formatDuration(totalSeconds)}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function FolderItem({
  file,
  sheetsStore,
  onOpenBook,
}: {
  file: DriveFile
  sheetsStore: SheetsStore
  onOpenBook: (file: DriveFile) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li>
      <button className="folder-item" onClick={() => setExpanded((v) => !v)}>
        <ChevronIcon expanded={expanded} />
        <FolderIcon />
        <span className="item-label">{file.name}</span>
      </button>
      {expanded && (
        <div className="folder-children">
          <FolderContents folderId={file.id} sheetsStore={sheetsStore} onOpenBook={onOpenBook} />
        </div>
      )}
    </li>
  )
}

export function FolderTree({
  rootFolderId,
  sheetsStore,
  onOpenBook,
}: {
  rootFolderId: string
  sheetsStore: SheetsStore
  onOpenBook: (file: DriveFile) => void
}) {
  return <FolderContents folderId={rootFolderId} sheetsStore={sheetsStore} onOpenBook={onOpenBook} />
}
