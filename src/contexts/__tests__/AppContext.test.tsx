import { render, screen, renderHook, act } from '@testing-library/react'
import { AppProvider, useApp } from '../AppContext'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('AppContext', () => {
  describe('AppProvider', () => {
    it('renders children', () => {
      render(
        <AppProvider>
          <div data-testid="child">hello</div>
        </AppProvider>,
      )
      expect(screen.getByTestId('child')).toHaveTextContent('hello')
    })
  })

  describe('useApp', () => {
    it('throws outside provider', () => {
      // Suppress console.error for expected error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => useApp())).toThrow(
        'useApp must be used within AppProvider',
      )
      spy.mockRestore()
    })

    it('provides initial state', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      expect(result.current.state.auth.isAuthenticated).toBe(false)
      expect(result.current.state.auth.token).toBeNull()
      expect(result.current.state.loading).toBe(false)
      expect(result.current.state.error).toBeNull()
      expect(result.current.state.displayMode).toBe('idle')
    })
  })

  describe('reducer actions', () => {
    it('LOGIN sets auth state', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({ type: 'LOGIN', token: 'abc123' })
      })

      expect(result.current.state.auth.isAuthenticated).toBe(true)
      expect(result.current.state.auth.token).toBe('abc123')
    })

    it('LOGOUT clears auth state', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({ type: 'LOGIN', token: 'abc123' })
      })
      act(() => {
        result.current.dispatch({ type: 'LOGOUT' })
      })

      expect(result.current.state.auth.isAuthenticated).toBe(false)
      expect(result.current.state.auth.token).toBeNull()
    })

    it('PLAY_URL updates player state', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      const detection = {
        type: 'twitch' as const,
        platform: 'twitch-clip' as const,
        originalUrl: 'https://clips.twitch.tv/TestClip',
        playableUrl: 'https://clips.twitch.tv/TestClip',
      }

      act(() => {
        result.current.dispatch({
          type: 'PLAY_URL',
          url: 'https://clips.twitch.tv/TestClip',
          detection,
        })
      })

      expect(result.current.state.player.currentUrl).toBe(
        'https://clips.twitch.tv/TestClip',
      )
      expect(result.current.state.player.detection).toEqual(detection)
      expect(result.current.state.player.fallbackStep).toBe(0)
      // Twitch clip without channelName → standalone video mode
      expect(result.current.state.displayMode).toBe('video')
    })

    it('PLAY_URL sets displayMode to video for YouTube URLs', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({
          type: 'PLAY_URL',
          url: 'https://youtube.com/watch?v=abc',
          detection: {
            type: 'youtube' as const,
            originalUrl: 'https://youtube.com/watch?v=abc',
            playableUrl: 'https://youtube.com/watch?v=abc',
          },
        })
      })

      expect(result.current.state.displayMode).toBe('video')
    })

    it('PLAY_URL keeps displayMode for Twitch stream with channelName', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({
          type: 'PLAY_URL',
          url: 'https://twitch.tv/xqc',
          detection: {
            type: 'twitch' as const,
            platform: 'twitch-stream' as const,
            originalUrl: 'https://twitch.tv/xqc',
            playableUrl: 'https://twitch.tv/xqc',
            metadata: { channelName: 'xqc' },
          },
        })
      })

      // From idle, jumps to 'streamer' so ChannelLayout renders immediately
      expect(result.current.state.displayMode).toBe('streamer')
    })

    it('LOAD_CHANNEL_START sets loading true and clears error', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      // Set an error first
      act(() => {
        result.current.dispatch({
          type: 'LOAD_CHANNEL_ERROR',
          error: 'previous error',
        })
      })

      act(() => {
        result.current.dispatch({ type: 'LOAD_CHANNEL_START' })
      })

      expect(result.current.state.loading).toBe(true)
      expect(result.current.state.error).toBeNull()
    })

    it('LOAD_CHANNEL_ERROR sets error and stops loading', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({ type: 'LOAD_CHANNEL_START' })
      })
      act(() => {
        result.current.dispatch({
          type: 'LOAD_CHANNEL_ERROR',
          error: 'Channel not found',
        })
      })

      expect(result.current.state.loading).toBe(false)
      expect(result.current.state.error).toBe('Channel not found')
    })

    it('ADD_HISTORY adds to search history and dedupes', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({
          type: 'ADD_HISTORY',
          entry: { query: 'xqc', type: 'twitch', timestamp: 1000 },
        })
      })

      expect(result.current.state.search.history).toHaveLength(1)
      expect(result.current.state.search.history[0].query).toBe('xqc')

      // Add duplicate - should dedupe
      act(() => {
        result.current.dispatch({
          type: 'ADD_HISTORY',
          entry: { query: 'xqc', type: 'twitch', timestamp: 2000 },
        })
      })

      expect(result.current.state.search.history).toHaveLength(1)
      expect(result.current.state.search.history[0].timestamp).toBe(2000)
    })

    it('ADD_HISTORY caps at 20 entries', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        for (let i = 0; i < 25; i++) {
          result.current.dispatch({
            type: 'ADD_HISTORY',
            entry: {
              query: `channel${i}`,
              type: 'twitch',
              timestamp: i,
            },
          })
        }
      })

      expect(result.current.state.search.history).toHaveLength(20)
      // Most recent should be first
      expect(result.current.state.search.history[0].query).toBe('channel24')
    })

    it('TOGGLE_DEBUG toggles player.debugMode', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      expect(result.current.state.player.debugMode).toBe(true)

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_DEBUG' })
      })
      expect(result.current.state.player.debugMode).toBe(false)

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_DEBUG' })
      })
      expect(result.current.state.player.debugMode).toBe(true)
    })

    it('CLEAR_ERROR clears the error', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({
          type: 'LOAD_CHANNEL_ERROR',
          error: 'some error',
        })
      })
      expect(result.current.state.error).toBe('some error')

      act(() => {
        result.current.dispatch({ type: 'CLEAR_ERROR' })
      })
      expect(result.current.state.error).toBeNull()
    })

    it('LOGIN_USER_LOADED populates auth.user without touching token', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({ type: 'LOGIN', token: 'tok123' })
      })
      expect(result.current.state.auth.user).toBeNull()

      const mockUser = {
        id: '42',
        login: 'tester',
        display_name: 'Tester',
        type: '',
        broadcaster_type: '' as const,
        description: '',
        profile_image_url: '',
        offline_image_url: '',
        view_count: 0,
        created_at: '2026-01-01T00:00:00Z',
      }
      act(() => {
        result.current.dispatch({ type: 'LOGIN_USER_LOADED', user: mockUser })
      })
      expect(result.current.state.auth.user).toEqual(mockUser)
      expect(result.current.state.auth.token).toBe('tok123')
      expect(result.current.state.auth.isAuthenticated).toBe(true)
    })

    it('LOGOUT clears auth.user and closes any open nav panel', () => {
      const { result } = renderHook(() => useApp(), { wrapper })

      act(() => {
        result.current.dispatch({ type: 'LOGIN', token: 'tok' })
        result.current.dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
      })
      expect(result.current.state.navPanel.open).toBe('following')

      act(() => {
        result.current.dispatch({ type: 'LOGOUT' })
      })
      expect(result.current.state.auth.user).toBeNull()
      expect(result.current.state.auth.isAuthenticated).toBe(false)
      expect(result.current.state.navPanel.open).toBeNull()
    })

    it('OPEN_NAV_PANEL sets the open panel id', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
      })
      expect(result.current.state.navPanel.open).toBe('following')
    })

    it('CLOSE_NAV_PANEL sets open back to null', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
      })
      act(() => {
        result.current.dispatch({ type: 'CLOSE_NAV_PANEL' })
      })
      expect(result.current.state.navPanel.open).toBeNull()
    })

    it('TOGGLE_NAV_PANEL flips between open and closed for the same id', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({ type: 'TOGGLE_NAV_PANEL', panel: 'following' })
      })
      expect(result.current.state.navPanel.open).toBe('following')

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_NAV_PANEL', panel: 'following' })
      })
      expect(result.current.state.navPanel.open).toBeNull()
    })

    it('TOGGLE_NAV_PANEL swaps to a different panel id without closing', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
      })
      expect(result.current.state.navPanel.open).toBe('following')

      // Toggling a DIFFERENT panel id replaces the open panel (not close
      // + open). This lets the user switch between panels without an
      // intermediate null state.
      act(() => {
        result.current.dispatch({
          type: 'TOGGLE_NAV_PANEL',
          panel: 'your-stats',
        })
      })
      expect(result.current.state.navPanel.open).toBe('your-stats')
    })

    it('OPEN_NAV_PANEL accepts the your-stats id', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({ type: 'OPEN_NAV_PANEL', panel: 'your-stats' })
      })
      expect(result.current.state.navPanel.open).toBe('your-stats')
    })

    it('OPEN_CATEGORY_PANEL sets open=category and stores the name', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({
          type: 'OPEN_CATEGORY_PANEL',
          category: 'Just Chatting',
        })
      })
      expect(result.current.state.navPanel.open).toBe('category')
      expect(result.current.state.navPanel.category).toBe('Just Chatting')
    })

    it('OPEN_CATEGORY_PANEL updates the category on subsequent opens', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({
          type: 'OPEN_CATEGORY_PANEL',
          category: 'Just Chatting',
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'OPEN_CATEGORY_PANEL',
          category: 'Software and Game Development',
        })
      })
      expect(result.current.state.navPanel.open).toBe('category')
      expect(result.current.state.navPanel.category).toBe(
        'Software and Game Development',
      )
    })

    it('CLOSE_NAV_PANEL closes the category panel but preserves the name', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({
          type: 'OPEN_CATEGORY_PANEL',
          category: 'Just Chatting',
        })
      })
      act(() => {
        result.current.dispatch({ type: 'CLOSE_NAV_PANEL' })
      })
      // open goes null; the category name sticks around so reopening is
      // cheap (no re-lookup until it actually changes).
      expect(result.current.state.navPanel.open).toBeNull()
      expect(result.current.state.navPanel.category).toBe('Just Chatting')
    })

    it('SET_FOLLOWING_SORT updates the sort and persists to localStorage', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      // Initial value comes from the localStorage loader; default 'live-first'
      expect(result.current.state.navPanel.followingSort).toBe('live-first')

      act(() => {
        result.current.dispatch({ type: 'SET_FOLLOWING_SORT', sort: 'viewers' })
      })
      expect(result.current.state.navPanel.followingSort).toBe('viewers')
      expect(localStorage.getItem('prism_following_sort')).toBe('viewers')

      act(() => {
        result.current.dispatch({ type: 'SET_FOLLOWING_SORT', sort: 'alpha' })
      })
      expect(result.current.state.navPanel.followingSort).toBe('alpha')
      expect(localStorage.getItem('prism_following_sort')).toBe('alpha')
    })

    it('GO_HOME closes any open nav panel', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      act(() => {
        result.current.dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
      })
      expect(result.current.state.navPanel.open).toBe('following')

      act(() => {
        result.current.dispatch({ type: 'GO_HOME' })
      })
      expect(result.current.state.navPanel.open).toBeNull()
    })
  })
})
