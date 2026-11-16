import { afterEach, describe, expect, it, vi } from 'vitest'
import { applySavedVolume, readSavedVolume, saveVolume } from '../playerVolume'
import { STORAGE_KEYS } from '../../config/storageKeys'

const KEY = STORAGE_KEYS.LOCAL_PLAYER_VOLUME

describe('playerVolume', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns null when nothing is saved', () => {
    expect(readSavedVolume()).toBeNull()
  })

  it('saves and reads a volume back', () => {
    saveVolume(0.35)
    expect(localStorage.getItem(KEY)).toBe('0.35')
    expect(readSavedVolume()).toBe(0.35)
  })

  it('keeps 0 (a real choice, not "nothing saved")', () => {
    saveVolume(0)
    expect(readSavedVolume()).toBe(0)
  })

  it('clamps to 0..1 on save and on read', () => {
    saveVolume(7)
    expect(readSavedVolume()).toBe(1)
    saveVolume(-2)
    expect(readSavedVolume()).toBe(0)
    localStorage.setItem(KEY, '3')
    expect(readSavedVolume()).toBe(1)
  })

  it('ignores junk values', () => {
    for (const junk of ['', 'abc', 'NaN', 'Infinity']) {
      localStorage.setItem(KEY, junk)
      expect(readSavedVolume()).toBeNull()
    }
  })

  it('does not save a non-finite volume', () => {
    saveVolume(0.6)
    saveVolume(Number.NaN)
    expect(localStorage.getItem(KEY)).toBe('0.6')
  })

  it('never throws when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(readSavedVolume()).toBeNull()
    expect(() => saveVolume(0.5)).not.toThrow()
    const set = vi.fn()
    expect(applySavedVolume(set)).toBe(false)
    expect(set).not.toHaveBeenCalled()
  })

  it('applySavedVolume hands the saved value to the setter', () => {
    saveVolume(0.4)
    const set = vi.fn()
    expect(applySavedVolume(set)).toBe(true)
    expect(set).toHaveBeenCalledWith(0.4)
  })

  it('applySavedVolume does nothing with no saved value, and survives a throwing setter', () => {
    const set = vi.fn()
    expect(applySavedVolume(set)).toBe(false)
    saveVolume(0.4)
    expect(applySavedVolume(() => { throw new Error('player gone') })).toBe(false)
  })
})
