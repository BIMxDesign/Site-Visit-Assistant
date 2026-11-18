import { normalizeObservationStatus, stripHtmlToPlainText } from '../../utils/formatters'
import { logExport } from '../../db/database'

function escapeCSV(val) {
  if (val == null) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

/**
 * Generates and downloads a CSV spreadsheet report for punch list observations
 */
export async function generateCsvReport({
  itemsToExport,
  project,
  effectiveReport,
  effectiveDesc = '',
  exportFields,
  floorPlans = [],
  phases = [],
  activeReport,
  reportCreator = '',
  photosMap = {},
  filterDrawing = 'All',
  currentProjectUuid = '',
}) {
  const headers = ['Item #', 'Report']
  if (effectiveDesc) headers.push('Report Description')
  if (exportFields.keyPlans)       headers.push('Key Plan')
  if (exportFields.trade)          headers.push('Category')
  if (exportFields.priority)       headers.push('Priority')
  if (exportFields.status)         headers.push('Status')
  headers.push('Assigned To')
  if (exportFields.dueDate)        headers.push('Due Date')
  if (exportFields.notes)          headers.push('Observation Notes')
  headers.push('Visit Date', 'Visit Time', 'Weather')
  if (exportFields.reportCreatedBy) headers.push('Report Created By')
  if (exportFields.attendees)       headers.push('List of Attendees')
  if (exportFields.keyPlans)       headers.push('Pin X', 'Pin Y')
  if (exportFields.photos)         headers.push('Photos Count')

  const rows = itemsToExport.map(item => {
    const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
    const phase = phases.find(p => p.uuid === (item.phaseUuid || fp?.phaseUuid)) || activeReport || effectiveReport
    const pCount = (photosMap[item.uuid] || []).length
    const cols = [escapeCSV(item.itemNumber || ''), escapeCSV(phase?.name || '')]
    if (effectiveDesc) cols.push(escapeCSV(effectiveDesc))
    if (exportFields.keyPlans)       cols.push(escapeCSV(fp?.name || ''))
    if (exportFields.trade)          cols.push(escapeCSV(item.trade || ''))
    if (exportFields.priority)       cols.push(escapeCSV(item.priority || ''))
    if (exportFields.status)         cols.push(escapeCSV(normalizeObservationStatus(item.status)))
    cols.push(escapeCSV(item.assignedTo || ''))
    if (exportFields.dueDate)        cols.push(escapeCSV(item.dueDate || ''))
    if (exportFields.notes)          cols.push(escapeCSV(stripHtmlToPlainText(item.notes || '')))
    cols.push(
      escapeCSV(phase?.visitDate || ''),
      escapeCSV(phase?.visitTime || ''),
      escapeCSV(phase?.weather || '')
    )
    if (exportFields.reportCreatedBy) {
      cols.push(escapeCSV(phase?.createdBy || effectiveReport?.createdBy || reportCreator || ''))
    }
    if (exportFields.attendees) {
      cols.push(escapeCSV(phase?.attendees || effectiveReport?.attendees || ''))
    }
    if (exportFields.keyPlans) {
      cols.push(
        escapeCSV(item.pinX != null ? Math.round(item.pinX) : ''),
        escapeCSV(item.pinY != null ? Math.round(item.pinY) : '')
      )
    }
    if (exportFields.photos) {
      cols.push(escapeCSV(pCount))
    }
    return cols.join(',')
  })

  const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeReport = (effectiveReport?.name || project?.name || 'Report').replace(/[^a-z0-9]/gi, '_')
  const currentDrawingObj = floorPlans.find(f => f.uuid === filterDrawing)
  const safeDrawing = filterDrawing !== 'All' && currentDrawingObj ? `_${currentDrawingObj.name.replace(/[^a-z0-9]/gi, '_')}` : ''
  const filename = `PunchList_${safeReport}${safeDrawing}_${new Date().toISOString().slice(0, 10)}.csv`

  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  // Log CSV export per-project
  logExport({
    projectUuid: currentProjectUuid || '',
    projectName: project?.name || '',
    type: 'csv',
    reportName: effectiveReport?.name || project?.name || '',
    filename,
    pageCount: null,
  }).catch(() => {})

  return { success: true, filename }
}
