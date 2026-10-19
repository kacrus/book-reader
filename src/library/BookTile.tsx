const TILE_COLORS = ['#5B4FFF', '#FF7A45', '#19B37D', '#E0A400', '#FF4E86', '#2FB4C9']

function colorForTitle(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0
  }
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]
}

export function BookTile({ title }: { title: string }) {
  const letter = title.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className="book-tile" style={{ background: colorForTitle(title) }}>
      {letter}
    </span>
  )
}
