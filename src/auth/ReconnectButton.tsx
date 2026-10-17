import { signInInteractive } from './googleAuth'

/** The click handler calls signInInteractive() synchronously (not after an
 * await) so the browser still treats the resulting popup as user-triggered. */
export function ReconnectButton({ onReconnected }: { onReconnected: () => void }) {
  function handleClick() {
    signInInteractive()
      .then(onReconnected)
      .catch(() => {})
  }
  return (
    <button className="reconnect-button" onClick={handleClick}>
      Reconnect to Google
    </button>
  )
}
