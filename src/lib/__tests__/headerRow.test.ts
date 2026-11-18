import { nextRow, ROW_CLOSED, type RowState } from '../headerRow'

const previewed = (row: RowState['open']): RowState => ({ open: row, pinned: false })
const pinned = (row: RowState['open']): RowState => ({ open: row, pinned: true })

describe('nextRow', () => {
  it('opens a previewed row on hover', () => {
    expect(nextRow(ROW_CLOSED, { type: 'hoverOpen', row: 'twitch' }, false)).toEqual(previewed('twitch'))
  })

  it('switches a previewed row to the newly hovered tab', () => {
    expect(nextRow(previewed('twitch'), { type: 'hoverOpen', row: 'youtube' }, false)).toEqual(previewed('youtube'))
  })

  it('ignores hover while a row is pinned', () => {
    expect(nextRow(pinned('accounts'), { type: 'hoverOpen', row: 'twitch' }, false)).toEqual(pinned('accounts'))
  })

  it('ignores hover while the row is held open', () => {
    expect(nextRow(previewed('twitch'), { type: 'hoverOpen', row: 'youtube' }, true)).toEqual(previewed('twitch'))
  })

  it('still opens on hover from folded when something else holds (e.g. the rail opened Following)', () => {
    expect(nextRow(ROW_CLOSED, { type: 'hoverOpen', row: 'twitch' }, true)).toEqual(previewed('twitch'))
  })

  it('folds a previewed row when the pointer leaves', () => {
    expect(nextRow(previewed('twitch'), { type: 'hoverClose' }, false)).toEqual(ROW_CLOSED)
  })

  it('keeps a pinned row when the pointer leaves', () => {
    expect(nextRow(pinned('twitch'), { type: 'hoverClose' }, false)).toEqual(pinned('twitch'))
  })

  it('keeps a held row when the pointer leaves', () => {
    expect(nextRow(previewed('twitch'), { type: 'hoverClose' }, true)).toEqual(previewed('twitch'))
  })

  it('pins a row that hover already opened instead of folding it', () => {
    expect(nextRow(previewed('twitch'), { type: 'press', row: 'twitch' }, false)).toEqual(pinned('twitch'))
  })

  it('folds a pinned row when its button is pressed again', () => {
    expect(nextRow(pinned('twitch'), { type: 'press', row: 'twitch' }, false)).toEqual(ROW_CLOSED)
  })

  it('switches to another row on press, even while held', () => {
    expect(nextRow(pinned('twitch'), { type: 'press', row: 'accounts' }, true)).toEqual(pinned('accounts'))
  })

  it('opens a closed row pinned on press', () => {
    expect(nextRow(ROW_CLOSED, { type: 'press', row: 'accounts' }, false)).toEqual(pinned('accounts'))
  })

  it('always folds on dismiss, held or pinned', () => {
    expect(nextRow(pinned('twitch'), { type: 'dismiss' }, true)).toEqual(ROW_CLOSED)
  })

  it('folds on an outside click when not held', () => {
    expect(nextRow(pinned('accounts'), { type: 'outside' }, false)).toEqual(ROW_CLOSED)
  })

  it('stays through an outside click while held', () => {
    expect(nextRow(pinned('accounts'), { type: 'outside' }, true)).toEqual(pinned('accounts'))
  })

  it('returns the same object when nothing changes', () => {
    const state = pinned('twitch')
    expect(nextRow(state, { type: 'hoverOpen', row: 'youtube' }, false)).toBe(state)
  })
})
