import {
  LANDSCAPE_CHAT_BASE,
  LANDSCAPE_CHAT_CLOSED,
  LANDSCAPE_CHAT_OPEN,
  landscapeHandleLabel,
} from '../landscapeChat'

describe('landscapeHandleLabel', () => {
  it('says Show chat while it is closed', () => {
    expect(landscapeHandleLabel(false, false)).toBe('Show chat')
  })

  it('says Hide chat while it is open', () => {
    expect(landscapeHandleLabel(true, false)).toBe('Hide chat')
  })

  it('says Return chat to the page while it is popped out, whatever the open state', () => {
    expect(landscapeHandleLabel(false, true)).toBe('Return chat to the page')
    expect(landscapeHandleLabel(true, true)).toBe('Return chat to the page')
  })
})

describe('the landscape chat column classes', () => {
  it('keep the video at least 400px wide when open', () => {
    expect(LANDSCAPE_CHAT_OPEN).toContain('calc(100%_-_2.75rem_-_400px)')
  })

  it('collapse to nothing and out of the focus order when closed', () => {
    expect(LANDSCAPE_CHAT_CLOSED).toContain('basis-0')
    expect(LANDSCAPE_CHAT_CLOSED).toContain('invisible')
  })

  it('animate the width without moving anything over the video', () => {
    expect(LANDSCAPE_CHAT_BASE).toContain('transition-[flex-basis,visibility]')
    expect(LANDSCAPE_CHAT_BASE).toContain('shrink-0')
  })
})
