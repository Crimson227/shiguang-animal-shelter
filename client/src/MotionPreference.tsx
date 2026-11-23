import { useLayoutEffect, useState, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { MotionContext } from './motionPreferenceContext'

const preferenceKey = 'shiguang-motion'

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(() => {
    try { return localStorage.getItem(preferenceKey) === 'reduce' } catch { return false }
  })
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduce' : 'full'
    try { localStorage.setItem(preferenceKey, reduced ? 'reduce' : 'full') } catch { /* In-memory preference still works. */ }
  }, [reduced])
  return <MotionContext.Provider value={{ reduced, setReduced }}><MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig></MotionContext.Provider>
}
