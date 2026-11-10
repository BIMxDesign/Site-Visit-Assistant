export const FONT_OPTIONS = [
  {
    id: 'sans',
    name: 'Sans-Serif (Default)',
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    sample: 'The quick brown fox jumps over the lazy dog',
    pdfFont: 'helvetica',
  },
  {
    id: 'inter',
    name: 'Inter (Modern Clean)',
    family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sample: 'Clean, legible modern construction typography',
    pdfFont: 'helvetica',
  },
  {
    id: 'roboto',
    name: 'Roboto (Technical)',
    family: '"Roboto", "Segoe UI", Arial, sans-serif',
    sample: 'Structured precision for engineering punch walks',
    pdfFont: 'helvetica',
  },
  {
    id: 'outfit',
    name: 'Outfit (Geometric)',
    family: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif',
    sample: 'Geometric architectural design aesthetics',
    pdfFont: 'helvetica',
  },
  {
    id: 'open-sans',
    name: 'Open Sans (Neutral)',
    family: '"Open Sans", Helvetica, Arial, sans-serif',
    sample: 'Balanced neutrality across mobile and desktop',
    pdfFont: 'helvetica',
  },
  {
    id: 'system',
    name: 'System UI (Native)',
    family: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    sample: 'Native platform feel with optimal performance',
    pdfFont: 'helvetica',
  },
  {
    id: 'mono',
    name: 'Monospace (Field Data)',
    family: 'ui-monospace, "SF Mono", "Roboto Mono", "Courier New", monospace',
    sample: 'Fixed-width tabular layout for observation specs',
    pdfFont: 'courier',
  },
  {
    id: 'serif',
    name: 'Serif (Architectural)',
    family: 'Georgia, "Times New Roman", serif',
    sample: 'Classic editorial documentation layout',
    pdfFont: 'times',
  },
]

export const DEFAULT_FONT_ID = 'sans'

export function getPdfFont(fontId) {
  const match = FONT_OPTIONS.find(f => f.id === fontId)
  return match?.pdfFont || 'helvetica'
}

export function getFontFamily(fontId) {
  const match = FONT_OPTIONS.find(f => f.id === fontId)
  return match?.family || FONT_OPTIONS[0].family
}

export function applyAppFont(fontId) {
  const match = FONT_OPTIONS.find(f => f.id === fontId) || FONT_OPTIONS[0]
  document.documentElement.style.setProperty('--app-font-family', match.family)
  document.body.style.fontFamily = match.family
}
