import { CHAT_SCALE_STEPS, DEFAULT_CHAT_SCALE, parseChatScale, stepScale } from '../chatScale'

describe('chat scale steps', () => {
  it('runs from 70% to 200% around a default of 100%', () => {
    expect([...CHAT_SCALE_STEPS]).toEqual([0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2])
    expect(DEFAULT_CHAT_SCALE).toBe(1)
  })
})

describe('parseChatScale', () => {
  it.each(CHAT_SCALE_STEPS)('accepts the step %s unchanged', (step) => {
    expect(parseChatScale(String(step))).toBe(step)
  })

  it.each([
    ['nothing saved', null],
    ['an empty string', ''],
    ['text', 'abc'],
    ['NaN', 'NaN'],
    ['a value between steps', '1.2'],
    ['too large', '3'],
    ['too small', '0.1'],
    ['zero', '0'],
    ['negative', '-1'],
    ['infinity', 'Infinity'],
  ])('falls back to 100%% for %s', (_label, raw) => {
    expect(parseChatScale(raw)).toBe(1)
  })

  it('accepts a step written with a trailing zero', () => {
    expect(parseChatScale('1.50')).toBe(1.5)
  })
})

describe('stepScale', () => {
  it('moves one step up and down', () => {
    expect(stepScale(1, 1)).toBe(1.15)
    expect(stepScale(1, -1)).toBe(0.85)
    expect(stepScale(1.5, 1)).toBe(1.75)
    expect(stepScale(0.85, -1)).toBe(0.7)
  })

  it('stops at both ends', () => {
    expect(stepScale(2, 1)).toBe(2)
    expect(stepScale(0.7, -1)).toBe(0.7)
  })

  it('steps from the nearest step when the current value is between steps', () => {
    // 1.2 is nearest to 1.15
    expect(stepScale(1.2, 1)).toBe(1.3)
    expect(stepScale(1.2, -1)).toBe(1)
  })
})
