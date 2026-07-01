import { Capacitor } from '@capacitor/core'

export function isMobileRuntime(): boolean {
  if (Capacitor.isNativePlatform()) return true
  return new URLSearchParams(window.location.search).get('mobile') === '1'
}

export function markMobileRuntime(): void {
  document.documentElement.classList.add('mobile-runtime')
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('capacitor-native')
    document.documentElement.setAttribute('data-platform', Capacitor.getPlatform())
  }
}
