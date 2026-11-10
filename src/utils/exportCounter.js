const STORAGE_KEY = 'sitepunch_exported_pdf_count'

export function getExportedPdfCount() {
  try {
    const val = localStorage.getItem(STORAGE_KEY)
    return val ? parseInt(val, 10) || 0 : 0
  } catch {
    return 0
  }
}

export function incrementExportedPdfCount() {
  try {
    const current = getExportedPdfCount()
    const next = current + 1
    localStorage.setItem(STORAGE_KEY, String(next))
    return next
  } catch {
    return 0
  }
}
