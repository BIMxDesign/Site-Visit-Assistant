import { prepareLogoForQuality, ensurePhotoMatchesQuality } from '../../utils/media'
import { formatDatePattern, formatVisitDateTime, normalizeObservationStatus, stripHtmlToPlainText } from '../../utils/formatters'
import { getImageDimensions } from './drawingRenderer'
import { logExport } from '../../db/database'

function toUint8(dataUrl) {
  if (!dataUrl) return null
  try {
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
    const bin = window.atob(b64)
    const len = bin.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i)
    }
    return bytes
  } catch (e) {
    console.warn('Failed to convert image to Uint8Array for docx:', e)
    return null
  }
}

async function getScaledDims(dataUrl, maxW, maxH) {
  const dims = await getImageDimensions(dataUrl)
  let w = dims.width || maxW
  let h = dims.height || maxH
  const aspect = (dims.aspect && dims.aspect > 0) ? dims.aspect : (w / h)
  if (w > maxW) {
    w = maxW
    h = Math.round(w / aspect)
  }
  if (h > maxH) {
    h = maxH
    w = Math.round(h * aspect)
  }
  return { width: Math.max(10, Math.round(w)), height: Math.max(10, Math.round(h)) }
}

/**
 * Generates and downloads a Word Document (.docx) report
 */
export async function generateWordReport({
  itemsToExport,
  project,
  effectiveReport,
  exportFields,
  availableDrawings = [],
  floorPlans = [],
  photosMap = {},
  activeQuality = 'balanced',
  isCapped = false,
  paperSize = 'letter',
  orientation = 'portrait',
  companyLogo = null,
  reportCreator = '',
  currentProjectUuid = '',
  renderFloorPlanWithPins,
  renderPinDrawingCrop,
}) {
  const {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    ImageRun,
    PageNumber,
    Footer,
    Packer,
    PageOrientation,
  } = await import('docx')

  const safeReportName = (effectiveReport?.name || project?.name || 'Inspection_Report')
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')

  const isLandscape = orientation === 'landscape'
  const pageWidthDxa = isLandscape
    ? (paperSize === 'a4' ? 16838 : paperSize === 'tabloid' ? 24480 : 15840)
    : (paperSize === 'a4' ? 11906 : paperSize === 'tabloid' ? 15840 : 12240)
  const pageHeightDxa = isLandscape
    ? (paperSize === 'a4' ? 11906 : paperSize === 'tabloid' ? 15840 : 12240)
    : (paperSize === 'a4' ? 16838 : paperSize === 'tabloid' ? 24480 : 15840)

  const docChildren = []

  // 1. Report Header & Title
  docChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: project?.name || 'Untitled Project', bold: true, size: 36, color: '1E3A8A' }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 140 },
      children: [
        new TextRun({ text: effectiveReport?.name || 'Site Visit Report', bold: true, size: 24, color: '374151' }),
      ],
    })
  )

  // Company Logo if present
  if (companyLogo) {
    try {
      const processedLogo = await prepareLogoForQuality(companyLogo, activeQuality)
      const logoBytes = toUint8(processedLogo)
      if (logoBytes) {
        const logoDims = await getScaledDims(processedLogo, 160, 55)
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 120 },
            children: [
              new ImageRun({
                data: logoBytes,
                transformation: logoDims,
              }),
            ],
          })
        )
      }
    } catch (e) {
      console.warn('Failed to embed logo in docx:', e)
    }
  }

  // Description if present
  const effectiveDesc = (effectiveReport?.description?.trim()) || (project?.description?.trim()) || ''
  if (effectiveDesc) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 40, after: 120 },
        children: [
          new TextRun({ text: effectiveDesc, italic: true, size: 20, color: '4B5563' }),
        ],
      })
    )
  }

  // Metadata Block (Date, Time, Weather, Created By, Attendees)
  const visitDateTimeStr = formatVisitDateTime(effectiveReport?.visitDate, effectiveReport?.visitTime)
  const effectiveWeather = effectiveReport?.weather || ''
  const metaRuns = []
  if (visitDateTimeStr) {
    metaRuns.push(new TextRun({ text: 'Date & Time: ', bold: true, size: 20, color: '111827' }))
    metaRuns.push(new TextRun({ text: `${visitDateTimeStr}     `, size: 20, color: '374151' }))
  }
  if (effectiveWeather) {
    metaRuns.push(new TextRun({ text: 'Weather: ', bold: true, size: 20, color: '111827' }))
    metaRuns.push(new TextRun({ text: `${effectiveWeather}     `, size: 20, color: '374151' }))
  }
  if (exportFields.reportCreatedBy) {
    const creator = effectiveReport?.createdBy || reportCreator
    if (creator) {
      metaRuns.push(new TextRun({ text: 'Created By: ', bold: true, size: 20, color: '111827' }))
      metaRuns.push(new TextRun({ text: `${creator}     `, size: 20, color: '374151' }))
    }
  }
  if (metaRuns.length > 0) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 60, after: 100 },
        children: metaRuns,
      })
    )
  }

  if (exportFields.attendees && effectiveReport?.attendees) {
    let attList = effectiveReport.attendees.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (attList.length === 1 && attList[0].includes(',')) {
      attList = attList[0].split(',').map(s => s.trim()).filter(Boolean)
    }
    if (attList.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 40, after: 120 },
          children: [
            new TextRun({ text: 'List of Attendees: ', bold: true, size: 20, color: '111827' }),
            new TextRun({ text: attList.join(', '), size: 20, color: '4B5563' }),
          ],
        })
      )
    }
  }

  // 2. Key Plans Section (Full drawings with pin markers)
  if (exportFields.keyPlans) {
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

    if (keyPlansToExport.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 240, after: 100 },
          children: [
            new TextRun({ text: 'Key Plans', bold: true, size: 26, color: '1E3A8A' }),
          ],
        })
      )

      for (let idx = 0; idx < keyPlansToExport.length; idx++) {
        const fp = keyPlansToExport[idx]
        const itemsInFp = itemsToExport.filter(it =>
          it.floorPlanUuid === fp.uuid ||
          (Array.isArray(it.extraPins) && it.extraPins.some(ep => ep.floorPlanUuid === fp.uuid))
        )

        const rendered = renderFloorPlanWithPins ? await renderFloorPlanWithPins(fp, itemsInFp) : null
        const planDataUrl = rendered?.dataUrl || fp.imageData
        if (planDataUrl) {
          const planBytes = toUint8(planDataUrl)
          if (planBytes) {
            const maxPlanW = isLandscape ? 680 : 520
            const planDims = await getScaledDims(planDataUrl, maxPlanW, 400)
            docChildren.push(
              new Paragraph({
                spacing: { before: 100, after: 60 },
                children: [
                  new TextRun({ text: fp.name || `Drawing ${idx + 1}`, bold: true, size: 20, color: '1F2937' }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 160 },
                children: [
                  new ImageRun({
                    data: planBytes,
                    transformation: planDims,
                  }),
                ],
              })
            )
          }
        }
      }
    }
  }

  // Pre-process drawing crops and photos for observations
  const exportPinCropMap = {}
  if (exportFields.reportAsTable || exportFields.keyPlanSnips) {
    for (const it of itemsToExport) {
      const fp = floorPlans.find(f => f.uuid === it.floorPlanUuid)
      if (fp && renderPinDrawingCrop) {
        const crop = await renderPinDrawingCrop(fp, it)
        if (crop) exportPinCropMap[it.uuid] = crop
      }
    }
  }

  const exportPhotosMap = {}
  if (exportFields.photos) {
    for (const it of itemsToExport) {
      const pList = photosMap[it.uuid] || []
      const processed = []
      for (const p of pList) {
        if (p.imageData && p.imageData.includes('base64,')) {
          const proc = await ensurePhotoMatchesQuality(p.imageData, activeQuality)
          processed.push(proc)
        }
      }
      exportPhotosMap[it.uuid] = processed
    }
  }

  // 3. Observations Section
  docChildren.push(
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({ text: 'Observations', bold: true, size: 26, color: '1E3A8A' }),
      ],
    })
  )

  if (exportFields.reportAsTable) {
    // Table Layout
    const candidateCols = []
    if (exportFields.keyPlanSnips) candidateCols.push({ id: 'keyPlanSnips', title: 'Key Plan', weight: 20 })
    if (exportFields.trade) candidateCols.push({ id: 'trade', title: 'Category', weight: 14 })
    if (exportFields.notes) candidateCols.push({ id: 'notes', title: 'Description', weight: 32 })
    if (exportFields.status) candidateCols.push({ id: 'status', title: 'Status', weight: 10 })
    if (exportFields.priority) candidateCols.push({ id: 'priority', title: 'Priority', weight: 10 })
    if (exportFields.dueDate) candidateCols.push({ id: 'dueDate', title: 'Due Date', weight: 11 })
    if (exportFields.photos) candidateCols.push({ id: 'photos', title: 'Photos', weight: 24 })

    const totalWeight = candidateCols.reduce((sum, c) => sum + c.weight, 0) || 100
    const activeCols = candidateCols.map(c => ({
      ...c,
      percent: Math.round((c.weight / totalWeight) * 100),
    }))

    // Header row: titles without underline, centered alignment
    const headerCells = activeCols.map(col =>
      new TableCell({
        width: { size: col.percent, type: WidthType.PERCENTAGE },
        shading: { fill: 'F3F4F6' },
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: col.title, bold: true, size: 19, color: '111827' }),
            ],
          }),
        ],
      })
    )

    const tableRows = [
      new TableRow({
        tableHeader: true,
        children: headerCells,
      }),
    ]

    for (const item of itemsToExport) {
      const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
      const photos = exportPhotosMap[item.uuid] || []
      const crop = exportPinCropMap[item.uuid]

      const rowCells = []

      for (const col of activeCols) {
        const cellChildren = []

        if (col.id === 'keyPlanSnips') {
          if (crop?.dataUrl) {
            const cropBytes = toUint8(crop.dataUrl)
            if (cropBytes) {
              const cropDims = await getScaledDims(crop.dataUrl, 105, 105)
              cellChildren.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 20, after: 40 },
                  children: [
                    new ImageRun({
                      data: cropBytes,
                      transformation: cropDims,
                    }),
                  ],
                })
              )
            }
          }
          const sheetName = fp?.name || ''
          if (sheetName) {
            cellChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: sheetName, size: 16, color: '4B5563' }),
                ],
              })
            )
          }
          if (cellChildren.length === 0) {
            cellChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '—', size: 18, color: '9CA3AF' })] }))
          }
        } else if (col.id === 'trade') {
          cellChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: item.trade || 'General', size: 18, color: '374151' }),
              ],
            })
          )
        } else if (col.id === 'notes') {
          const cleanNotes = stripHtmlToPlainText(item.notes || '—')
          cellChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Punch Item ${item.itemNumber || ''}\n`, bold: true, size: 18, color: '1E40AF' }),
                new TextRun({ text: cleanNotes, size: 18, color: '1F2937' }),
              ],
            })
          )
        } else if (col.id === 'status') {
          const st = normalizeObservationStatus(item.status)
          cellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: st,
                  bold: true,
                  size: 18,
                  color: item.status === 'closed' ? '059669' : 'D97706',
                }),
              ],
            })
          )
        } else if (col.id === 'priority') {
          cellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: item.priority || 'Medium', size: 18, color: '374151' }),
              ],
            })
          )
        } else if (col.id === 'dueDate') {
          cellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: item.dueDate || '—', size: 18, color: '4B5563' }),
              ],
            })
          )
        } else if (col.id === 'photos') {
          if (photos.length > 0) {
            const photoRuns = []
            for (let pIdx = 0; pIdx < photos.length; pIdx++) {
              const pData = photos[pIdx]
              const pBytes = toUint8(pData)
              if (pBytes) {
                const pDims = await getScaledDims(pData, 105, 105)
                photoRuns.push(
                  new ImageRun({
                    data: pBytes,
                    transformation: pDims,
                  })
                )
                if (pIdx < photos.length - 1) {
                  photoRuns.push(new TextRun({ text: '  ' }))
                }
              }
            }
            if (photoRuns.length > 0) {
              cellChildren.push(
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: photoRuns,
                })
              )
            }
          }
          if (cellChildren.length === 0) {
            cellChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '—', size: 18, color: '9CA3AF' })] }))
          }
        }

        rowCells.push(
          new TableCell({
            width: { size: col.percent, type: WidthType.PERCENTAGE },
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
            children: cellChildren,
          })
        )
      }

      tableRows.push(
        new TableRow({
          children: rowCells,
        })
      )
    }

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        },
        rows: tableRows,
      })
    )
  } else {
    // Standard Observation Item Layout (List with Key Plan Snip on Left and Notes/Photos on Right)
    for (let idx = 0; idx < itemsToExport.length; idx++) {
      const item = itemsToExport[idx]
      const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
      const photos = exportPhotosMap[item.uuid] || []
      const crop = exportPinCropMap[item.uuid]

      // Item Title Bar
      const titleRuns = [
        new TextRun({ text: `#${item.itemNumber || idx + 1}`, bold: true, size: 22, color: '1E3A8A' }),
      ]
      if (exportFields.trade) {
        titleRuns.push(new TextRun({ text: `  •  ${item.trade || 'General'}`, bold: true, size: 20, color: '1F2937' }))
      }
      if (exportFields.status) {
        titleRuns.push(new TextRun({ text: `  •  Status: ${normalizeObservationStatus(item.status)}`, size: 18, color: item.status === 'closed' ? '059669' : 'D97706' }))
      }
      if (exportFields.priority) {
        titleRuns.push(new TextRun({ text: `  •  Priority: ${item.priority || 'Medium'}`, size: 18, color: '4B5563' }))
      }

      docChildren.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: titleRuns,
        })
      )

      const rightSideContent = []
      if (exportFields.notes && item.notes) {
        rightSideContent.push(
          new Paragraph({
            spacing: { before: 20, after: 40 },
            children: [
              new TextRun({ text: stripHtmlToPlainText(item.notes), size: 18, color: '1F2937' }),
            ],
          })
        )
      }
      if (exportFields.dueDate && item.dueDate) {
        rightSideContent.push(
          new Paragraph({
            spacing: { before: 20, after: 40 },
            children: [
              new TextRun({ text: 'Due Date: ', bold: true, size: 18, color: '374151' }),
              new TextRun({ text: item.dueDate, size: 18, color: '4B5563' }),
            ],
          })
        )
      }
      if (exportFields.photos && photos.length > 0) {
        const photoRuns = []
        for (let pIdx = 0; pIdx < photos.length; pIdx++) {
          const pData = photos[pIdx]
          const pBytes = toUint8(pData)
          if (pBytes) {
            const pDims = await getScaledDims(pData, 140, 140)
            photoRuns.push(
              new ImageRun({
                data: pBytes,
                transformation: pDims,
              })
            )
            if (pIdx < photos.length - 1) {
              photoRuns.push(new TextRun({ text: '  ' }))
            }
          }
        }
        if (photoRuns.length > 0) {
          rightSideContent.push(
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: photoRuns,
            })
          )
        }
      }
      if (rightSideContent.length === 0) {
        rightSideContent.push(new Paragraph({ children: [new TextRun({ text: 'No notes or photos', italic: true, size: 18, color: '9CA3AF' })] }))
      }

      if (exportFields.keyPlanSnips && crop?.dataUrl) {
        const cropBytes = toUint8(crop.dataUrl)
        const leftSideContent = []
        if (cropBytes) {
          const cropDims = await getScaledDims(crop.dataUrl, 130, 130)
          leftSideContent.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 20, after: 20 },
              children: [
                new ImageRun({
                  data: cropBytes,
                  transformation: cropDims,
                }),
              ],
            })
          )
        }
        if (fp?.name) {
          leftSideContent.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: fp.name, size: 16, color: '4B5563' }),
              ],
            })
          )
        }

        docChildren.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 28, type: WidthType.PERCENTAGE },
                    margins: { top: 60, bottom: 60, left: 40, right: 40 },
                    children: leftSideContent,
                  }),
                  new TableCell({
                    width: { size: 72, type: WidthType.PERCENTAGE },
                    margins: { top: 60, bottom: 60, left: 40, right: 40 },
                    children: rightSideContent,
                  }),
                ],
              }),
            ],
          })
        )
      } else {
        docChildren.push(...rightSideContent)
      }
    }
  }

  // Build Document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
            size: {
              width: pageWidthDxa,
              height: pageHeightDxa,
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${project?.name || ''} • `, size: 18, color: '9CA3AF' }),
                  new TextRun({ text: 'Page ', size: 18, color: '9CA3AF' }),
                  PageNumber.CURRENT,
                  new TextRun({ text: ' of ', size: 18, color: '9CA3AF' }),
                  PageNumber.TOTAL_PAGES,
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const filename = `${safeReportName}_${formatDatePattern(new Date(), 'YYYY-MM-DD')}.docx`
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  logExport({
    projectUuid: currentProjectUuid || '',
    projectName: project?.name || '',
    type: 'docx',
    reportName: effectiveReport?.name || project?.name || '',
    filename,
    pageCount: null,
  }).catch(() => {})

  return { success: true, filename }
}
