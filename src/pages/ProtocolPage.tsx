import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useState } from 'react'
import { DemoGrid } from '../components/grid/DemoGrid'
import { SmartUrlInput } from '../components/search/SmartUrlInput'
import { useTwitchAuth } from '../hooks/useTwitchAuth'
import { getDemoByProtocol, getHlsDashDemo, PROTOCOL_META, type ProtocolKey } from '../config/demoContent'

interface ProtocolPageProps {
  protocol: ProtocolKey
}

function ProtocolSidebar() {
  // Collapsed by default on mobile (< md breakpoint)
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768,
  )
  const { isAuthenticated, login } = useTwitchAuth()
  const location = useLocation()

  const navItems: { label: string; path: string; color: string }[] = [
    { label: 'Twitch', path: '/twitch', color: PROTOCOL_META.twitch.color },
    { label: 'YouTube', path: '/youtube', color: PROTOCOL_META.youtube.color },
    { label: 'HLS / DASH', path: '/hls-dash', color: PROTOCOL_META['hls-dash'].color },
  ]

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center py-4 gap-4"
        style={{
          width: '48px',
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
          minHeight: 'calc(100vh - var(--header-height))',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronRight size={16} />
        </button>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="w-2 h-2 rounded-full transition-all"
            style={{
              backgroundColor: location.pathname === item.path ? item.color : 'var(--border)',
            }}
            title={item.label}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col py-4 gap-1 shrink-0"
      style={{
        width: '220px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        minHeight: 'calc(100vh - var(--header-height))',
      }}
    >
      {/* Collapse button */}
      <div className="flex justify-end px-3 mb-2">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Protocol nav links */}
      {navItems.map((item) => {
        const isActive = location.pathname === item.path
        return (
          <Link
            key={item.path}
            to={item.path}
            className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
            style={{
              color: isActive ? item.color : 'var(--text-secondary)',
              backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
              borderLeft: isActive ? `2px solid ${item.color}` : '2px solid transparent',
              borderRadius: '0 3px 3px 0',
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </Link>
        )
      })}

      {/* Divider */}
      <div className="mx-4 my-3" style={{ borderTop: '1px solid var(--border)' }} />

      {/* Auth-gated links */}
      <button
        type="button"
        onClick={isAuthenticated ? undefined : login}
        className="flex items-center gap-2 px-4 py-2 text-sm transition-colors text-left"
        style={{
          color: 'var(--accent-twitch)',
          opacity: isAuthenticated ? 1 : 0.55,
        }}
      >
        {!isAuthenticated && <Lock size={12} />}
        Following
      </button>
      <button
        type="button"
        onClick={isAuthenticated ? undefined : login}
        className="flex items-center gap-2 px-4 py-2 text-sm transition-colors text-left"
        style={{
          color: 'var(--accent-twitch)',
          opacity: isAuthenticated ? 1 : 0.55,
        }}
      >
        {!isAuthenticated && <Lock size={12} />}
        Your Stats
      </button>

      {/* Divider */}
      <div className="mx-4 my-3" style={{ borderTop: '1px solid var(--border)' }} />

      {/* SmartUrlInput in sidebar */}
      <div className="px-3">
        <SmartUrlInput />
      </div>

      {/* Connect Twitch CTA */}
      {!isAuthenticated && (
        <div className="px-3 mt-auto pt-4">
          <button
            type="button"
            onClick={login}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
              color: '#fff',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
            }}
          >
            Connect Twitch
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProtocolPage({ protocol }: ProtocolPageProps) {
  const meta = PROTOCOL_META[protocol]
  const entries =
    protocol === 'hls-dash' ? getHlsDashDemo() : getDemoByProtocol(protocol as 'twitch' | 'youtube')

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-var(--header-height))]">
      {/* Mobile protocol nav — horizontal tabs visible only on small screens */}
      <div className="flex md:hidden overflow-x-auto gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        {([
          { label: 'Twitch', path: '/twitch', color: PROTOCOL_META.twitch.color },
          { label: 'YouTube', path: '/youtube', color: PROTOCOL_META.youtube.color },
          { label: 'HLS/DASH', path: '/hls-dash', color: PROTOCOL_META['hls-dash'].color },
        ] as const).map((item) => {
          const isActive = `/${protocol}` === item.path || (protocol === 'hls-dash' && item.path === '/hls-dash')
          return (
            <Link
              key={item.path}
              to={item.path}
              className="shrink-0 px-3 py-1.5 rounded text-xs font-mono transition-colors"
              style={{
                color: isActive ? '#000' : item.color,
                backgroundColor: isActive ? item.color : 'transparent',
                border: `1px solid ${isActive ? item.color : 'var(--border)'}`,
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <ProtocolSidebar />
      </div>

      <div className="flex-1 p-4 md:p-6">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <h2
            className="font-heading text-xl uppercase tracking-wider"
            style={{ color: meta.color }}
          >
            {meta.label}
          </h2>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {meta.description}
          </span>
        </div>

        {/* Demo content grid */}
        <DemoGrid entries={entries} columns={3} />
      </div>
    </div>
  )
}
