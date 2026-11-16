// The chat column of landscape phone mode (see landscapePhone.ts), shared by ChatDock and
// OfflineLayout. The chat stays mounted and changes width, so opening it never reloads the
// iframe. Open, it takes about 38% of the row (at least 280px) but never so much that the video
// falls under Twitch's 400px embed minimum; the handle column beside it is 2.75rem wide. Literal
// strings, because Tailwind cannot see classes built from pieces (the underscores are spaces
// inside calc).
export const LANDSCAPE_CHAT_BASE =
  'min-w-0 grow-0 shrink-0 rounded-lg overflow-hidden flex flex-col transition-[flex-basis,visibility] duration-200 motion-reduce:transition-none'
export const LANDSCAPE_CHAT_OPEN = 'basis-[max(0px,min(max(38%,280px),calc(100%_-_2.75rem_-_400px)))]'
export const LANDSCAPE_CHAT_CLOSED = 'basis-0 invisible'

/** What the handle column's button says: popped out wins, then whether the column is open. */
export function landscapeHandleLabel(open: boolean, poppedOut: boolean): string {
  if (poppedOut) return 'Return chat to the page'
  return open ? 'Hide chat' : 'Show chat'
}
