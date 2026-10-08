import type { ClaptrapApi } from '../shared/types'

declare global {
  interface Window {
    claptrap: ClaptrapApi
  }
}

export {}
