import { FILL_ATTRIBUTE, fillScopeFor, parseFill } from '../fillMode'

describe('parseFill', () => {
  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['1', '1'],
    ['TRUE', 'TRUE'],
    ['yes', 'yes'],
    ['false', 'false'],
    ['JSON', '{"fill":true}'],
  ])('is off for %s', (_label, raw) => {
    expect(parseFill(raw)).toBe(false)
  })

  it('is on only for the exact string true', () => {
    expect(parseFill('true')).toBe(true)
  })
})

describe('fillScopeFor', () => {
  it('names the attribute the page chrome is hidden by', () => {
    expect(FILL_ATTRIBUTE).toBe('data-fill')
  })

  it.each([
    [false, true],
    [false, false],
  ])('is null when neither fill nor fullscreen is on (chatDocked %s)', (_n, chatDocked) => {
    expect(fillScopeFor({ fill: false, fullscreen: false, chatDocked })).toBeNull()
  })

  it('applies at md and wider when fill is on and chat is docked', () => {
    expect(fillScopeFor({ fill: true, fullscreen: false, chatDocked: true })).toBe('md')
  })

  it('applies at every width when fill is on and chat is hidden or popped out', () => {
    expect(fillScopeFor({ fill: true, fullscreen: false, chatDocked: false })).toBe('all')
  })

  it('fullscreen alone counts, with the same width rule', () => {
    expect(fillScopeFor({ fill: false, fullscreen: true, chatDocked: true })).toBe('md')
    expect(fillScopeFor({ fill: false, fullscreen: true, chatDocked: false })).toBe('all')
  })

  it('stays the same when both are on', () => {
    expect(fillScopeFor({ fill: true, fullscreen: true, chatDocked: true })).toBe('md')
    expect(fillScopeFor({ fill: true, fullscreen: true, chatDocked: false })).toBe('all')
  })
})
