import { useEffect, useState } from 'react'
import { getValidToken, NeedsInteractiveAuth } from '../auth/googleAuth'
import { ReconnectButton } from '../auth/ReconnectButton'
import { listFolder } from '../drive/driveClient'
import { isEpub, isFolder } from '../types'
import type { DriveFile } from '../types'

function FolderContents({
  folderId,
  onOpenBook,
}: {
  folderId: string
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
  if (files === null) return <p className="muted">Loading…</p>
  if (files.length === 0) return <p className="muted">Empty folder</p>

  return (
    <ul className="folder-list">
      {files.map((file) =>
        isFolder(file) ? (
          <FolderItem key={file.id} file={file} onOpenBook={onOpenBook} />
        ) : isEpub(file) ? (
          <li key={file.id}>
            <button className="book-item" onClick={() => onOpenBook(file)}>
              📖 {file.name}
            </button>
          </li>
        ) : null,
      )}
    </ul>
  )
}

function FolderItem({
  file,
  onOpenBook,
}: {
  file: DriveFile
  onOpenBook: (file: DriveFile) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li>
      <button className="folder-item" onClick={() => setExpanded((v) => !v)}>
        {expanded ? '📂' : '📁'} {file.name}
      </button>
      {expanded && (
        <div className="folder-children">
          <FolderContents folderId={file.id} onOpenBook={onOpenBook} />
        </div>
      )}
    </li>
  )
}

export function FolderTree({
  rootFolderId,
  onOpenBook,
}: {
  rootFolderId: string
  onOpenBook: (file: DriveFile) => void
}) {
  return <FolderContents folderId={rootFolderId} onOpenBook={onOpenBook} />
}
