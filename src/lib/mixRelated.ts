/**
 * The "related" lane. YouTube has no recommendations API, but a Mix (`RD<videoId>` playlist) is its own list of
 * related videos, and the IFrame player will report it through getPlaylist(). So: cue the Mix in a hidden,
 * muted player, read the ids back, describe them with the Data API. A Mix can also answer with nothing and no
 * error, so every read gives up after a timeout.
 *
 * It uses cuePlaylist, not loadPlaylist, so the hidden player never plays and cannot write to the owner's History.
 */
import type { CatchupVideo } from './catchup'
import { describeVideos } from './catchupApi'
import { loadYouTubeIframeApi, type YTPlayer } from './ytIframeApi'

const POLL_MS = 250
const MIN_USEFUL = 10
const MAX_DESCRIBED = 50

/** The ids of a seed video's Mix, without the seed. Resolves [] if YouTube gives nothing before the timeout. */
export async function fetchMixIds(seedVideoId: string, timeoutMs = 8000): Promise<string[]> {
  // The API script can be blocked without ever erroring, so loading it shares the same time budget.
  let loadTimer: ReturnType<typeof setTimeout> | undefined
  const YT = await Promise.race([
    loadYouTubeIframeApi(),
    new Promise<null>((r) => {
      loadTimer = setTimeout(() => r(null), timeoutMs)
    }),
  ])
  clearTimeout(loadTimer)
  if (!YT) return []
  return new Promise<string[]>((resolve) => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px;pointer-events:none'
    document.body.appendChild(host)
    const mount = document.createElement('div')
    host.appendChild(mount)

    let player: YTPlayer | null = null
    let poll: ReturnType<typeof setInterval> | undefined
    let done = false
    const finish = (result: string[]) => {
      if (done) return
      done = true
      clearInterval(poll)
      clearTimeout(timer)
      try {
        player?.destroy()
      } catch {
        /* already gone */
      }
      host.remove()
      resolve(result)
    }
    const timer = setTimeout(() => finish([]), timeoutMs)

    player = new YT.Player(mount, {
      width: '200',
      height: '200',
      playerVars: { autoplay: 0, controls: 0 },
      events: {
        onReady: () => {
          if (!player) return
          player.mute()
          player.cuePlaylist({ list: `RD${seedVideoId}`, listType: 'playlist' })
          poll = setInterval(() => {
            const list = player?.getPlaylist()
            if (list && list.length > 1) finish(list.filter((id) => id !== seedVideoId))
          }, POLL_MS)
        },
      },
    })
  })
}

/** Related videos for the owner's most recent seeds: the first Mix with enough ids wins. */
export async function fetchRelatedLane(seeds: string[]): Promise<CatchupVideo[]> {
  for (const seed of seeds) {
    const ids = await fetchMixIds(seed)
    if (ids.length >= MIN_USEFUL) return describeVideos(ids.slice(0, MAX_DESCRIBED))
  }
  return []
}
