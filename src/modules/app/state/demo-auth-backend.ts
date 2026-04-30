import {
  clearAllDemoData,
  clearDemoSession,
  getDemoSession,
  getDemoUsers,
  setDemoSession,
  setDemoUsers,
} from './demo-store'

export const useDemoAuthBackend = createGlobalState(() => ({
  getDemoUsers,
  setDemoUsers,
  getDemoSession,
  setDemoSession,
  clearDemoSession,
  clearAllDemoData,
}))
