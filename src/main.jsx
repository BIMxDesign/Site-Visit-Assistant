import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyThemeColor, DEFAULT_THEME_COLOR } from './utils/theme'
import { applyAppFont, DEFAULT_FONT_ID } from './utils/font'

// Apply persisted theme & font immediately before React mount
try {
  const initialTheme = localStorage.getItem('sitepunch_theme_color') || DEFAULT_THEME_COLOR
  applyThemeColor(initialTheme)
  const initialFont = localStorage.getItem('sitepunch_app_font_id') || DEFAULT_FONT_ID
  applyAppFont(initialFont)
} catch (_) {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
