import { useState, useEffect } from 'react'

let deferredInstallPrompt = null
const installListeners = new Set()

function notifyInstallListeners() {
  installListeners.forEach(listener => {
    try {
      listener(deferredInstallPrompt)
    } catch {}
  })
}

// Check if running as installed standalone PWA or Electron
export function isRunningStandalone() {
  if (typeof window === 'undefined') return false
  if (window.electronAPI?.isElectron) return true
  if (window.navigator?.standalone === true) return true
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia && window.matchMedia('(display-mode: window-controls-overlay)').matches) return true
  return false
}

// Request browser to make local IndexedDB storage persistent (prevents eviction under disk pressure)
export async function initStoragePersistence() {
  if (typeof navigator === 'undefined' || !navigator.storage) return false
  try {
    let persisted = false
    if (navigator.storage.persisted) {
      persisted = await navigator.storage.persisted()
    }
    if (!persisted && navigator.storage.persist) {
      persisted = await navigator.storage.persist()
      console.log('Site Visit Assistant: Persistent Storage granted =', persisted)
    }
    return persisted
  } catch (err) {
    console.warn('Persistent storage check failed:', err)
    return false
  }
}

// Query storage estimate (MB used and quota)
export async function getStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return null
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const usageMB = (usage / (1024 * 1024)).toFixed(1)
    const quotaMB = (quota / (1024 * 1024)).toFixed(0)
    const percent = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0
    return { usageMB, quotaMB, percent, usageBytes: usage, quotaBytes: quota }
  } catch {
    return null
  }
}

// Initialize global PWA install event listener
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default mini-infobar on mobile and capture deferred prompt
    e.preventDefault()
    deferredInstallPrompt = e
    notifyInstallListeners()
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    notifyInstallListeners()
    console.log('Site Visit Assistant: App installed successfully')
  })
}

/**
 * React Hook for PWA status, install prompts, offline state, and storage persistence.
 */
export function usePwa() {
  const [canInstall, setCanInstall] = useState(() => Boolean(deferredInstallPrompt))
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone())
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [isPersistent, setIsPersistent] = useState(false)
  const [storageInfo, setStorageInfo] = useState(null)
  const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron)

  useEffect(() => {
    const handlePromptChange = (prompt) => {
      setCanInstall(Boolean(prompt))
      setIsInstalled(isRunningStandalone())
    }

    installListeners.add(handlePromptChange)

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check display-mode media query changes
    const media = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null
    const handleMediaChange = (e) => {
      if (e.matches) {
        setIsInstalled(true)
        setCanInstall(false)
      }
    }
    if (media?.addEventListener) {
      media.addEventListener('change', handleMediaChange)
    }

    // Check storage persistence and usage
    initStoragePersistence().then(granted => {
      setIsPersistent(Boolean(granted))
      getStorageEstimate().then(setStorageInfo)
    })

    return () => {
      installListeners.delete(handlePromptChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (media?.removeEventListener) {
        media.removeEventListener('change', handleMediaChange)
      }
    }
  }, [])

  // Prompt the user to install the PWA on macOS, Windows, or Chrome/Edge/Safari
  const installApp = async () => {
    if (!deferredInstallPrompt) return false
    try {
      deferredInstallPrompt.prompt()
      const choice = await deferredInstallPrompt.userChoice
      if (choice?.outcome === 'accepted') {
        deferredInstallPrompt = null
        setCanInstall(false)
        setIsInstalled(true)
        return true
      }
      return false
    } catch (err) {
      console.warn('Install prompt failed:', err)
      return false
    }
  }

  return {
    canInstall,
    isInstalled,
    isOffline,
    isElectron,
    isPersistent,
    storageInfo,
    installApp,
  }
}
