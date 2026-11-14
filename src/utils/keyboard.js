import { Capacitor } from '@capacitor/core'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'

/**
 * Finds the nearest scrollable ancestor of an element (overflow-y: auto / scroll).
 */
function findScrollParent(element) {
  if (!element) return null
  let parent = element.parentElement
  while (parent) {
    if (parent === document.body || parent === document.documentElement) {
      return null
    }
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

/**
 * Strictly keeps the outer window/body pinned at (0, 0)
 * so the fixed header/menu never moves down to create a white space at the top.
 */
export function lockWindowToTop() {
  if (typeof window === 'undefined') return
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0)
  }
  if (document.body && document.body.scrollTop !== 0) {
    document.body.scrollTop = 0
  }
  if (document.documentElement && document.documentElement.scrollTop !== 0) {
    document.documentElement.scrollTop = 0
  }
}

/**
 * Scrolls the active element above the keyboard ONLY IF it is located towards
 * the bottom of the page and would otherwise be hidden behind the typing pad.
 *
 * If the element is already in the upper/middle portion of the screen, it does NOT
 * scroll, preventing unnecessary jumps or pulling the top header down.
 *
 * It scrolls ONLY within the inner scrollable container (e.g. form body), NEVER scrolling
 * the window or body.
 */
export function scrollElementAboveKeyboardIfNeeded(element) {
  if (!element || typeof window === 'undefined') return

  // 1. Maintain outer window strictly at top 0
  lockWindowToTop()

  const scrollParent = findScrollParent(element)
  if (!scrollParent) return

  const parentRect = scrollParent.getBoundingClientRect()
  const elRect = element.getBoundingClientRect()

  // 2. Determine visible height above the keyboard.
  // In mobile browsers (Safari / Chrome), visualViewport.height reflects the area above the keyboard.
  let keyboardBoundary = window.innerHeight * 0.58 // sensible fallback on mobile
  if (window.visualViewport) {
    keyboardBoundary = window.visualViewport.offsetTop + window.visualViewport.height
  }

  // Safe bottom line with 24px padding above keyboard
  const safeBottomLimit = Math.min(parentRect.bottom, keyboardBoundary) - 24

  // 3. ONLY scroll if the field extends BELOW the safe boundary!
  if (elRect.bottom > safeBottomLimit) {
    const scrollAmount = elRect.bottom - safeBottomLimit + 32
    scrollParent.scrollBy({
      top: scrollAmount,
      behavior: 'smooth',
    })
  }

  // Keep window at 0
  requestAnimationFrame(lockWindowToTop)
}

/**
 * Initializes global mobile keyboard handlers.
 */
export function initMobileKeyboardFix() {
  if (typeof window === 'undefined') return () => {}

  // Native Capacitor Keyboard configuration
  if (Capacitor.isNativePlatform()) {
    try {
      Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {})
      Keyboard.setScroll({ isDisabled: false }).catch(() => {})
      Keyboard.addListener('keyboardDidShow', () => {
        lockWindowToTop()
        const active = document.activeElement
        if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
          scrollElementAboveKeyboardIfNeeded(active)
        }
      })
      Keyboard.addListener('keyboardDidHide', () => {
        lockWindowToTop()
      })
    } catch (err) {
      console.warn('Native keyboard initialization:', err)
    }
  }

  let activeScrollContainer = null
  let originalPadding = null

  const handleFocusIn = (e) => {
    const el = e.target
    if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
    if (['checkbox', 'radio', 'hidden', 'file', 'button', 'submit'].includes(el.type)) return

    lockWindowToTop()

    const scrollParent = findScrollParent(el)
    if (scrollParent) {
      if (activeScrollContainer && activeScrollContainer !== scrollParent && originalPadding !== null) {
        activeScrollContainer.style.paddingBottom = originalPadding
      }
      activeScrollContainer = scrollParent
      originalPadding = scrollParent.style.paddingBottom || ''
      // Provide extra scroll space at the bottom so fields near the end of a form can scroll up
      scrollParent.style.paddingBottom = '300px'
    }

    const checkAndScroll = () => {
      if (document.activeElement === el) {
        scrollElementAboveKeyboardIfNeeded(el)
      }
    }

    requestAnimationFrame(checkAndScroll)
    setTimeout(checkAndScroll, 100)
    setTimeout(checkAndScroll, 300)
    setTimeout(checkAndScroll, 500)
  }

  const handleFocusOut = (e) => {
    const el = e.target
    if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return

    lockWindowToTop()

    setTimeout(() => {
      const active = document.activeElement
      const isInput = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) &&
        !['checkbox', 'radio', 'hidden', 'file', 'button', 'submit'].includes(active.type)

      if (!isInput) {
        if (activeScrollContainer && originalPadding !== null) {
          activeScrollContainer.style.paddingBottom = originalPadding
          activeScrollContainer = null
          originalPadding = null
        }
        lockWindowToTop()
      }
    }, 200)
  }

  const handleViewportResize = () => {
    lockWindowToTop()
    const active = document.activeElement
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
      if (!['checkbox', 'radio', 'hidden', 'file', 'button', 'submit'].includes(active.type)) {
        scrollElementAboveKeyboardIfNeeded(active)
      }
    }
  }

  const handleWindowScroll = () => {
    // If the browser ever attempts to scroll the window downwards, keep it locked at 0
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0)
    }
  }

  document.addEventListener('focusin', handleFocusIn, { passive: true })
  document.addEventListener('focusout', handleFocusOut, { passive: true })
  window.addEventListener('scroll', handleWindowScroll, { passive: true })

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize, { passive: true })
    window.visualViewport.addEventListener('scroll', lockWindowToTop, { passive: true })
  }

  return () => {
    document.removeEventListener('focusin', handleFocusIn)
    document.removeEventListener('focusout', handleFocusOut)
    window.removeEventListener('scroll', handleWindowScroll)
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', handleViewportResize)
      window.visualViewport.removeEventListener('scroll', lockWindowToTop)
    }
  }
}
