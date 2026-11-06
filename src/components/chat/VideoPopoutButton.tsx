import { PictureInPicture2 } from 'lucide-react'

/** What a place that hosts the video control needs: whether the video floats, and what to do on a click. */
export interface VideoControl {
  floating: boolean
  onClick: () => void
}

interface VideoPopoutButtonProps extends VideoControl {
  /** The look belongs to the host: the header, the strip and the slim bar each have their own. */
  className: string
  size?: number
}

/** One button for both directions, so a clicked button keeps its focus while its label flips. */
export default function VideoPopoutButton({
  floating,
  onClick,
  className,
  size = 14,
}: VideoPopoutButtonProps) {
  const label = floating ? 'Bring video back' : 'Pop out video'
  const title = floating
    ? 'Bring the video back into the page'
    : 'Pop the video out into a small window that stays on top'
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title} className={className}>
      <PictureInPicture2 size={size} />
    </button>
  )
}
