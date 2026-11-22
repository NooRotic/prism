import { beforeEach, describe, expect, it } from 'vitest'
import { findByTwitch, findByYoutube, getLinks, MAX_LINKS, removeLink, saveLink, type LinkRecord } from '../linkedAccounts'

const rec = (twitch: string, over: Partial<LinkRecord> = {}): LinkRecord => ({
  twitch,
  youtube: { channelId: `UC${twitch.padEnd(22, 'x')}`, title: `${twitch} yt` },
  confirmed: false,
  linkedAt: 1,
  ...over,
})

beforeEach(() => localStorage.clear())

describe('linkedAccounts', () => {
  it('starts empty', () => expect(getLinks()).toEqual([]))

  it('saves a link and finds it by Twitch login, any case', () => {
    saveLink(rec('mrbeast'))
    expect(findByTwitch('MrBeast')?.youtube?.title).toBe('mrbeast yt')
    expect(findByTwitch('someoneelse')).toBeNull()
  })

  it('finds a link by YouTube channel id', () => {
    saveLink(rec('mrbeast'))
    const id = rec('mrbeast').youtube!.channelId
    expect(findByYoutube(id)?.twitch).toBe('mrbeast')
    expect(findByYoutube('UCnothing')).toBeNull()
  })

  it('keeps one record per Twitch login: saving again replaces it and moves it to the front', () => {
    saveLink(rec('a'))
    saveLink(rec('b'))
    saveLink(rec('A', { confirmed: true }))
    const links = getLinks()
    expect(links.map((l) => l.twitch)).toEqual(['a', 'b'])
    expect(links[0].confirmed).toBe(true)
  })

  it('lower-cases the Twitch login it stores', () => {
    saveLink(rec('MrBeast'))
    expect(getLinks()[0].twitch).toBe('mrbeast')
  })

  it('removes a link', () => {
    saveLink(rec('a'))
    saveLink(rec('b'))
    removeLink('A')
    expect(getLinks().map((l) => l.twitch)).toEqual(['b'])
  })

  it('keeps only the most recent links', () => {
    for (let i = 0; i < MAX_LINKS + 3; i++) saveLink(rec(`chan${i}`))
    expect(getLinks()).toHaveLength(MAX_LINKS)
    expect(getLinks()[0].twitch).toBe(`chan${MAX_LINKS + 2}`)
  })

  it('drops damaged entries and reads damaged storage as empty', () => {
    localStorage.setItem('prism_linked_accounts', '{"x":1}')
    expect(getLinks()).toEqual([])
    localStorage.setItem('prism_linked_accounts', JSON.stringify([rec('ok'), null, 5, { twitch: 7 }, { twitch: 'noaccounts', confirmed: false, linkedAt: 1 }]))
    expect(getLinks().map((l) => l.twitch)).toEqual(['ok'])
  })
})
