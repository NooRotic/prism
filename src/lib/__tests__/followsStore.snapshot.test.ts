import { getFollowsSnapshot } from '../followsStore'

// A follows store is created when something subscribes, which a component does in an
// effect, after its first render. Until then there is no store, and the snapshot a
// component reads must not look like "this viewer follows no one".
describe('getFollowsSnapshot before a store exists', () => {
  it('reports loading, since subscribing is about to start the first load', () => {
    expect(getFollowsSnapshot('user-with-no-store-yet').loading).toBe(true)
  })

  it('has no follows and no error', () => {
    const snapshot = getFollowsSnapshot('user-with-no-store-yet')

    expect(snapshot.data).toEqual([])
    expect(snapshot.error).toBeNull()
    expect(snapshot.cursor).toBeNull()
  })

  it('returns the same object every time, as useSyncExternalStore requires of a snapshot', () => {
    expect(getFollowsSnapshot('first-user')).toBe(getFollowsSnapshot('second-user'))
  })
})
