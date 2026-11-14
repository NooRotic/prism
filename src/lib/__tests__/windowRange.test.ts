import { windowRange } from '../windowRange'

const base = { viewportHeight: 300, rowHeight: 100, rowCount: 50, overscan: 1 }

describe('windowRange', () => {
  it('starts at the top: the rows in view plus the overscan below', () => {
    expect(windowRange({ ...base, scrollTop: 0 })).toEqual({ firstRow: 0, endRow: 4 })
  })

  it('in the middle: overscan above and below', () => {
    expect(windowRange({ ...base, scrollTop: 1000 })).toEqual({ firstRow: 9, endRow: 14 })
  })

  it('counts a row that is only partly in view', () => {
    expect(windowRange({ ...base, scrollTop: 1050, overscan: 0 })).toEqual({ firstRow: 10, endRow: 14 })
  })

  it('stops at the last row', () => {
    expect(windowRange({ ...base, scrollTop: 4700 })).toEqual({ firstRow: 46, endRow: 50 })
  })

  it('shows the end of the list when the scroll position is past it (a list that just got shorter)', () => {
    expect(windowRange({ ...base, scrollTop: 99_999 })).toEqual(windowRange({ ...base, scrollTop: 4700 }))
  })

  it('treats a negative scroll position (an overscroll bounce) as the top', () => {
    expect(windowRange({ ...base, scrollTop: -250 })).toEqual({ firstRow: 0, endRow: 4 })
  })

  it('shows every row when there are fewer than fit the viewport', () => {
    expect(windowRange({ ...base, rowCount: 2, scrollTop: 0 })).toEqual({ firstRow: 0, endRow: 2 })
    expect(windowRange({ ...base, rowCount: 2, scrollTop: 500 })).toEqual({ firstRow: 0, endRow: 2 })
  })

  it('shows nothing for no rows', () => {
    expect(windowRange({ ...base, rowCount: 0, scrollTop: 0 })).toEqual({ firstRow: 0, endRow: 0 })
    expect(windowRange({ ...base, rowCount: 0, scrollTop: 800 })).toEqual({ firstRow: 0, endRow: 0 })
  })

  it('never lets the overscan go below zero or beyond the rows that exist', () => {
    expect(windowRange({ ...base, overscan: -5, scrollTop: 1000 })).toEqual({ firstRow: 10, endRow: 13 })
    expect(windowRange({ ...base, overscan: 1000, scrollTop: 1000 })).toEqual({ firstRow: 0, endRow: 50 })
  })

  it('copes with a row height or viewport that is not a positive number', () => {
    const result = windowRange({ ...base, rowHeight: 0, scrollTop: 0 })
    expect(result.firstRow).toBe(0)
    expect(result.endRow).toBeLessThanOrEqual(50)
    expect(windowRange({ ...base, viewportHeight: 0, scrollTop: 0 })).toEqual({ firstRow: 0, endRow: 1 })
  })
})
