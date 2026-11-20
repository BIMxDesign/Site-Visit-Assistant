import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'
import { applyThemeColor, DEFAULT_THEME_COLOR, applyPinColor, DEFAULT_PIN_COLOR } from './utils/theme'
import { applyAppFont, DEFAULT_FONT_ID } from './utils/font'
import { initStoragePersistence } from './utils/pwa'

// Register PWA service worker safely for offline caching (survives iPad / Safari private browsing)
if (typeof window !== 'undefined') {
  try {
    registerSW({ immediate: true })
  } catch (swErr) {
    console.warn('Service worker registration note:', swErr)
  }
  try {
    initStoragePersistence()
  } catch (pErr) {
    console.warn('Storage persistence check note:', pErr)
  }
}

// Apply persisted theme, pin color & font immediately before React mount
try {
  let initialTheme = localStorage.getItem('sitepunch_theme_color')
  if (!initialTheme || initialTheme === '#1d4ed8') {
    initialTheme = DEFAULT_THEME_COLOR
    localStorage.setItem('sitepunch_theme_color', DEFAULT_THEME_COLOR)
  }
  applyThemeColor(initialTheme)

  let initialPin = localStorage.getItem('sitepunch_pin_color')
  if (!initialPin || initialPin === '#ef4444') {
    initialPin = DEFAULT_PIN_COLOR
    localStorage.setItem('sitepunch_pin_color', DEFAULT_PIN_COLOR)
  }
  applyPinColor(initialPin)

  const initialFont = localStorage.getItem('sitepunch_app_font_id') || DEFAULT_FONT_ID
  applyAppFont(initialFont)
} catch (_) {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
