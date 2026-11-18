export const SHARED_COLOR_PRESETS = [
  { id: 'brand-crimson', name: 'Brand Crimson',        hex: '#a40e26' },
  { id: 'blue',          name: 'Safety Blue',          hex: '#1d4ed8' },
  { id: 'red',           name: 'Inspector Red',        hex: '#ef4444' },
  { id: 'crimson',       name: 'Deep Crimson',         hex: '#dc2626' },
  { id: 'orange',        name: 'Safety Orange',        hex: '#ea580c' },
  { id: 'amber',         name: 'Warning Amber / Gold', hex: '#d97706' },
  { id: 'emerald',       name: 'Jobsite Emerald',      hex: '#059669' },
  { id: 'teal',          name: 'Steel Teal',           hex: '#0d9488' },
  { id: 'sky',           name: 'Electric Sky',         hex: '#0284c7' },
  { id: 'indigo',        name: 'Modern Indigo',        hex: '#4f46e5' },
  { id: 'purple',        name: 'Royal Purple',         hex: '#7c3aed' },
  { id: 'magenta',       name: 'Magenta Pink',         hex: '#db2777' },
  { id: 'navy',          name: 'Construction Navy',    hex: '#0f172a' },
  { id: 'slate',         name: 'Industrial Slate',     hex: '#334155' },
]

export const THEME_PRESETS = SHARED_COLOR_PRESETS
export const DEFAULT_THEME_COLOR = '#a40e26'

export const PIN_COLOR_PRESETS = SHARED_COLOR_PRESETS
export const DEFAULT_PIN_COLOR = '#a40e26'

export function applyPinColor(hexColor) {
  const color = (hexColor && hexColor.startsWith('#')) ? hexColor : DEFAULT_PIN_COLOR
  const { r, g, b } = hexToRgb(color)
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--punch-pin-color', color)
    root.style.setProperty('--punch-pin-color-rgb', `${r}, ${g}, ${b}`)
    try {
      localStorage.setItem('sitepunch_pin_color', color)
    } catch (_) {}
  }
}

export function hexToRgb(hex) {
  if (!hex) return { r: 164, g: 14, b: 38 }
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const num = parseInt(c, 16)
  if (isNaN(num)) return { r: 164, g: 14, b: 38 }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

export function parseThemeRgb(hex) {
  const { r, g, b } = hexToRgb(hex)
  return [r, g, b]
}

export function applyThemeColor(hexColor) {
  const color = (hexColor && hexColor.startsWith('#')) ? hexColor : DEFAULT_THEME_COLOR
  const { r, g, b } = hexToRgb(color)

  const toHex = (nr, ng, nb) => {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
    return `#${clamp(nr).toString(16).padStart(2, '0')}${clamp(ng).toString(16).padStart(2, '0')}${clamp(nb).toString(16).padStart(2, '0')}`
  }

  const mixWhite = (factor) => toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor)
  const mixBlack = (factor) => toHex(r * (1 - factor), g * (1 - factor), b * (1 - factor))

  const brand50  = mixWhite(0.95)
  const brand100 = mixWhite(0.85)
  const brand200 = mixWhite(0.70)
  const brand300 = mixWhite(0.50)
  const brand400 = mixWhite(0.28)
  const brand500 = mixWhite(0.12)
  const brand600 = color
  const brand700 = mixBlack(0.12)
  const brand800 = mixBlack(0.25)
  const brand900 = mixBlack(0.42)

  const rgbHeader = hexToRgb(brand800)
  const rgbButton = hexToRgb(brand700)

  // 1. Set CSS custom properties on document.documentElement
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--brand-color', color)
    root.style.setProperty('--brand-header', brand800)
    root.style.setProperty('--brand-button', brand700)
    root.style.setProperty('--brand-button-hover', brand800)
    root.style.setProperty('--brand-header-rgb', `${rgbHeader.r}, ${rgbHeader.g}, ${rgbHeader.b}`)
    root.style.setProperty('--brand-button-rgb', `${rgbButton.r}, ${rgbButton.g}, ${rgbButton.b}`)
    root.style.backgroundColor = brand800

    root.style.setProperty('--brand-50',  brand50)
    root.style.setProperty('--brand-100', brand100)
    root.style.setProperty('--brand-200', brand200)
    root.style.setProperty('--brand-300', brand300)
    root.style.setProperty('--brand-400', brand400)
    root.style.setProperty('--brand-500', brand500)
    root.style.setProperty('--brand-600', brand600)
    root.style.setProperty('--brand-700', brand700)
    root.style.setProperty('--brand-800', brand800)
    root.style.setProperty('--brand-900', brand900)

    // 2. Synchronous localStorage caching so reload is immediate
    try {
      localStorage.setItem('sitepunch_theme_color', color)
    } catch (_) {}

    // 3. Update browser top bar meta tag
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) metaTheme.setAttribute('content', brand800)

    // 4. Injected high-priority CSS stylesheet overriding all headers, menu bars, buttons and brand classes
    let styleEl = document.getElementById('sitepunch-theme-override')
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'sitepunch-theme-override'
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = `
      :root {
        --brand-color: ${color} !important;
        --brand-header: ${brand800} !important;
        --brand-button: ${brand700} !important;
        --brand-button-hover: ${brand800} !important;
        --brand-header-rgb: ${rgbHeader.r}, ${rgbHeader.g}, ${rgbHeader.b} !important;
        --brand-button-rgb: ${rgbButton.r}, ${rgbButton.g}, ${rgbButton.b} !important;
        --brand-50: ${brand50} !important;
        --brand-100: ${brand100} !important;
        --brand-200: ${brand200} !important;
        --brand-300: ${brand300} !important;
        --brand-400: ${brand400} !important;
        --brand-500: ${brand500} !important;
        --brand-600: ${brand600} !important;
        --brand-700: ${brand700} !important;
        --brand-800: ${brand800} !important;
        --brand-900: ${brand900} !important;
      }
      html {
        background-color: ${brand800} !important;
      }
      /* Top main page, menu bars, header bars - Solid brand header (no white fade or bleed) */
      header, .sitepunch-header, .bg-brand-800, header.bg-brand-800 {
        background: ${brand800} !important;
        background-color: ${brand800} !important;
        background-image: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18) !important;
      }
      /* Action buttons & FABs - Apple Liquid Glass primary buttons */
      .sitepunch-btn-primary, .sitepunch-fab, .bg-brand-700, button.bg-brand-700 {
        background: linear-gradient(135deg, ${brand700}, ${brand800}) !important;
        border: 1px solid rgba(255, 255, 255, 0.32) !important;
        box-shadow: 0 6px 20px -2px rgba(${rgbButton.r}, ${rgbButton.g}, ${rgbButton.b}, 0.45), inset 0 1px 1.5px rgba(255, 255, 255, 0.55) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }
      .sitepunch-btn-primary:hover, .sitepunch-fab:hover, .hover\\:bg-brand-800:hover, button.hover\\:bg-brand-800:hover {
        background: linear-gradient(135deg, ${brand800}, ${brand900}) !important;
        box-shadow: 0 8px 24px rgba(${rgbButton.r}, ${rgbButton.g}, ${rgbButton.b}, 0.55), inset 0 1px 2px rgba(255, 255, 255, 0.75) !important;
        transform: translateY(-1.5px) !important;
      }
      .hover\\:bg-brand-700:hover, button.hover\\:bg-brand-700:hover {
        background: linear-gradient(135deg, ${brand700}, ${brand800}) !important;
      }
      .bg-brand-900 {
        background-color: ${brand900} !important;
      }
      .bg-brand-600 {
        background-color: ${brand600} !important;
      }
      .bg-brand-50 {
        background-color: ${brand50} !important;
      }
      .bg-brand-100 {
        background-color: ${brand100} !important;
      }
      .text-brand-200 {
        color: ${brand200} !important;
      }
      .text-brand-300 {
        color: ${brand300} !important;
      }
      .text-brand-600 {
        color: ${brand600} !important;
      }
      .text-brand-700 {
        color: ${brand700} !important;
      }
      .text-brand-800 {
        color: ${brand800} !important;
      }
      .border-brand-600 {
        border-color: ${brand600} !important;
      }
      .border-brand-700 {
        border-color: ${brand700} !important;
      }
      .border-brand-400 {
        border-color: ${brand400} !important;
      }
      .focus\\:ring-brand-400:focus {
        --tw-ring-color: ${brand400} !important;
      }
      .accent-brand-600 {
        accent-color: ${brand600} !important;
      }
    `
  }

  return {
    color,
    brand50, brand100, brand200, brand300, brand400,
    brand500, brand600, brand700, brand800, brand900,
  }
}
