import { beforeEach, describe, expect, it } from 'vitest'
import { clearRecommended, getRecommended, setRecommended } from '../recommendedStore'

beforeEach(() => localStorage.clear())

describe('recommendedStore', () => {
  it('is empty before anything was imported', () => {
    expect(getRecommended()).toBeNull()
  })

  it('round-trips the channels with the import time', () => {
    setRecommended(['ogre_jpg', 'zedxyr'], 1700000000000)
    expect(getRecommended()).toEqual({ logins: ['ogre_jpg', 'zedxyr'], importedAt: 1700000000000 })
  })

  it('clears', () => {
    setRecommended(['ogre_jpg'])
    clearRecommended()
    expect(getRecommended()).toBeNull()
  })

  it('treats a damaged record as empty', () => {
    localStorage.setItem('prism_twitch_recommended', '{"logins":"x"}')
    expect(getRecommended()).toBeNull()
    localStorage.setItem('prism_twitch_recommended', 'nope')
    expect(getRecommended()).toBeNull()
  })
})
