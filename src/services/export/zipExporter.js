import JSZip from 'jszip'
import { prepareKeyPlanImageForQuality, ensurePhotoMatchesQuality } from '../../utils/media'
import { formatDatePattern, normalizeObservationStatus, stripHtmlToPlainText } from '../../utils/formatters'
import { logExport } from '../../db/database'

/**
 * Packages all key plans and high-resolution defect photos into an organized ZIP archive
 */
export async function generateZipArchive({
  itemsToExport,
  project,
  effectiveReport,
  effectiveDesc = '',
  exportFields,
  availableDrawings = [],
  floorPlans = [],
  photosMap = {},
  activeQuality = 'balanced',
  isCapped = false,
  reportCreator = '',
  currentProjectUuid = '',
  renderFloorPlanWithPins,
}) {
  const zip = new JSZip()
  const safeReportName = (effectiveReport?.name || project?.name || 'Inspection_Report')
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')

  // Folder 1: Key Plans / Drawings
  const keyPlansFolder = zip.folder('01_Key_Plans')
  let keyPlansToExport = availableDrawings.length > 0 ? availableDrawings : floorPlans

  if (isCapped && keyPlansToExport.length > 1) {
    const exportedFpUuids = new Set(itemsToExport.map(i => i.floorPlanUuid).filter(Boolean))
    const cappedKeyPlans = keyPlansToExport.filter(fp => exportedFpUuids.has(fp.uuid))
    if (cappedKeyPlans.length > 0) {
      keyPlansToExport = cappedKeyPlans
    } else {
      keyPlansToExport = [keyPlansToExport[0]]
    }
  }

  for (let idx = 0; idx < keyPlansToExport.length; idx++) {
    const fp = keyPlansToExport[idx]
    const itemsInFp = itemsToExport.filter(it =>
      it.floorPlanUuid === fp.uuid ||
      (Array.isArray(it.extraPins) && it.extraPins.some(ep => ep.floorPlanUuid === fp.uuid))
    )

    // Render floor plan with pins
    const rendered = renderFloorPlanWithPins ? await renderFloorPlanWithPins(fp, itemsInFp) : null
    const safeFpName = (fp.name || `Drawing_${idx + 1}`).replace(/[^a-z0-9_-]/gi, '_')

    if (rendered?.dataUrl) {
      const base64Data = rendered.dataUrl.split(',')[1]
      if (base64Data) {
        keyPlansFolder.file(`${String(idx + 1).padStart(2, '0')}_${safeFpName}_with_pins.jpg`, base64Data, { base64: true })
      }
    } else if (fp.imageData) {
      const processedFpData = await prepareKeyPlanImageForQuality(fp.imageData, activeQuality)
      const base64Data = processedFpData.split(',')[1]
      if (base64Data) {
        const ext = processedFpData.startsWith('data:image/png') ? 'png' : 'jpg'
        keyPlansFolder.file(`${String(idx + 1).padStart(2, '0')}_${safeFpName}.${ext}`, base64Data, { base64: true })
      }
    }
  }

  // Folder 2: Observation Photos
  const photosFolder = zip.folder('02_Observation_Photos')
  let totalPhotosAdded = 0

  for (const item of itemsToExport) {
    const itemPhotos = photosMap[item.uuid] || []
    const itemNum = String(item.itemNumber || '').padStart(2, '0')
    const tradeTag = (item.trade || 'General').replace(/[^a-z0-9_-]/gi, '_')

    for (let pIdx = 0; pIdx < itemPhotos.length; pIdx++) {
      const photo = itemPhotos[pIdx]
      if (photo.imageData && photo.imageData.includes('base64,')) {
        const processedPhoto = await ensurePhotoMatchesQuality(photo.imageData, activeQuality)
        const base64Data = processedPhoto.split(',')[1]
        if (base64Data) {
          const ext = processedPhoto.startsWith('data:image/png') ? 'png' : 'jpg'
          const filename = `Pin_${itemNum}_Photo_${pIdx + 1}_${tradeTag}.${ext}`
          photosFolder.file(filename, base64Data, { base64: true })
          totalPhotosAdded++
        }
      }
    }
  }

  // Summary README
  let readme = `===========================================================\r\n`
  readme += `SITE PUNCH - IMAGES ARCHIVE EXPORT\r\n`
  readme += `===========================================================\r\n\r\n`
  readme += `Project: ${project?.name || 'Untitled Project'}\r\n`
  if (effectiveDesc) {
    readme += `Description: ${effectiveDesc}\r\n`
  }
  readme += `Report:  ${effectiveReport?.name || 'Inspection Walk'}\r\n`
  if (exportFields.reportCreatedBy) {
    const creator = effectiveReport?.createdBy || reportCreator
    if (creator) readme += `Report Created By: ${creator}\r\n`
  }
  if (exportFields.attendees && effectiveReport?.attendees) {
    let attList = effectiveReport.attendees.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (attList.length === 1 && attList[0].includes(',')) {
      attList = attList[0].split(',').map(s => s.trim()).filter(Boolean)
    }
    if (attList.length > 0) {
      readme += `Attendees:\r\n`
      attList.forEach(a => { readme += `  • ${a}\r\n` })
    }
  }
  readme += `Date:    ${new Date().toLocaleString()}\r\n`
  readme += `Items:   ${itemsToExport.length} observation(s) exported\r\n`
  readme += `Photos:  ${totalPhotosAdded} observation photo(s)\r\n`
  readme += `Plans:   ${keyPlansToExport.length} key plan drawing(s)\r\n\r\n`
  if (isCapped) {
    readme += `[NOTE] This project is unlicensed. Images export is limited to the first 2 observations.\r\n\r\n`
  }
  readme += `-----------------------------------------------------------\r\n`
  readme += `OBSERVATIONS OVERVIEW\r\n`
  readme += `-----------------------------------------------------------\r\n`
  itemsToExport.forEach((it, idx) => {
    const pCount = (photosMap[it.uuid] || []).length
    readme += `#${it.itemNumber || idx + 1} | Category: ${it.trade || 'General'} | Priority: ${it.priority || 'Medium'} | Status: ${normalizeObservationStatus(it.status)}\r\n`
    if (it.notes) readme += `   Notes: ${stripHtmlToPlainText(it.notes)}\r\n`
    if (pCount > 0) readme += `   Photos: ${pCount} attached\r\n`
    readme += `\r\n`
  })

  zip.file('README.txt', readme)

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  const filename = `${safeReportName}_Images_${formatDatePattern(new Date(), 'YYYY-MM-DD')}.zip`
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  logExport({
    projectUuid: currentProjectUuid || '',
    projectName: project?.name || '',
    type: 'zip',
    reportName: effectiveReport?.name || project?.name || '',
    filename,
    pageCount: null,
  }).catch(() => {})

  return { success: true, filename }
}
