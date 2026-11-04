import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { PopoutBus, PopoutMessage } from '../lib/chatPopout'

/**
 * An in-memory PopoutBus for tests. `posted` is everything the code under test
 * sent; `deliver` plays a message in as if the other window had sent it.
 */
export function createFakePopoutBus() {
  const subscribers = new Set<(msg: PopoutMessage) => void>()
  const posted: PopoutMessage[] = []
  const bus: PopoutBus = {
    post: (msg) => {
      posted.push(msg)
    },
    subscribe: (cb) => {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    close: vi.fn(),
  }
  const deliver = (msg: PopoutMessage) =>
    act(() => {
      subscribers.forEach((cb) => cb(msg))
    })
  return { bus, posted, deliver, subscriberCount: () => subscribers.size }
}
