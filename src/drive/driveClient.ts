import type { DriveFile } from '../types'

const BASE = 'https://www.googleapis.com/drive/v3'

async function driveFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  })
  if (!res.ok) {
    throw new Error(`Drive request failed (${res.status}): ${await res.text()}`)
  }
  return res
}

export async function listFolder(folderId: string, token: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
      pageSize: '1000',
      orderBy: 'folder,name',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await driveFetch(`/files?${params.toString()}`, token)
    const data = (await res.json()) as { files: DriveFile[]; nextPageToken?: string }
    files.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)

  return files
}

export async function downloadFile(fileId: string, token: string): Promise<ArrayBuffer> {
  const res = await driveFetch(`/files/${fileId}?alt=media`, token)
  return res.arrayBuffer()
}

export async function moveFileToFolder(fileId: string, folderId: string, token: string): Promise<void> {
  await driveFetch(`/files/${fileId}?addParents=${folderId}&fields=id`, token, { method: 'PATCH' })
}
