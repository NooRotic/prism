import { swipeIntent } from '../landscapeSwipe'

const at = (x: number, y = 0) => ({ x, y })

describe('swipeIntent', () => {
  it('chat on the right: a swipe toward the left opens it', () => {
    expect(swipeIntent(at(300), at(240, 5), 'right')).toBe('open')
  })

  it('chat on the right: a swipe toward the right closes it', () => {
    expect(swipeIntent(at(200), at(260), 'right')).toBe('close')
  })

  it('chat on the left is mirrored', () => {
    expect(swipeIntent(at(200), at(260), 'left')).toBe('open')
    expect(swipeIntent(at(300), at(240), 'left')).toBe('close')
  })

  it('ignores a drag shorter than 40px', () => {
    expect(swipeIntent(at(300), at(280), 'right')).toBeNull()
  })

  it('counts a drag of exactly 40px', () => {
    expect(swipeIntent(at(300), at(260), 'right')).toBe('open')
  })

  it('ignores a mostly vertical drag (a scroll)', () => {
    expect(swipeIntent(at(300, 0), at(240, 80), 'right')).toBeNull()
  })
})
