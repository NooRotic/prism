import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_QR_STYLE, type QrStyle } from '../lib/cast/qrCode'
import { fetchTvSettings } from '../lib/tvSettingsApi'

/** The QR look the owner chose in /admin: asked at start and again by `ask()` (when the share card opens). */
export function useQrStyle(): { style: QrStyle; ask(): void } {
  const [style, setStyle] = useState<QrStyle>(DEFAULT_QR_STYLE)
  const ask = useCallback(() => {
    void fetchTvSettings().then((settings) => {
      // Not known: the last good answer stays.
      if (settings) setStyle(settings.qrStyle)
    })
  }, [])
  useEffect(() => ask(), [ask])
  return { style, ask }
}
