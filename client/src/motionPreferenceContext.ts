import { createContext, useContext } from 'react'

export type MotionContextValue = { reduced: boolean; setReduced: (reduced: boolean) => void }

export const MotionContext = createContext<MotionContextValue | null>(null)

export function useMotionPreference() {
  const context = useContext(MotionContext)
  if (!context) throw new Error('MotionPreferenceProvider is missing')
  return context
}
