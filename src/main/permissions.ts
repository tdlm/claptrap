import { app, desktopCapturer, shell, systemPreferences } from 'electron'
import type { PermissionState, ScreenAccess } from '@shared/types'

const PANES = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
} as const

const screenAccess = (): ScreenAccess => systemPreferences.getMediaAccessStatus('screen') as ScreenAccess

// macOS applies a fresh Screen Recording grant only to processes started after it.
let screenGrantedAtLaunch = false
export function recordLaunchPermissions(): void {
  screenGrantedAtLaunch = screenAccess() === 'granted'
}

export function getPermissions(): PermissionState {
  const screen = screenAccess()
  return {
    screen,
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    needsRelaunch: screen === 'granted' && !screenGrantedAtLaunch,
    isDev: !app.isPackaged
  }
}

export const canCapture = (): boolean => screenAccess() === 'granted' && screenGrantedAtLaunch

export async function openPermissionPane(kind: keyof typeof PANES): Promise<void> {
  await shell.openExternal(PANES[kind])
}

/** Shows the system Accessibility prompt (which also adds Claptrap to the list). */
export function requestAccessibility(): void {
  systemPreferences.isTrustedAccessibilityClient(true)
}

/** A capture attempt is what makes macOS list the app under Screen Recording. */
export async function requestScreenRecording(): Promise<void> {
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
  } catch {
    // Expected while access is denied.
  }
}
