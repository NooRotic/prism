import { describe, expect, it } from 'vitest'
import { parseLatestQuery } from '../latestQuery'

describe('parseLatestQuery', () => {
  it.each([
    ['latest MrBeast video', 'MrBeast'],
    ['Latest MrBeast', 'MrBeast'],
    ['newest Linus Tech Tips videos', 'Linus Tech Tips'],
    ['recent veritasium upload', 'veritasium'],
    ['MrBeast latest video', 'MrBeast'],
    ['mkbhd newest', 'mkbhd'],
    ['latest video from Linus Tech Tips', 'Linus Tech Tips'],
    ['newest videos by veritasium', 'veritasium'],
    ['latest uploads of @mkbhd', '@mkbhd'],
    ['  latest    two   minute   papers  video ', 'two minute papers'],
  ])('%s -> %s', (input, name) => {
    expect(parseLatestQuery(input)).toBe(name)
  })

  it.each(['', 'latest', 'latest video', 'latest videos', 'newest uploads', 'minecraft speedrun', 'how to make bread'])(
    'is not a latest-from-a-channel question: %j',
    (input) => {
      expect(parseLatestQuery(input)).toBeNull()
    },
  )
})
