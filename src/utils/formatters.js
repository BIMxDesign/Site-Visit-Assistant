/**
 * Format date string into user's preferred date format pattern.
 */
export function formatDatePattern(rawDate, pattern = null) {
  if (!rawDate) return ''
  const fmt = pattern || (() => {
    try {
      return localStorage.getItem('sitepunch_date_format') || 'YYYY-MM-DD'
    } catch {
      return 'YYYY-MM-DD'
    }
  })()

  const raw = String(rawDate).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  let year, month, day
  if (match) {
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  } else {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    year = d.getFullYear()
    month = d.getMonth() + 1
    day = d.getDate()
  }

  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const yyyy = String(year)
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const mmm = shortMonths[month - 1] || mm
  const mmmm = fullMonths[month - 1] || mm

  switch (fmt) {
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`
    case 'DD-MMM-YYYY':
      return `${dd}-${mmm}-${yyyy}`
    case 'MMMM D, YYYY':
      return `${mmmm} ${day}, ${yyyy}`
    case 'D MMMM YYYY':
      return `${day} ${mmmm} ${yyyy}`
    case 'YYYY-MM-DD':
    default:
      return `${yyyy}-${mm}-${dd}`
  }
}

/**
 * Format date, day of week, and 12-hour AM/PM time for site visit display.
 * Example inputs: dateStr="2026-11-11", timeStr="10:10"
 * Output: "2026-11-11, Wednesday · 10:10 AM" (or formatted according to user's date format preference)
 */
export function formatVisitDateTime(dateStr, timeStr, customFormat = null, includeDay = false) {
  let formattedDate = ''
  let dayName = ''

  if (dateStr) {
    const raw = String(dateStr).trim()
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      const d = new Date(year, month - 1, day)
      if (!isNaN(d.getTime())) {
        if (includeDay) {
          dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
        }
        formattedDate = formatDatePattern(raw, customFormat)
      } else {
        formattedDate = raw
      }
    } else {
      const d = new Date(raw)
      if (!isNaN(d.getTime())) {
        if (includeDay) {
          dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
        }
        formattedDate = formatDatePattern(raw, customFormat)
      } else {
        formattedDate = raw
      }
    }
  }

  let formattedTime = ''
  if (timeStr) {
    const trimmed = String(timeStr).trim()
    if (/am|pm/i.test(trimmed)) {
      formattedTime = trimmed
    } else {
      const parts = trimmed.split(':')
      if (parts.length >= 2) {
        let h = parseInt(parts[0], 10)
        const m = parts[1].padStart(2, '0')
        if (!isNaN(h)) {
          const ampm = h >= 12 ? 'PM' : 'AM'
          h = h % 12 || 12
          formattedTime = `${h}:${m} ${ampm}`
        } else {
          formattedTime = trimmed
        }
      } else {
        formattedTime = trimmed
      }
    }
  }

  const dateAndDay = [formattedDate, dayName].filter(Boolean).join(', ')
  if (dateAndDay && formattedTime) {
    return `${dateAndDay} · ${formattedTime}`
  }
  return dateAndDay || formattedTime
}

/**
 * Truncate attendees list after maxLines (default 3) lines with continuation symbol '...'
 */
export function formatAttendeesTruncated(attendees, maxLines = 3) {
  if (!attendees) return null
  const str = String(attendees).trim()
  if (!str) return null
  let lines = str.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 1 && lines[0].includes(',')) {
    lines = lines[0].split(',').map(l => l.trim()).filter(Boolean)
  }
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join('\n') + ' ...'
  }
  return str
}

/**
 * Format a concise one-line attendees summary for card lists (stops after maxItems with '...')
 */
export function formatAttendeesSummary(attendees, maxItems = 2) {
  if (!attendees) return ''
  const str = String(attendees).trim()
  if (!str) return ''

  // Split by newlines first
  let items = str.split(/\r?\n/).map(s => s.trim()).filter(Boolean)

  // If only 1 line, check if comma-separated
  if (items.length === 1 && items[0].includes(',')) {
    items = items[0].split(',').map(s => s.trim()).filter(Boolean)
  }

  if (items.length > maxItems) {
    return items.slice(0, maxItems).join(', ') + ' ...'
  }

  const combined = items.join(', ')
  if (combined.length > 50) {
    return combined.slice(0, 47).trim() + ' ...'
  }

  return combined
}

/**
 * Truncate long observation titles/notes and append ellipsis '...' to prevent text overflow.
 */
export function truncateObservationTitle(text, maxLength = 53) {
  if (!text) return ''
  const str = String(text).trim()
  if (!str) return ''
  const firstLine = str.split(/\r?\n/)[0].trim()
  if (firstLine.length <= maxLength) return firstLine
  return firstLine.slice(0, maxLength).trimEnd() + '...'
}

/**
 * Format first name with last initial (e.g. "Ankit", "Dave" -> "Ankit D.")
 */
export function formatFirstAndLastInitial(firstName, lastName, fallbackFullName = '') {
  let f = (firstName || '').trim()
  let l = (lastName || '').trim()

  if (!f && fallbackFullName) {
    const parts = fallbackFullName.trim().split(/\s+/)
    f = parts[0] || ''
    l = parts.slice(1).join(' ') || ''
  }

  if (!f) return ''

  if (l) {
    const cleanL = l.replace(/[^a-zA-Z0-9]/g, '')
    const initial = (cleanL[0] || l[0] || '').toUpperCase()
    return initial ? `${f} ${initial}.` : f
  }

  return f
}
