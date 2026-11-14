import { createContext, useContext } from 'react'
import type { AdminLimits } from '../../lib/adminApi'

export interface AdminSessionValue {
  /** The few non-secret server settings the screens show next to their numbers. */
  limits: AdminLimits
  /** A screen calls this when the server answers one of its requests "signed out": the session is over. */
  onExpired: () => void
}

export const AdminSessionContext = createContext<AdminSessionValue | null>(null)

export function useAdminSession(): AdminSessionValue {
  const value = useContext(AdminSessionContext)
  if (value === null) throw new Error('useAdminSession needs an AdminSessionContext.Provider')
  return value
}
