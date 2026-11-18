import React, { useState, useEffect } from 'react'
import {
  FileText, Download, Loader, Check, Filter,
  FileSpreadsheet, MapPin, Sliders, Lock, Key, CreditCard, ShieldCheck, Type, ArrowLeft,
  Eye, Printer, FileCheck, CheckSquare, FolderArchive, Image as ImageIcon
} from 'lucide-react'
import JSZip from 'jszip'
import { useAppStore } from '../store/useAppStore'
import {
  getProject, getFloorPlans, getPunchItems, getPhotos, getPhases, sortFloorPlans, getUsers,
  logExport,
} from '../db/database'
import { formatVisitDateTime, formatDatePattern, normalizeObservationStatus, stripHtmlToPlainText } from '../utils/formatters'
import { getPdfFont, getFontFamily, FONT_OPTIONS } from '../utils/font'
import { hexToRgb } from '../utils/theme'
import { checkProjectLicense } from '../services/licenseService'
import LicenseActivationModal from './LicenseActivationModal'
import {
  getPhotoQualityProfile,
  getKeyPlanQualityProfile,
  getStoredPhotoQuality,
  ensurePhotoMatchesQuality,
  prepareKeyPlanImageForQuality,
  prepareLogoForQuality,
} from '../utils/media'

function getImageDimensions(src) {
  return new Promise((resolve) => {
    if (!src) return resolve({ width: 1, height: 1, aspect: 1 })
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width || 800
      const h = img.naturalHeight || img.height || 600
      resolve({ width: w, height: h, aspect: w / h })
    }
    img.onerror = () => resolve({ width: 1, height: 1, aspect: 1 })
    img.src = src
  })
}

export default function PDFPreview() {
  const {
    closePDFPreview,
    currentProjectUuid,
    currentPhaseUuid,
    currentFloorPlanUuid,
    activeTab,
    companyName,
    companyLogo,
    currentUser,
    pinColor,
    appFont,
    photoQuality,
    incrementExportedPdfCount,
  } = useAppStore()
  const activeQuality = photoQuality || getStoredPhotoQuality()
  const activeQualityProfile = getPhotoQualityProfile(activeQuality)

  const [project,    setProject]    = useState(null)
  const [floorPlans, setFloorPlans] = useState([])
  const [phases,     setPhases]     = useState([])
  const [items,      setItems]      = useState([])
  const [photosMap,  setPhotosMap]  = useState({})
  const [dbUsers,    setDbUsers]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [done,       setDone]       = useState(false)
  const [isLicensed, setIsLicensed] = useState(false)
  const [showLicenseModal, setShowLicenseModal] = useState(false)
  const [pdfPreviewModal,  setPdfPreviewModal]  = useState(null)

  // Configuration States
  const [format,          setFormat]          = useState('pdf') // 'pdf' | 'csv' | 'zip'
  const [paperSize,       setPaperSize]       = useState('letter') // 'letter' | 'a4' | 'tabloid'
  const [orientation,     setOrientation]     = useState('portrait') // 'portrait' | 'landscape'
  const [selectedPdfFont, setSelectedPdfFont] = useState(appFont || 'sans')

  useEffect(() => {
    if (appFont) setSelectedPdfFont(appFont)
  }, [appFont])
  const [filterReport,    setFilterReport]    = useState(currentPhaseUuid || 'All')
  const [filterDrawing,   setFilterDrawing]   = useState(
    activeTab === 'floorplan' && currentFloorPlanUuid ? currentFloorPlanUuid : 'All'
  )
  const [filterTrade,     setFilterTrade]     = useState('All')

  // Visibility Controls for Report Export Fields
  // Observation Images Layout: 'below' (Below observation notes) or 'right' (On the right side)
  const [imageLayout, setImageLayout] = useState(() => {
    try {
      return localStorage.getItem('sitepunch_pdf_image_layout') || 'below'
    } catch {
      return 'below'
    }
  })

  // Visibility Controls for Report Export Fields
  const [exportFields, setExportFields] = useState(() => {
    let initialImageLayout = 'below'
    try {
      initialImageLayout = localStorage.getItem('sitepunch_pdf_image_layout') || 'below'
    } catch {}

    const defaults = {
      keyPlans: true, // Key Plans
      keyPlanSnips: true, // Key Plan snip around pin next to observation item
      photos:   true, // Observation photos
      status:   true, // Status
      priority: true, // Priority level (High, Medium, Low)
      trade:    true, // Category
      dueDate:  true, // Due Date
      notes:    true, // Pin Observation Description
      reportCreatedBy: true, // Report Created By
      attendees: true, // List of Attendees
      photosOnRight: initialImageLayout === 'right', // Observation Images on Right Side (true = on right side, false = below notes)
      reportAsTable: false, // Report as Table (Table layout: Category, Description, Photos, Drawing location)
    }
    try {
      const saved = localStorage.getItem('sitepunch_export_fields')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.photosOnRight === undefined) {
          parsed.photosOnRight = initialImageLayout === 'right'
        }
        if (parsed.reportAsTable === undefined) {
          parsed.reportAsTable = false
        }
        if (parsed.keyPlanSnips === undefined) {
          parsed.keyPlanSnips = true
        }
        return { ...defaults, ...parsed }
      }
    } catch {}
    return defaults
  })

  const handleSetImageLayout = (layout) => {
    setImageLayout(layout)
    try {
      localStorage.setItem('sitepunch_pdf_image_layout', layout)
    } catch {}
  }

  const toggleExportField = (key) => {
    setExportFields(prev => {
      const nextVal = !prev[key]
      const next = { ...prev, [key]: nextVal }
      if (key === 'photosOnRight') {
        const newLayout = nextVal ? 'right' : 'below'
        setImageLayout(newLayout)
        try {
          localStorage.setItem('sitepunch_pdf_image_layout', newLayout)
        } catch {}
      }
      try {
        localStorage.setItem('sitepunch_export_fields', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const handleSelectAllFields = () => {
    setExportFields(prev => {
      const all = {
        keyPlans: true,
        keyPlanSnips: true,
        photos:   true,
        status:   true,
        priority: true,
        trade:    true,
        dueDate:  true,
        notes:    true,
        reportCreatedBy: true,
        attendees: true,
        photosOnRight: true,
        reportAsTable: prev.reportAsTable,
      }
      setImageLayout('right')
      try {
        localStorage.setItem('sitepunch_pdf_image_layout', 'right')
        localStorage.setItem('sitepunch_export_fields', JSON.stringify(all))
      } catch {}
      return all
    })
  }

  const handleDeselectAllFields = () => {
    const none = {
      keyPlans: false,
      keyPlanSnips: false,
      photos:   false,
      status:   false,
      priority: false,
      trade:    false,
      dueDate:  false,
      notes:    false,
      reportCreatedBy: false,
      attendees: false,
      photosOnRight: false,
      reportAsTable: false,
    }
    setExportFields(none)
    setImageLayout('below')
    try {
      localStorage.setItem('sitepunch_pdf_image_layout', 'below')
      localStorage.setItem('sitepunch_export_fields', JSON.stringify(none))
    } catch {}
  }

  useEffect(() => {
    async function verifyLicense() {
      const licensed = await checkProjectLicense(currentProjectUuid, currentUser?.email)
      setIsLicensed(licensed)
    }
    verifyLicense()
  }, [currentProjectUuid, currentUser])

  useEffect(() => {
    async function load() {
      const [proj, phaseList, fps, its, allUsers] = await Promise.all([
        getProject(currentProjectUuid),
        getPhases(currentProjectUuid),
        getFloorPlans(currentProjectUuid),
        getPunchItems(currentProjectUuid),
        getUsers().catch(() => []),
      ])

      // Only observations with saved notes are valid to be included in reports
      const validItems = its.filter(i => i.notes && i.notes.trim().length > 0)

      // Pre-load photos and compute aspect ratios to ensure proportions are preserved
      const pmap = {}
      for (const item of validItems) {
        const pList = await getPhotos(item.uuid)
        for (const p of pList) {
          if (p.imageData) {
            const dims = await getImageDimensions(p.imageData)
            p.aspect = dims.aspect
            p.naturalWidth = dims.width
            p.naturalHeight = dims.height
          }
        }
        pmap[item.uuid] = pList
      }

      setProject(proj)
      setPhases(phaseList)
      setFloorPlans(fps)
      setItems(validItems)
      setPhotosMap(pmap)
      setDbUsers(allUsers || [])

      // Initialize scope depending on where user opened Export:
      // If opened from a drawing page -> preset to only that drawing, while retaining report/site details
      // If opened from a report page -> preset to all drawings for that report
      if (activeTab === 'floorplan' && currentFloorPlanUuid) {
        setFilterDrawing(currentFloorPlanUuid)
        const currentFp = fps.find(f => f.uuid === currentFloorPlanUuid)
        if (currentFp?.phaseUuid) {
          setFilterReport(currentFp.phaseUuid)
        } else if (currentPhaseUuid) {
          setFilterReport(currentPhaseUuid)
        } else if (phaseList.length > 0) {
          setFilterReport(phaseList[0].uuid)
        }
      } else {
        setFilterDrawing('All')
        if (currentPhaseUuid) {
          setFilterReport(currentPhaseUuid)
        }
      }

      setLoading(false)
    }
    load()
  }, [currentProjectUuid, currentPhaseUuid, currentFloorPlanUuid, activeTab])

  const availableTrades = Array.from(new Set(items.map(i => i.trade).filter(Boolean))).sort()

  const activeReport = phases.find(p => p.uuid === filterReport) || (filterReport === 'All' && phases.length === 1 ? phases[0] : null)
  const effectiveReport = activeReport || (currentPhaseUuid ? phases.find(p => p.uuid === currentPhaseUuid) : null) || (phases.length > 0 ? phases[0] : null)
  const availableDrawings = floorPlans.filter(fp => {
    if (filterReport === 'All') return true
    return fp.phaseUuid === filterReport || (!fp.phaseUuid && filterReport === phases[0]?.uuid)
  })

  const reportCreator = (
    effectiveReport?.createdBy ||
    currentUser?.name ||
    (dbUsers.length > 0 ? dbUsers[0]?.name : null) ||
    currentUser?.email ||
    (dbUsers.length > 0 ? dbUsers[0]?.email : null) ||
    ''
  )

  // Filter items based on user selection
  const filteredItems = items.filter(item => {
    if (filterReport !== 'All') {
      const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
      const belongs = item.phaseUuid === filterReport || (fp?.phaseUuid === filterReport) || (!fp?.phaseUuid && filterReport === phases[0]?.uuid)
      if (!belongs) return false
    }
    if (filterDrawing !== 'All') {
      if (item.floorPlanUuid !== filterDrawing) return false
    }
    if (filterTrade !== 'All') {
      if (item.trade !== filterTrade) return false
    }
    return true
  })

  // Render floor plan image with circular pins scaled to active Photo Quality profile
  async function renderFloorPlanWithPins(floorPlan, itemsToDraw) {
    if (!floorPlan?.imageData) return null
    const kpProfile = getKeyPlanQualityProfile(activeQuality)
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          const natW = img.naturalWidth || img.width || 1600
          const natH = img.naturalHeight || img.height || 1200
          const maxSide = Math.max(natW, natH)
          const outScale = (kpProfile.id !== 'original' && Number.isFinite(kpProfile.maxDim) && maxSide > kpProfile.maxDim)
            ? kpProfile.maxDim / maxSide
            : 1
          const w = Math.max(1, Math.round(natW * outScale))
          const h = Math.max(1, Math.round(natH * outScale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)

          // Pin radius proportioned to image dimensions for crisp readability
          const radius = Math.max(18, Math.round(Math.min(w, h) * 0.02))

          // 1. Gather all valid pins (including extra pin instances) and map to canvas coordinates
          const pinDataList = []
          itemsToDraw.forEach(item => {
            if (!item.notes || !item.notes.trim()) return // Ignore any blank observation pins

            const pinsToProcess = []
            // Primary pin on this floor plan
            if (item.pinX != null && item.pinY != null && (item.floorPlanUuid === floorPlan.uuid || !item.floorPlanUuid)) {
              pinsToProcess.push({ x: Number(item.pinX), y: Number(item.pinY) })
            }
            // Extra pins on this floor plan
            if (Array.isArray(item.extraPins)) {
              item.extraPins.forEach(ep => {
                if (ep.pinX != null && ep.pinY != null && (ep.floorPlanUuid === floorPlan.uuid || (!ep.floorPlanUuid && item.floorPlanUuid === floorPlan.uuid))) {
                  pinsToProcess.push({ x: Number(ep.pinX), y: Number(ep.pinY) })
                }
              })
            }

            pinsToProcess.forEach(loc => {
              const rawX = loc.x
              const rawY = loc.y
              if (isNaN(rawX) || isNaN(rawY)) return

              // Compute px and py in canvas pixels
              let px = rawX
              let py = rawY

              // Handle normalized coordinates (0 to 1) if present
              if (rawX <= 1 && rawY <= 1 && w > 1 && h > 1) {
                px = rawX * w
                py = rawY * h
              } else if (img.naturalWidth && w !== img.naturalWidth) {
                px = rawX * (w / img.naturalWidth)
                py = rawY * (h / img.naturalHeight)
              }

              // Clamped original coordinates
              const origX = Math.max(radius, Math.min(w - radius, px))
              const origY = Math.max(radius, Math.min(h - radius, py))

              pinDataList.push({
                item,
                origX,
                origY,
                x: origX,
                y: origY,
                radius,
                displaced: false,
              })
            })
          })

          // 2. Multi-pass Anti-Collision & Separation Engine:
          // Smoothly repels overlapping pins so all numbers are clear and 100% visible on print
          const minDist = radius * 2 + 5 // Minimum spacing between pin centers to avoid any badge overlap
          const iterations = 45

          for (let iter = 0; iter < iterations; iter++) {
            let moved = false
            for (let i = 0; i < pinDataList.length; i++) {
              for (let j = i + 1; j < pinDataList.length; j++) {
                const p1 = pinDataList[i]
                const p2 = pinDataList[j]

                let dx = p2.x - p1.x
                let dy = p2.y - p1.y
                let dist = Math.hypot(dx, dy)

                if (dist < minDist) {
                  moved = true
                  // If pins share the exact same pixel, push in deterministic radial angles
                  if (dist < 0.001) {
                    const angle = ((j * 2.39996) + iter * 0.5) // Golden ratio dispersion
                    dx = Math.cos(angle)
                    dy = Math.sin(angle)
                    dist = 1
                  }

                  const overlap = minDist - dist
                  const nx = dx / dist
                  const ny = dy / dist
                  const half = overlap * 0.5

                  p1.x -= nx * half
                  p1.y -= ny * half
                  p2.x += nx * half
                  p2.y += ny * half
                }
              }
            }

            // Maintain boundaries within canvas margins
            for (const p of pinDataList) {
              p.x = Math.max(radius + 2, Math.min(w - radius - 2, p.x))
              p.y = Math.max(radius + 2, Math.min(h - radius - 2, p.y))
            }

            if (!moved) break
          }

          // Mark pins that were visibly displaced from original coordinates
          pinDataList.forEach(p => {
            const disp = Math.hypot(p.x - p.origX, p.y - p.origY)
            p.displaced = disp > radius * 0.35
          })

          // 3. Pass 1: Draw architectural leader lines and anchor dots for displaced pins
          pinDataList.forEach(p => {
            if (!p.displaced) return

            // Outer white casing for leader line (contrasts against both dark and light CAD lines)
            ctx.beginPath()
            ctx.moveTo(p.origX, p.origY)
            ctx.lineTo(p.x, p.y)
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = Math.max(3, Math.round(radius * 0.16))
            ctx.lineCap = 'round'
            ctx.stroke()

            // Main leader line in pin color
            ctx.beginPath()
            ctx.moveTo(p.origX, p.origY)
            ctx.lineTo(p.x, p.y)
            ctx.strokeStyle = pinColor || '#a40e26'
            ctx.lineWidth = Math.max(1.5, Math.round(radius * 0.09))
            ctx.lineCap = 'round'
            ctx.stroke()

            // True location target anchor dot
            const anchorR = Math.max(3.5, Math.round(radius * 0.22))
            ctx.beginPath()
            ctx.arc(p.origX, p.origY, anchorR + 1.5, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.fill()

            ctx.beginPath()
            ctx.arc(p.origX, p.origY, anchorR, 0, Math.PI * 2)
            ctx.fillStyle = pinColor || '#a40e26'
            ctx.fill()
          })

          // 4. Pass 2: Draw all pin circles, borders, and bold numbers
          pinDataList.forEach(p => {
            const { x: px, y: py, item } = p

            // Drop shadow for high contrast on light/dark drawings
            ctx.beginPath()
            ctx.arc(px, py + 1.5, radius + 2.5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
            ctx.fill()

            // Crisp outer white border
            ctx.beginPath()
            ctx.arc(px, py, radius + 2, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.fill()

            // Pin circle in brand/pin color
            ctx.beginPath()
            ctx.arc(px, py, radius, 0, Math.PI * 2)
            ctx.fillStyle = pinColor || '#a40e26'
            ctx.fill()
            ctx.lineWidth = Math.max(2, Math.round(radius * 0.12))
            ctx.strokeStyle = '#ffffff'
            ctx.stroke()

            // Centered pin number (bold white)
            ctx.fillStyle = '#ffffff'
            const numStr = String(item.itemNumber || '')
            const fontSize = numStr.length > 2
              ? Math.round(radius * 0.85)
              : Math.round(radius * 1.1)
            const activeFontFamily = getFontFamily(selectedPdfFont || appFont)
            ctx.font = `bold ${fontSize}px ${activeFontFamily}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(numStr, px, py + 1)
          })

          resolve({
            dataUrl: canvas.toDataURL('image/jpeg', kpProfile.quality),
            aspect: w / h,
            width: w,
            height: h,
          })
        } catch (e) {
          console.warn('Keyplan render failed', e)
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = floorPlan.imageData
    })
  }

  // Render high-res cropped floor plan snippet centered on a specific pin for the Table View
  async function renderPinDrawingCrop(floorPlan, item) {
    if (!floorPlan?.imageData) return null
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          const natW = img.naturalWidth || img.width || 1600
          const natH = img.naturalHeight || img.height || 1200

          let rawX = item.pinX != null ? Number(item.pinX) : null
          let rawY = item.pinY != null ? Number(item.pinY) : null

          // Fallback to first extraPin if primary coordinates are missing
          if ((rawX == null || isNaN(rawX)) && Array.isArray(item.extraPins) && item.extraPins.length > 0) {
            const ep = item.extraPins.find(p => p.floorPlanUuid === floorPlan.uuid || (!p.floorPlanUuid && item.floorPlanUuid === floorPlan.uuid))
            if (ep && ep.pinX != null && ep.pinY != null) {
              rawX = Number(ep.pinX)
              rawY = Number(ep.pinY)
            }
          }

          if (rawX == null || isNaN(rawX) || rawY == null || isNaN(rawY)) {
            resolve(null)
            return
          }

          let px = rawX
          let py = rawY
          if (rawX <= 1 && rawY <= 1 && natW > 1 && natH > 1) {
            px = rawX * natW
            py = rawY * natH
          }

          // Crop window size: roughly 22% of image dimension (gives great architectural context around the pin)
          const cropDim = Math.max(220, Math.round(Math.min(natW, natH) * 0.22))
          const halfCrop = cropDim / 2

          let cropX = Math.max(0, Math.min(natW - cropDim, px - halfCrop))
          let cropY = Math.max(0, Math.min(natH - cropDim, py - halfCrop))
          let actualCropW = Math.min(cropDim, natW - cropX)
          let actualCropH = Math.min(cropDim, natH - cropY)

          const outSize = 360
          const canvas = document.createElement('canvas')
          canvas.width = outSize
          canvas.height = outSize
          const ctx = canvas.getContext('2d')

          // Background white
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, outSize, outSize)

          // Draw cropped section of floor plan
          ctx.drawImage(img, cropX, cropY, actualCropW, actualCropH, 0, 0, outSize, outSize)

          // Pin relative coordinates on the cropped canvas
          const pinCanvasX = ((px - cropX) / actualCropW) * outSize
          const pinCanvasY = ((py - cropY) / actualCropH) * outSize

          // Proportional pin radius
          const pinR = Math.max(16, Math.round(outSize * 0.052))

          // Subtle shadow
          ctx.beginPath()
          ctx.arc(pinCanvasX, pinCanvasY + 1.5, pinR + 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
          ctx.fill()

          // White outer border ring
          ctx.beginPath()
          ctx.arc(pinCanvasX, pinCanvasY, pinR + 1.5, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()

          // Pin circle in brand pinColor
          ctx.beginPath()
          ctx.arc(pinCanvasX, pinCanvasY, pinR, 0, Math.PI * 2)
          ctx.fillStyle = pinColor || '#a40e26'
          ctx.fill()
          ctx.lineWidth = 1.8
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()

          // Pin number (bold white)
          ctx.fillStyle = '#ffffff'
          const numStr = String(item.itemNumber || '')
          const fontSize = numStr.length > 2
            ? Math.round(pinR * 0.85)
            : Math.round(pinR * 1.05)
          const activeFontFamily = getFontFamily(selectedPdfFont || appFont)
          ctx.font = `bold ${fontSize}px ${activeFontFamily}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(numStr, pinCanvasX, pinCanvasY + 1)

          resolve({
            dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            width: outSize,
            height: outSize,
          })
        } catch (err) {
          console.warn('renderPinDrawingCrop error', err)
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = floorPlan.imageData
    })
  }

  // CSV Generator
  async function handleGenerateCSV() {
    setGenerating(true)
    try {
      const headers = ['Item #', 'Report']
      const effectiveDesc = (effectiveReport?.description?.trim()) || (project?.description?.trim()) || ''
      if (effectiveDesc) headers.push('Report Description')
      if (exportFields.keyPlans)       headers.push('Key Plan')
      if (exportFields.trade)          headers.push('Category')
      if (exportFields.priority)       headers.push('Priority')
      if (exportFields.status)         headers.push('Status')
      headers.push('Assigned To')
      if (exportFields.dueDate)        headers.push('Due Date')
      if (exportFields.notes)          headers.push('Observation Notes')
      headers.push('Visit Date', 'Visit Time', 'Weather')
      if (exportFields.reportCreatedBy) {
        headers.push('Report Created By')
      }
      if (exportFields.attendees) {
        headers.push('Attendees')
      }
      if (exportFields.keyPlans) {
        headers.push('Pin X', 'Pin Y')
      }
      if (exportFields.photos) {
        headers.push('Photo Count')
      }

      const escapeCSV = (str) => {
        if (str == null) return '""'
        const s = String(str).replace(/"/g, '""')
        return `"${s}"`
      }

      // Live license verification before generating CSV export
      const liveLicensed = (await checkProjectLicense(currentProjectUuid, currentUser?.email)) || project?.isLicensed || !!project?.licenseKey
      if (liveLicensed !== isLicensed) {
        setIsLicensed(liveLicensed)
      }

      // If project is unlicensed, export strictly only the first 2 observation items across the entire report
      const sortedItems = [...filteredItems].sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
      const isCapped = !liveLicensed && sortedItems.length > 2
      const itemsToExport = isCapped ? sortedItems.slice(0, 2) : sortedItems

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
      a.href = url
      a.download = `PunchList_${safeReport}${safeDrawing}_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Log CSV export per-project for the Logs tab in Settings
      logExport({
        projectUuid: currentProjectUuid || '',
        projectName: project?.name || '',
        type: 'csv',
        reportName: effectiveReport?.name || project?.name || '',
        filename: `PunchList_${safeReport}${safeDrawing}_${new Date().toISOString().slice(0, 10)}.csv`,
        pageCount: null,
      }).catch(() => {})

      setDone(true)
      setTimeout(() => { setDone(false); closePDFPreview() }, 1200)
    } catch (err) {
      alert('CSV export failed: ' + (err.message || String(err)))
    } finally {
      setGenerating(false)
    }
  }

  // ZIP Archive Generator (All Key Plans and High-Res Defect Photos)
  async function handleGenerateZip() {
    setGenerating(true)
    try {
      // Live license verification before generating ZIP archive export
      const liveLicensed = (await checkProjectLicense(currentProjectUuid, currentUser?.email)) || project?.isLicensed || !!project?.licenseKey
      if (liveLicensed !== isLicensed) {
        setIsLicensed(liveLicensed)
      }

      // If project is unlicensed, export strictly only the first 2 observation items across the entire report
      const sortedItems = [...filteredItems].sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
      const isCapped = !liveLicensed && sortedItems.length > 2
      const itemsToExport = isCapped ? sortedItems.slice(0, 2) : sortedItems

      const zip = new JSZip()
      const safeReportName = (effectiveReport?.name || project?.name || 'Inspection_Report')
        .replace(/[^a-z0-9_-]/gi, '_')
        .replace(/_+/g, '_')

      // Folder 1: Key Plans / Drawings
      const keyPlansFolder = zip.folder('01_Key_Plans')
      let keyPlansToExport = availableDrawings.length > 0 ? availableDrawings : floorPlans

      // If unlicensed/capped with multiple key plans, only export key plans containing the first 2 observations
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
        const rendered = await renderFloorPlanWithPins(fp, itemsInFp)
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
      const effectiveDesc = (effectiveReport?.description?.trim()) || (project?.description?.trim()) || ''
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

      // Generate zip archive blob
      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      })

      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeReportName}_Images_${formatDatePattern(new Date(), 'YYYY-MM-DD')}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Log ZIP export per-project for the Logs tab in Settings
      logExport({
        projectUuid: currentProjectUuid || '',
        projectName: project?.name || '',
        type: 'zip',
        reportName: effectiveReport?.name || project?.name || '',
        filename: `${safeReportName}_Images_${formatDatePattern(new Date(), 'YYYY-MM-DD')}.zip`,
        pageCount: null,
      }).catch(() => {})

      setDone(true)
      setTimeout(() => { setDone(false); closePDFPreview() }, 1200)
    } catch (err) {
      console.error('ZIP generation failed:', err)
      alert('Images ZIP export failed: ' + (err.message || String(err)))
    } finally {
      setGenerating(false)
    }
  }

  // Minimalist, Clean, Print-Ready PDF Generator
  async function handleGeneratePDF() {
    setGenerating(true)
    try {
      // Live license verification before generating PDF
      const liveLicensed = (await checkProjectLicense(currentProjectUuid, currentUser?.email)) || project?.isLicensed || !!project?.licenseKey
      if (liveLicensed !== isLicensed) {
        setIsLicensed(liveLicensed)
      }

      const { jsPDF } = await import('jspdf')
      const pdfFont = getPdfFont(selectedPdfFont || appFont)

      let pdfFormat = paperSize
      if (paperSize === 'tabloid') {
        pdfFormat = [279.4, 431.8]
      }

      const doc = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: pdfFormat,
      })

      const W = doc.internal.pageSize.getWidth()
      const H = doc.internal.pageSize.getHeight()
      const margin = 14
      let pageNum = 1
      let y = margin

      function addPageNum() {
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.setFont(pdfFont, 'normal')
        const footerTitle = effectiveReport ? `${project?.name || ''} • ${effectiveReport.name}` : (project?.name || 'Punch List Report')
        doc.text(footerTitle, margin, H - 7)
        doc.text(`Page ${pageNum}`, W / 2, H - 7, { align: 'center' })
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, W - margin, H - 7, { align: 'right' })
        pageNum++
      }

      // ── MINIMALIST HEADER (NO COLORED BACKGROUNDS) ─────────────────────────
      if (companyLogo) {
        try {
          const exportLogo = await prepareLogoForQuality(companyLogo, activeQuality)
          const logoDim = await getImageDimensions(exportLogo)
          const maxLogoH = 14
          const maxLogoW = 42
          let logoW = maxLogoH * logoDim.aspect
          let logoH = maxLogoH
          if (logoW > maxLogoW) {
            logoW = maxLogoW
            logoH = logoW / logoDim.aspect
          }
          doc.addImage(exportLogo, 'AUTO', margin, y, logoW, logoH, '', 'FAST')
          y += logoH + 4
        } catch {}
      }

      // Title - Clean, Simple Text Format using Report Name
      const reportTitle = (effectiveReport?.name?.trim() || project?.name?.trim() || 'Punch List Observation Report').toUpperCase()
      doc.setFont(pdfFont, 'bold')
      doc.setFontSize(14)
      doc.setTextColor(15, 23, 42)
      const titleLines = doc.splitTextToSize(reportTitle, W - margin * 2)
      doc.text(titleLines, margin, y + 4)
      y += 4 + titleLines.length * 5.5

      // Clean divider line
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.line(margin, y, W - margin, y)
      y += 5

      // ── METADATA: ONLY PRINT NON-EMPTY FIELDS (NO COLORED BOXES) ───────────
      const projFields = []
      if (project?.name)       projFields.push(['Project', project.name])
      if (project?.number)     projFields.push(['Project #', project.number])
      if (project?.address)    projFields.push(['Address', project.address])
      if (project?.client)     projFields.push(['Client', project.client])
      if (project?.contractor) projFields.push(['Contractor', project.contractor])
      const effectiveDesc = (effectiveReport?.description?.trim()) || (project?.description?.trim()) || ''
      if (effectiveDesc) {
        projFields.push(['Description', effectiveDesc])
      }

      const rptFields = []
      // Note: Report name is elevated to the main document title, omit redundant 'Report: ...' line
      if (!effectiveReport?.name && filterReport === 'All' && phases.length > 1) {
        rptFields.push(['Report', 'All Reports'])
      }
      const dt = formatVisitDateTime(effectiveReport?.visitDate, effectiveReport?.visitTime)
      if (dt)                       rptFields.push(['Date / Time', dt])
      if (effectiveReport?.weather) rptFields.push(['Weather', effectiveReport.weather])

      const creator = effectiveReport?.createdBy || reportCreator
      if (exportFields.reportCreatedBy && creator) {
        rptFields.push(['Report Created By', creator])
      }

      if (exportFields.attendees && effectiveReport?.attendees) {
        // Parse all attendees as a structured array so they print as a vertical list
        let parsedAttendees = effectiveReport.attendees
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean)
        if (parsedAttendees.length === 1 && parsedAttendees[0].includes(',')) {
          parsedAttendees = parsedAttendees[0].split(',').map(s => s.trim()).filter(Boolean)
        }
        if (parsedAttendees.length > 0) {
          rptFields.push(['Attendees', parsedAttendees])
        }
      }

      if (projFields.length > 0 || rptFields.length > 0) {
        const colW = (W - margin * 2 - 8) / 2
        const leftX = margin
        const rightX = margin + colW + 8
        const leftLabelW = 24
        const rightLabelW = 32

        doc.setFontSize(8)

        // Render left column (Project Info)
        let leftY = y
        for (const [lbl, val] of projFields) {
          doc.setFont(pdfFont, 'bold')
          doc.setTextColor(100, 116, 139)
          doc.text(`${lbl}:`, leftX, leftY)

          doc.setFont(pdfFont, 'normal')
          doc.setTextColor(15, 23, 42)
          const lines = doc.splitTextToSize(String(val), colW - leftLabelW - 2)
          doc.text(lines, leftX + leftLabelW, leftY)
          leftY += Math.max(lines.length * 4.2, 5)
        }

        // Render right column (Report Info)
        let rightY = y
        for (const [lbl, val] of rptFields) {
          doc.setFont(pdfFont, 'bold')
          doc.setTextColor(100, 116, 139)
          doc.text(`${lbl}:`, rightX, rightY)

          doc.setFont(pdfFont, 'normal')
          doc.setTextColor(15, 23, 42)
          if (Array.isArray(val)) {
            // Render attendees as a clean vertical bulleted list
            let itemY = rightY
            for (let i = 0; i < val.length; i++) {
              const lineText = `•  ${val[i]}`
              const lines = doc.splitTextToSize(lineText, colW - rightLabelW - 2)
              doc.text(lines, rightX + rightLabelW, itemY)
              itemY += Math.max(lines.length * 3.8, 4.3)
            }
            rightY = itemY + 0.8
          } else {
            const lines = doc.splitTextToSize(String(val), colW - rightLabelW - 2)
            doc.text(lines, rightX + rightLabelW, rightY)
            rightY += Math.max(lines.length * 4.2, 5)
          }
        }

        y = Math.max(leftY, rightY) + 3
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.2)
        doc.line(margin, y, W - margin, y)
        y += 6
      }

      // ── PUNCH LIST ITEMS CONFIGURATION ─────────────────────────────────────
      const sortedItems = [...filteredItems].sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
      // Unlicensed export is strictly limited to at most the first 2 observation items across the entire report
      const isCapped = !liveLicensed && sortedItems.length > 2
      const itemsToExport = isCapped ? sortedItems.slice(0, 2) : sortedItems

      // ── KEYPLAN AT TOP: FITS PAGE WIDTH & KEEPS EXACT ASPECT RATIO ─────────
      let drawingsToRender = sortFloorPlans(floorPlans.filter(fp => {
        if (filterDrawing !== 'All') return fp.uuid === filterDrawing
        if (filterReport !== 'All') {
          return fp.phaseUuid === filterReport || (!fp.phaseUuid && filterReport === phases[0]?.uuid)
        }
        return true
      }))
      if (drawingsToRender.length === 0 && filterReport === 'All') {
        const usedFpUuids = Array.from(new Set(filteredItems.map(i => i.floorPlanUuid).filter(Boolean)))
        drawingsToRender = sortFloorPlans(floorPlans.filter(fp => usedFpUuids.includes(fp.uuid)))
      }

      // If unlicensed/capped with multiple key plans, only export key plans containing the first 2 observations
      if (isCapped && drawingsToRender.length > 1) {
        const exportedFpUuids = new Set(itemsToExport.map(i => i.floorPlanUuid).filter(Boolean))
        const cappedDrawings = drawingsToRender.filter(fp => exportedFpUuids.has(fp.uuid))
        if (cappedDrawings.length > 0) {
          drawingsToRender = cappedDrawings
        } else {
          drawingsToRender = [drawingsToRender[0]]
        }
      }

      // Pre-process exported photos against active Photo Quality setting
      const exportPhotosMap = {}
      if (exportFields.photos) {
        for (const it of itemsToExport) {
          const origList = photosMap[it.uuid] || []
          const processedList = []
          for (const ph of origList.slice(0, 3)) {
            if (ph?.imageData) {
              const processedData = await ensurePhotoMatchesQuality(ph.imageData, activeQuality)
              processedList.push({ ...ph, imageData: processedData })
            } else {
              processedList.push(ph)
            }
          }
          exportPhotosMap[it.uuid] = processedList
        }
      }

      // Pre-process drawing location crops for Table View and Key Plan Snips
      const exportPinCropMap = {}
      if (exportFields.reportAsTable || exportFields.keyPlanSnips) {
        for (const it of itemsToExport) {
          const fp = floorPlans.find(f => f.uuid === it.floorPlanUuid)
          if (fp) {
            const crop = await renderPinDrawingCrop(fp, it)
            if (crop) {
              exportPinCropMap[it.uuid] = crop
            }
          }
        }
      }

      // Reusable item renderer
      const renderObservationItem = (item) => {
        const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
        const hasPlanCrop = Boolean(exportFields.keyPlanSnips && exportPinCropMap[item.uuid])
        const planCrop = hasPlanCrop ? exportPinCropMap[item.uuid] : null
        const planCropSize = 36
        const planGap = 4.5
        const planSheetText = fp ? `Sheets: ${fp.name}` : ''
        doc.setFont(pdfFont, 'normal')
        doc.setFontSize(7.0)
        const planSheetLines = (hasPlanCrop && planSheetText) ? doc.splitTextToSize(planSheetText, planCropSize) : []
        const planCropTotalH = hasPlanCrop ? (planCropSize + (planSheetLines.length > 0 ? (planSheetLines.length * 3.0 + 2) : 0)) : 0

        const planColW = hasPlanCrop ? planCropSize : 0
        const contentW = W - margin * 2
        const fieldsStartX = margin + (hasPlanCrop ? (planColW + planGap) : 0)
        const fieldsW = contentW - (hasPlanCrop ? (planColW + planGap) : 0)

        // Raw observation photos (Key Plan Snip is rendered separately on the left)
        const photos = exportFields.photos ? (exportPhotosMap[item.uuid] || []) : []
        const validPhotos = photos.filter(p => !!p.imageData)
        const numPhotos = validPhotos.length
        const photoDims = []
        let shouldStack = false

        // Calculate adaptive photo dimensions within the fields area
        const maxPhotoAreaW = imageLayout === 'below' ? fieldsW : Math.min(fieldsW * 0.48, 68)
        const photoGap = 3.5

        if (numPhotos === 1) {
          const photo = validPhotos[0]
          const aspect = photo.aspect && photo.aspect > 0 ? photo.aspect : 1.33
          let pW, pH

          if (imageLayout === 'below') {
            if (aspect >= 1.15) {
              pW = Math.min(fieldsW, 95)
              pH = pW / aspect
              if (pH > 60) { pH = 60; pW = pH * aspect }
            } else if (aspect >= 0.85) {
              pH = 50
              pW = pH * aspect
            } else {
              pH = 58
              pW = pH * aspect
              if (pW > fieldsW) { pW = fieldsW; pH = pW / aspect }
            }
          } else {
            if (aspect >= 1.15) {
              pW = Math.min(maxPhotoAreaW, 65)
              pH = pW / aspect
              if (pH > 48) { pH = 48; pW = pH * aspect }
              if (pH < 34) { pH = 34; pW = Math.min(maxPhotoAreaW, pH * aspect) }
            } else if (aspect >= 0.85) {
              pH = 45
              pW = pH * aspect
            } else {
              pH = 50
              pW = pH * aspect
              if (pW < 30) { pW = 30; pH = Math.min(55, pW / aspect) }
              if (pW > maxPhotoAreaW) { pW = maxPhotoAreaW; pH = pW / aspect }
            }
          }
          photoDims.push({ photo, pW, pH, aspect })
        } else if (numPhotos === 2) {
          const p1 = validPhotos[0]
          const p2 = validPhotos[1]
          const a1 = p1.aspect && p1.aspect > 0 ? p1.aspect : 1.33
          const a2 = p2.aspect && p2.aspect > 0 ? p2.aspect : 1.33

          if (imageLayout === 'below') {
            let targetH = 38
            let w1 = targetH * a1
            let w2 = targetH * a2
            let totalW = w1 + w2 + photoGap
            if (totalW > fieldsW) {
              const scale = (fieldsW - photoGap) / (w1 + w2)
              targetH *= scale
              w1 = targetH * a1
              w2 = targetH * a2
            }
            photoDims.push({ photo: p1, pW: w1, pH: targetH, aspect: a1 })
            photoDims.push({ photo: p2, pW: w2, pH: targetH, aspect: a2 })
          } else {
            let targetH = 35
            let w1 = targetH * a1
            let w2 = targetH * a2
            let totalW = w1 + w2 + photoGap

            if (totalW > maxPhotoAreaW) {
              const scale = (maxPhotoAreaW - photoGap) / (w1 + w2)
              if (targetH * scale >= 24) {
                targetH *= scale
                w1 = targetH * a1
                w2 = targetH * a2
                photoDims.push({ photo: p1, pW: w1, pH: targetH, aspect: a1 })
                photoDims.push({ photo: p2, pW: w2, pH: targetH, aspect: a2 })
              } else {
                shouldStack = true
                for (const photo of validPhotos) {
                  const aspect = photo.aspect && photo.aspect > 0 ? photo.aspect : 1.33
                  let pH = 34
                  let pW = pH * aspect
                  if (pW > maxPhotoAreaW) {
                    pW = maxPhotoAreaW
                    pH = pW / aspect
                  }
                  photoDims.push({ photo, pW, pH, aspect })
                }
              }
            } else {
              photoDims.push({ photo: p1, pW: w1, pH: targetH, aspect: a1 })
              photoDims.push({ photo: p2, pW: w2, pH: targetH, aspect: a2 })
            }
          }
        } else if (numPhotos >= 3) {
          if (imageLayout === 'below') {
            let targetH = 34
            const aspects = validPhotos.map(p => (p.aspect && p.aspect > 0 ? p.aspect : 1.33))
            const widths = aspects.map(a => targetH * a)
            const totalW = widths.reduce((s, w) => s + w, 0) + (numPhotos - 1) * photoGap
            if (totalW > fieldsW) {
              const scale = (fieldsW - (numPhotos - 1) * photoGap) / widths.reduce((s, w) => s + w, 0)
              if (targetH * scale >= 20) {
                targetH *= scale
                validPhotos.forEach((photo, idx) => {
                  photoDims.push({ photo, pW: targetH * aspects[idx], pH: targetH, aspect: aspects[idx] })
                })
              } else {
                shouldStack = true
                validPhotos.forEach((photo, idx) => {
                  let pH = 34
                  let pW = Math.min(fieldsW, pH * aspects[idx])
                  photoDims.push({ photo, pW, pH, aspect: aspects[idx] })
                })
              }
            } else {
              validPhotos.forEach((photo, idx) => {
                photoDims.push({ photo, pW: widths[idx], pH: targetH, aspect: aspects[idx] })
              })
            }
          } else {
            let targetH = 30
            const aspects = validPhotos.map(p => (p.aspect && p.aspect > 0 ? p.aspect : 1.33))
            const widths = aspects.map(a => targetH * a)
            const totalW = widths.reduce((s, w) => s + w, 0) + (numPhotos - 1) * photoGap

            if (totalW <= maxPhotoAreaW) {
              validPhotos.forEach((photo, idx) => {
                photoDims.push({ photo, pW: widths[idx], pH: targetH, aspect: aspects[idx] })
              })
            } else {
              const scale = (maxPhotoAreaW - (numPhotos - 1) * photoGap) / widths.reduce((s, w) => s + w, 0)
              if (targetH * scale >= 22) {
                targetH *= scale
                validPhotos.forEach((photo, idx) => {
                  photoDims.push({ photo, pW: targetH * aspects[idx], pH: targetH, aspect: aspects[idx] })
                })
              } else {
                shouldStack = true
                validPhotos.forEach((photo, idx) => {
                  let pH = 30
                  let pW = Math.min(maxPhotoAreaW, pH * aspects[idx])
                  photoDims.push({ photo, pW, pH, aspect: aspects[idx] })
                })
              }
            }
          }
        }

        const hasPhotos = photoDims.length > 0
        const totalSideBySideW = photoDims.reduce((sum, d) => sum + d.pW, 0) + (photoDims.length - 1) * photoGap
        const actualPhotoAreaW = hasPhotos
          ? (shouldStack ? Math.max(...photoDims.map(d => d.pW)) : totalSideBySideW)
          : 0

        // Right-aligned photo starting X position
        const photoStartX = (fieldsStartX + fieldsW) - actualPhotoAreaW

        // Left text column width:
        const textW = (imageLayout === 'below' || !hasPhotos)
          ? fieldsW
          : Math.max(45, photoStartX - fieldsStartX - 5)

        // ── Observation text and label preparation ──
        const cleanNotes = stripHtmlToPlainText(item.notes || '')
        const cleanTitle = stripHtmlToPlainText(item.title || '')
        const rawObsText = (cleanNotes && cleanTitle && cleanNotes.trim() !== cleanTitle.trim())
          ? `${cleanTitle.trim()} — ${cleanNotes.trim()}`
          : (cleanNotes || cleanTitle || '').trim()

        const obsPrefix = 'Observation: '
        const fullObsString = rawObsText ? `${obsPrefix}${rawObsText}` : ''
        doc.setFont(pdfFont, 'normal')
        doc.setFontSize(8.5)
        const obsLines = (exportFields.notes && fullObsString)
          ? doc.splitTextToSize(fullObsString, textW)
          : []

        // ── Heading Line 1 (Pin Marker + Category Label) ──
        const rawTrade = item.trade || 'General'
        const categoryLabel = rawTrade.toLowerCase().startsWith('category') ? rawTrade : `Category: ${rawTrade}`
        const headingParts = []
        if (exportFields.trade) {
          headingParts.push(categoryLabel)
        }
        if (exportFields.status) {
          headingParts.push(`Status: ${normalizeObservationStatus(item.status)}`)
        }
        if (item.assignedTo) {
          headingParts.push(`Assigned: ${item.assignedTo}`)
        }
        const headingText = headingParts.join(' • ')

        // ── Priority & Due Date Badges (moved below observations) ──
        const renderPriorityBadge = Boolean(exportFields.priority && item.priority)
        const priorityBadgeText = `Priority: ${item.priority || 'Medium'}`

        const renderDueBadge = Boolean(exportFields.dueDate && item.dueDate)
        const dueBadgeText = renderDueBadge ? `Due: ${formatDatePattern(item.dueDate)}` : ''

        doc.setFont(pdfFont, 'bold')
        doc.setFontSize(7.5)
        const bPadX = 2.4
        const bH = 4.4
        const bR = 1.3
        const pW = renderPriorityBadge ? doc.getTextWidth(priorityBadgeText) + bPadX * 2 : 0
        const dW = renderDueBadge ? doc.getTextWidth(dueBadgeText) + bPadX * 2 : 0
        const badgeGap = 2.5

        const pinRadius = 3.0
        const headingStartX = fieldsStartX + pinRadius * 2 + 2.5
        const sectionMargin = 2.75

        // Estimate item height for clean pagination
        let textH = pinRadius * 2 + sectionMargin
        if (obsLines.length > 0) textH += obsLines.length * 4.2 + sectionMargin
        if (renderPriorityBadge || renderDueBadge) textH += bH + 2.5

        let totalPhotoH = 0
        if (hasPhotos) {
          if (shouldStack) {
            totalPhotoH = photoDims.reduce((sum, d) => sum + d.pH, 0) + (photoDims.length - 1) * photoGap
          } else {
            totalPhotoH = Math.max(...photoDims.map(d => d.pH))
          }
        }
        const rightColH = imageLayout === 'below'
          ? textH + (hasPhotos ? (totalPhotoH + sectionMargin) : 0) + 4
          : Math.max(textH, totalPhotoH) + 4

        const itemH = Math.max(rightColH, planCropTotalH + 4)

        // If item overflows current page, move to next page
        if (y + itemH > H - margin - 4) {
          addPageNum()
          doc.addPage()
          y = margin
        }

        const startY = y
        let textY = startY

        // 1. If Key Plan Snip is ON, render Key Plan Snip on the LEFT side of the page
        if (hasPlanCrop && planCrop?.dataUrl) {
          try {
            doc.addImage(planCrop.dataUrl, 'JPEG', margin, startY, planCropSize, planCropSize, '', 'FAST')
            doc.setDrawColor(203, 213, 225)
            doc.setLineWidth(0.2)
            doc.rect(margin, startY, planCropSize, planCropSize)

            if (planSheetLines.length > 0) {
              doc.setFont(pdfFont, 'normal')
              doc.setFontSize(7.0)
              doc.setTextColor(71, 85, 105)
              doc.text(planSheetLines, margin, startY + planCropSize + 2.8)
            }
          } catch (cropErr) {
            console.warn('Failed to render plan crop on item:', cropErr)
          }
        }

        // 2. All observation fields rendered AFTER the Key Plan (to the right of it)
        const circleCenterX = fieldsStartX + pinRadius
        const circleCenterY = textY + pinRadius + 0.2

        // Outer pin circle with user's theme pin color
        const { r: pr, g: pg, b: pb } = hexToRgb(pinColor || '#a40e26')
        doc.setFillColor(pr, pg, pb)
        doc.circle(circleCenterX, circleCenterY, pinRadius, 'F')

        // White border ring around pin matching canvas pin style
        doc.setDrawColor(255, 255, 255)
        doc.setLineWidth(0.3)
        doc.circle(circleCenterX, circleCenterY, pinRadius, 'S')

        // Draw pin number (white, bold, centered)
        doc.setTextColor(255, 255, 255)
        doc.setFont(pdfFont, 'bold')
        const numStr = item.itemNumber != null ? String(item.itemNumber) : '#'
        doc.setFontSize(numStr.length > 2 ? 6.5 : numStr.length > 1 ? 7.2 : 8)
        doc.text(numStr, circleCenterX, circleCenterY + 0.85, { align: 'center' })

        // Heading: Pin Marker followed by Trade Label (Trade: General) if enabled
        if (headingText) {
          doc.setTextColor(15, 23, 42)
          doc.setFont(pdfFont, 'bold')
          doc.setFontSize(9.5)
          doc.text(headingText, headingStartX, circleCenterY + 1.0)
        }

        // Reduced margin between pin item # / trade and observation field (by half)
        textY += pinRadius * 2 + sectionMargin

        // Observations with bold "Observation:" label
        if (obsLines.length > 0) {
          doc.setFont(pdfFont, 'bold')
          doc.setFontSize(8.5)
          doc.setTextColor(15, 23, 42)
          doc.text(obsPrefix, fieldsStartX, textY + 1.2)
          const obsLabelW = doc.getTextWidth(obsPrefix)

          doc.setFont(pdfFont, 'normal')
          doc.setTextColor(51, 65, 85)
          const firstLineBody = obsLines[0].startsWith(obsPrefix)
            ? obsLines[0].slice(obsPrefix.length)
            : obsLines[0].replace(/^Observation:\s*/, '')
          doc.text(firstLineBody, fieldsStartX + obsLabelW, textY + 1.2)

          for (let li = 1; li < obsLines.length; li++) {
            textY += 4.2
            doc.text(obsLines[li], fieldsStartX, textY + 1.2)
          }
          textY += 1.8 + sectionMargin
        }

        // Priority and Due Date Badges
        if (renderPriorityBadge || renderDueBadge) {
          let currentBadgeX = fieldsStartX
          const badgeY = textY

          if (renderPriorityBadge) {
            const prio = (item.priority || 'Medium').toLowerCase()
            let prioBg = [254, 243, 199]
            let prioBorder = [252, 211, 77]
            let prioText = [180, 83, 9]

            if (prio === 'critical') {
              prioBg = [254, 242, 242]
              prioBorder = [254, 202, 202]
              prioText = [185, 28, 28]
            } else if (prio === 'high') {
              prioBg = [255, 247, 237]
              prioBorder = [254, 215, 170]
              prioText = [194, 65, 12]
            } else if (prio === 'low') {
              prioBg = [241, 245, 249]
              prioBorder = [203, 213, 225]
              prioText = [71, 85, 105]
            }

            doc.setFillColor(prioBg[0], prioBg[1], prioBg[2])
            doc.setDrawColor(prioBorder[0], prioBorder[1], prioBorder[2])
            doc.setLineWidth(0.2)
            doc.roundedRect(currentBadgeX, badgeY, pW, bH, bR, bR, 'FD')

            doc.setFont(pdfFont, 'bold')
            doc.setFontSize(7.5)
            doc.setTextColor(prioText[0], prioText[1], prioText[2])
            doc.text(priorityBadgeText, currentBadgeX + bPadX, badgeY + 3.1)

            currentBadgeX += pW + badgeGap
          }

          if (renderDueBadge) {
            doc.setFillColor(241, 245, 249)
            doc.setDrawColor(203, 213, 225)
            doc.setLineWidth(0.2)
            doc.roundedRect(currentBadgeX, badgeY, dW, bH, bR, bR, 'FD')

            doc.setFont(pdfFont, 'bold')
            doc.setFontSize(7.5)
            doc.setTextColor(51, 65, 85)
            doc.text(dueBadgeText, currentBadgeX + bPadX, badgeY + 3.1)

            currentBadgeX += dW + badgeGap
          }

          textY += bH + 3.0
        }

        // Photos (placement based on imageLayout: 'below' observation notes or 'right' side)
        let photoEndY = startY
        if (hasPhotos) {
          if (imageLayout === 'below') {
            const currentPy = textY
            if (shouldStack) {
              let py = currentPy
              for (const d of photoDims) {
                if (py + d.pH > H - margin - 4) {
                  addPageNum()
                  doc.addPage()
                  py = margin
                }
                const px = fieldsStartX
                try {
                  doc.addImage(d.photo.imageData, 'JPEG', px, py, d.pW, d.pH, '', 'FAST')
                  doc.setDrawColor(226, 232, 240)
                  doc.setLineWidth(0.2)
                  doc.rect(px, py, d.pW, d.pH)
                } catch {}
                py += d.pH + photoGap
              }
              photoEndY = py - photoGap
            } else {
              const rowH = Math.max(...photoDims.map(d => d.pH))
              let py = currentPy
              if (py + rowH > H - margin - 4) {
                addPageNum()
                doc.addPage()
                py = margin
              }
              let px = fieldsStartX
              for (const d of photoDims) {
                try {
                  doc.addImage(d.photo.imageData, 'JPEG', px, py, d.pW, d.pH, '', 'FAST')
                  doc.setDrawColor(226, 232, 240)
                  doc.setLineWidth(0.2)
                  doc.rect(px, py, d.pW, d.pH)
                } catch {}
                px += d.pW + photoGap
              }
              photoEndY = py + rowH
            }
            y = Math.max(photoEndY, startY + planCropTotalH) + 3.5
          } else {
            if (shouldStack) {
              let currentPy = startY
              for (const d of photoDims) {
                const px = (W - margin) - d.pW
                try {
                  doc.addImage(d.photo.imageData, 'JPEG', px, currentPy, d.pW, d.pH, '', 'FAST')
                  doc.setDrawColor(226, 232, 240)
                  doc.setLineWidth(0.2)
                  doc.rect(px, currentPy, d.pW, d.pH)
                } catch {}
                currentPy += d.pH + photoGap
              }
              photoEndY = currentPy - photoGap
            } else {
              let px = photoStartX
              for (const d of photoDims) {
                try {
                  doc.addImage(d.photo.imageData, 'JPEG', px, startY, d.pW, d.pH, '', 'FAST')
                  doc.setDrawColor(226, 232, 240)
                  doc.setLineWidth(0.2)
                  doc.rect(px, startY, d.pW, d.pH)
                } catch {}
                px += d.pW + photoGap
              }
              photoEndY = startY + Math.max(...photoDims.map(d => d.pH))
            }
            y = Math.max(textY, photoEndY, startY + planCropTotalH) + 3.5
          }
        } else {
          y = Math.max(textY, startY + planCropTotalH) + 3.5
        }

        // Light separator between items
        doc.setDrawColor(241, 245, 249)
        doc.setLineWidth(0.2)
        doc.line(margin, y, W - margin, y)
        y += 4.5
      }

      // Track exported items so none are missed
      const exportedItemUuids = new Set()

      if (exportFields.reportAsTable) {
        // ── RENDER KEY PLANS IF ENABLED ──
        if (exportFields.keyPlans) {
          for (let dIdx = 0; dIdx < drawingsToRender.length; dIdx++) {
            const fp = drawingsToRender[dIdx]
            if (dIdx > 0 || y > margin + 40) {
              addPageNum()
              doc.addPage()
              y = margin
            }

            const itemsOnFp = (isCapped ? itemsToExport : items).filter(i => {
              const hasPinOnThisFp = (i.floorPlanUuid === fp.uuid) || (Array.isArray(i.extraPins) && i.extraPins.some(ep => ep.floorPlanUuid === fp.uuid))
              if (!hasPinOnThisFp) return false
              if (filterReport !== 'All') {
                const belongs = i.phaseUuid === filterReport || fp.phaseUuid === filterReport || (!fp.phaseUuid && filterReport === phases[0]?.uuid)
                if (!belongs) return false
              }
              return true
            })

            const planResult = await renderFloorPlanWithPins(fp, itemsOnFp)
            if (planResult && planResult.dataUrl) {
              const titleH = 7
              const maxAllowedW = W - margin * 2
              let maxAllowedH = H - margin - y - titleH - 6
              if (maxAllowedH < 90 && y > margin) {
                addPageNum()
                doc.addPage()
                y = margin
                maxAllowedH = H - margin - y - titleH - 6
              }

              let planW = maxAllowedW
              let planH = planW / planResult.aspect
              if (planH > maxAllowedH) {
                planH = maxAllowedH
                planW = planH * planResult.aspect
              }
              if (planW > maxAllowedW) {
                planW = maxAllowedW
                planH = planW / planResult.aspect
              }
              const planX = margin + Math.max(0, (maxAllowedW - planW) / 2)

              doc.setFont(pdfFont, 'bold')
              doc.setFontSize(9.5)
              doc.setTextColor(15, 23, 42)
              doc.text(`KEY PLAN — ${fp.name.toUpperCase()} (PIN LOCATIONS)`, margin, y + 3.5)
              y += titleH

              try {
                doc.addImage(planResult.dataUrl, 'JPEG', planX, y, planW, planH, '', 'FAST')
                doc.setDrawColor(203, 213, 225)
                doc.setLineWidth(0.2)
                doc.rect(planX, y, planW, planH)
              } catch (imgErr) {
                console.warn('Failed to render key plan image onto PDF:', imgErr)
              }
              y += planH + 7
            }
          }
        }

        // ── RENDER OBSERVATIONS TABLE ──
        if (itemsToExport.length > 0) {
          if (exportFields.keyPlans && drawingsToRender.length > 0) {
            addPageNum()
            doc.addPage()
            y = margin
          } else if (y > H - margin - 45) {
            addPageNum()
            doc.addPage()
            y = margin
          }

          doc.setFont(pdfFont, 'bold')
          doc.setFontSize(11)
          doc.setTextColor(15, 23, 42)
          doc.text('Observations', margin, y + 2)
          y += 6

          const tableW = W - margin * 2

          // Dynamic table columns based on enabled Report Field Visibility settings
          const candidateCols = []
          // 1. When Key Plan Snip with Pin is ON, align Key Plan to the LEFT side of the page (Column 1)
          if (exportFields.keyPlanSnips) candidateCols.push({ id: 'keyPlanSnips', title: 'Drawing location', weight: 1.6, minW: 28 })
          // 2. All other fields after that
          if (exportFields.trade) candidateCols.push({ id: 'trade', title: 'Category', weight: 1.2, minW: 20 })
          if (exportFields.notes) candidateCols.push({ id: 'notes', title: 'Description', weight: 2.4, minW: 32, flex: true })
          if (exportFields.status) candidateCols.push({ id: 'status', title: 'Status', weight: 0.85, minW: 18 })
          if (exportFields.priority) candidateCols.push({ id: 'priority', title: 'Priority', weight: 0.85, minW: 18 })
          if (exportFields.dueDate) candidateCols.push({ id: 'dueDate', title: 'Due Date', weight: 0.9, minW: 18 })
          if (exportFields.photos) candidateCols.push({ id: 'photos', title: 'Photos', weight: 1.6, minW: 28 })

          const activeCols = candidateCols.length > 0 ? candidateCols : [
            { id: 'notes', title: 'Description', weight: 2.5, minW: 50, flex: true },
            { id: 'photos', title: 'Photos', weight: 1.5, minW: 35 }
          ]

          // Distribute widths proportionally across the full table width
          const totalColWeight = activeCols.reduce((sum, c) => sum + c.weight, 0)
          let allocatedW = 0
          activeCols.forEach((col, idx) => {
            if (idx === activeCols.length - 1) {
              col.w = tableW - allocatedW
            } else {
              col.w = Math.max(col.minW, Math.round((col.weight / totalColWeight) * tableW))
              allocatedW += col.w
            }
          })
          const curTotalW = activeCols.reduce((sum, c) => sum + c.w, 0)
          if (curTotalW !== tableW) {
            const diff = tableW - curTotalW
            const flexCol = activeCols.find(c => c.flex) || activeCols[activeCols.length - 1]
            flexCol.w += diff
          }

          let curColX = margin
          for (const col of activeCols) {
            col.x = curColX
            curColX += col.w
          }

          const drawTableHeader = (curY) => {
            const hH = 7.5
            doc.setDrawColor(15, 23, 42)
            doc.setLineWidth(0.3)
            doc.line(margin, curY, margin + tableW, curY)
            doc.line(margin, curY + hH, margin + tableW, curY + hH)

            for (const col of activeCols) {
              doc.line(col.x, curY, col.x, curY + hH)
            }
            doc.line(margin + tableW, curY, margin + tableW, curY + hH)

            // Header titles: CENTER ALIGNED, NO UNDERLINES
            doc.setFont(pdfFont, 'bold')
            doc.setFontSize(8.5)
            doc.setTextColor(15, 23, 42)

            activeCols.forEach(col => {
              const centerX = col.x + col.w / 2
              doc.text(col.title, centerX, curY + 5.0, { align: 'center' })
            })

            return curY + hH
          }

          y = drawTableHeader(y)

          const colCategory = activeCols.find(c => c.id === 'trade')
          const colDesc = activeCols.find(c => c.id === 'notes')
          const colStatus = activeCols.find(c => c.id === 'status')
          const colPriority = activeCols.find(c => c.id === 'priority')
          const colDueDate = activeCols.find(c => c.id === 'dueDate')
          const colPhotos = activeCols.find(c => c.id === 'photos')
          const colLocation = activeCols.find(c => c.id === 'keyPlanSnips')

          for (const item of itemsToExport) {
            const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
            const photos = colPhotos ? (exportPhotosMap[item.uuid] || []) : []
            const crop = colLocation ? exportPinCropMap[item.uuid] : null

            // Category text
            const rawTrade = item.trade || 'General'
            doc.setFont(pdfFont, 'normal')
            doc.setFontSize(8.5)
            const catLines = colCategory ? doc.splitTextToSize(rawTrade, colCategory.w - 4) : []

            // Description text
            const cleanNotes = stripHtmlToPlainText(item.notes || '')
            const cleanTitle = stripHtmlToPlainText(item.title || '')
            const descText = (cleanNotes && cleanTitle && cleanNotes.trim() !== cleanTitle.trim())
              ? `${cleanTitle.trim()} — ${cleanNotes.trim()}`
              : (cleanNotes || cleanTitle || '—')
            const descLines = colDesc ? doc.splitTextToSize(descText, colDesc.w - 5) : []

            // Status text
            const statusText = normalizeObservationStatus(item.status)

            // Priority text
            const prioText = item.priority || 'Medium'

            // Due Date text
            const dueText = item.dueDate ? formatDatePattern(item.dueDate) : '—'

            // Photos sizing - ALL images related to that pin inside table
            const validPhotos = colPhotos ? photos.filter(p => !!p.imageData) : []
            const photoDims = []
            const photoGap = 2.5
            let totalPhotoH = 0

            if (colPhotos && validPhotos.length > 0) {
              const maxPW = Math.max(16, colPhotos.w - 5)
              for (const p of validPhotos) {
                const aspect = p.aspect && p.aspect > 0 ? p.aspect : 1.33
                let pW = Math.min(maxPW, 32)
                let pH = pW / aspect
                if (pH > 28) {
                  pH = 28
                  pW = pH * aspect
                }
                photoDims.push({ p, pW, pH, aspect })
              }
              totalPhotoH = photoDims.reduce((sum, d) => sum + d.pH, 0) + (photoDims.length - 1) * photoGap
            }

            // Drawing location snippet sizing
            const cropSize = (colLocation && crop) ? Math.min(28, colLocation.w - 6) : 0
            const sheetText = `Sheets: ${fp?.name || 'Floor Plan'}`
            doc.setFont(pdfFont, 'normal')
            doc.setFontSize(7.5)
            const sheetLines = colLocation ? doc.splitTextToSize(sheetText, colLocation.w - 4) : []

            // Determine row height
            const heightList = [14] // minimum base row height
            if (colCategory) heightList.push(catLines.length * 4.2 + 5)
            if (colDesc) heightList.push(descLines.length * 4.2 + 5)
            if (colStatus) heightList.push(10)
            if (colPriority) heightList.push(10)
            if (colDueDate) heightList.push(10)
            if (colPhotos) heightList.push(validPhotos.length > 0 ? (totalPhotoH + 5) : 8)
            if (colLocation) heightList.push(crop ? (cropSize + sheetLines.length * 3.4 + 6) : (sheetLines.length * 3.4 + 6))

            const rowH = Math.max(...heightList)

            // Pagination check
            if (y + rowH > H - margin - 8) {
              addPageNum()
              doc.addPage()
              y = margin
              y = drawTableHeader(y)
            }

            // Render Category
            if (colCategory) {
              doc.setFont(pdfFont, 'normal')
              doc.setFontSize(8.5)
              doc.setTextColor(15, 23, 42)
              doc.text(catLines, colCategory.x + 2, y + 4.5)
            }

            // Render Description
            if (colDesc) {
              doc.setFont(pdfFont, 'normal')
              doc.setFontSize(8.5)
              doc.setTextColor(15, 23, 42)
              doc.text(descLines, colDesc.x + 2.5, y + 4.5)
            }

            // Render Status
            if (colStatus) {
              const st = (item.status || 'open').toLowerCase()
              let sBg = [239, 246, 255], sBorder = [191, 219, 254], sText = [29, 78, 216]
              if (st.includes('progress')) {
                sBg = [254, 243, 199]; sBorder = [252, 211, 77]; sText = [180, 83, 9]
              } else if (st.includes('close') || st.includes('resolve') || st.includes('done')) {
                sBg = [240, 253, 244]; sBorder = [187, 247, 208]; sText = [22, 101, 52]
              }
              doc.setFont(pdfFont, 'bold')
              doc.setFontSize(7.5)
              const sW = Math.min(colStatus.w - 3, doc.getTextWidth(statusText) + 4)
              const sH = 4.6
              const sX = colStatus.x + (colStatus.w - sW) / 2
              const sY = y + 3.5
              doc.setFillColor(sBg[0], sBg[1], sBg[2])
              doc.setDrawColor(sBorder[0], sBorder[1], sBorder[2])
              doc.setLineWidth(0.2)
              doc.roundedRect(sX, sY, sW, sH, 1.2, 1.2, 'FD')
              doc.setTextColor(sText[0], sText[1], sText[2])
              doc.text(statusText, sX + sW / 2, sY + 3.2, { align: 'center' })
            }

            // Render Priority
            if (colPriority) {
              const pr = (item.priority || 'medium').toLowerCase()
              let pBg = [254, 243, 199], pBorder = [252, 211, 77], pText = [180, 83, 9]
              if (pr === 'critical') {
                pBg = [254, 242, 242]; pBorder = [254, 202, 202]; pText = [185, 28, 28]
              } else if (pr === 'high') {
                pBg = [255, 247, 237]; pBorder = [254, 215, 170]; pText = [194, 65, 12]
              } else if (pr === 'low') {
                pBg = [241, 245, 249]; pBorder = [203, 213, 225]; pText = [71, 85, 105]
              }
              doc.setFont(pdfFont, 'bold')
              doc.setFontSize(7.5)
              const pBadgeW = Math.min(colPriority.w - 3, doc.getTextWidth(prioText) + 4)
              const pBadgeH = 4.6
              const pBadgeX = colPriority.x + (colPriority.w - pBadgeW) / 2
              const pBadgeY = y + 3.5
              doc.setFillColor(pBg[0], pBg[1], pBg[2])
              doc.setDrawColor(pBorder[0], pBorder[1], pBorder[2])
              doc.setLineWidth(0.2)
              doc.roundedRect(pBadgeX, pBadgeY, pBadgeW, pBadgeH, 1.2, 1.2, 'FD')
              doc.setTextColor(pText[0], pText[1], pText[2])
              doc.text(prioText, pBadgeX + pBadgeW / 2, pBadgeY + 3.2, { align: 'center' })
            }

            // Render Due Date
            if (colDueDate) {
              doc.setFont(pdfFont, 'normal')
              doc.setFontSize(8)
              doc.setTextColor(51, 65, 85)
              doc.text(dueText, colDueDate.x + colDueDate.w / 2, y + 6.5, { align: 'center' })
            }

            // Render ALL Photos related to that pin
            if (colPhotos) {
              if (photoDims.length > 0) {
                let curPy = y + 2.5
                for (const d of photoDims) {
                  const px = colPhotos.x + (colPhotos.w - d.pW) / 2
                  try {
                    doc.addImage(d.p.imageData, 'JPEG', px, curPy, d.pW, d.pH, '', 'FAST')
                    doc.setDrawColor(203, 213, 225)
                    doc.setLineWidth(0.2)
                    doc.rect(px, curPy, d.pW, d.pH)
                  } catch {}
                  curPy += d.pH + photoGap
                }
              } else {
                doc.setFont(pdfFont, 'normal')
                doc.setFontSize(8.5)
                doc.setTextColor(148, 163, 184)
                doc.text('—', colPhotos.x + colPhotos.w / 2, y + 6.5, { align: 'center' })
              }
            }

            // Render Drawing Location
            if (colLocation) {
              let curLocY = y + 2.5
              if (crop?.dataUrl) {
                const cx = colLocation.x + (colLocation.w - cropSize) / 2
                try {
                  doc.addImage(crop.dataUrl, 'JPEG', cx, curLocY, cropSize, cropSize, '', 'FAST')
                  doc.setDrawColor(203, 213, 225)
                  doc.setLineWidth(0.2)
                  doc.rect(cx, curLocY, cropSize, cropSize)
                } catch {}
                curLocY += cropSize + 2.5
              }
              doc.setFont(pdfFont, 'normal')
              doc.setFontSize(7.5)
              doc.setTextColor(51, 65, 85)
              doc.text(sheetLines, colLocation.x + 2, curLocY + 1.2)
            }

            // Draw table grid borders for this row
            doc.setDrawColor(15, 23, 42)
            doc.setLineWidth(0.25)
            for (const col of activeCols) {
              doc.line(col.x, y, col.x, y + rowH)
            }
            doc.line(margin + tableW, y, margin + tableW, y + rowH)
            doc.line(margin, y + rowH, margin + tableW, y + rowH)

            y += rowH
          }
        }
      } else {
        // ── EACH DRAWING KEY PLAN HAS ITS PUNCH LIST BELOW IT BEFORE NEXT DRAWING ──
        for (let dIdx = 0; dIdx < drawingsToRender.length; dIdx++) {
          const fp = drawingsToRender[dIdx]

          // Advance to a clean page:
          // 1. Always for subsequent drawings when key plans are included
          // 2. For the first drawing (dIdx === 0) if project metadata occupies the top of page 1,
          //    giving the key plan architectural drawing a dedicated full-page view without squeezing or cropping
          if (exportFields.keyPlans) {
            if (dIdx > 0 || y > margin + 40) {
              addPageNum()
              doc.addPage()
              y = margin
            }
          }

          if (exportFields.keyPlans) {
            // Pins on this key plan:
            // When unlicensed/capped: only place pins for items that are actually exported (first 2 observation points total)
            // When licensed: place all pins on this drawing in the current report context
            const itemsOnFp = (isCapped ? itemsToExport : items).filter(i => {
              const hasPinOnThisFp = (i.floorPlanUuid === fp.uuid) || (Array.isArray(i.extraPins) && i.extraPins.some(ep => ep.floorPlanUuid === fp.uuid))
              if (!hasPinOnThisFp) return false
              if (filterReport !== 'All') {
                const belongs = i.phaseUuid === filterReport || fp.phaseUuid === filterReport || (!fp.phaseUuid && filterReport === phases[0]?.uuid)
                if (!belongs) return false
              }
              return true
            })

            const planResult = await renderFloorPlanWithPins(fp, itemsOnFp)

            if (planResult && planResult.dataUrl) {
              const titleH = 7 // Title text + spacing
              const maxAllowedW = W - margin * 2
              let maxAllowedH = H - margin - y - titleH - 6 // Remaining vertical space with safety buffer

              // If remaining space on this page is too tight to display an architectural plan legibly (< 90mm), advance to next page
              if (maxAllowedH < 90 && y > margin) {
                addPageNum()
                doc.addPage()
                y = margin
                maxAllowedH = H - margin - y - titleH - 6
              }

              // Fit strictly within maxAllowedW x maxAllowedH preserving exact aspect ratio (contain - ZERO CROP)
              let planW = maxAllowedW
              let planH = planW / planResult.aspect

              // If height exceeds available vertical space, scale down proportionally by height
              if (planH > maxAllowedH) {
                planH = maxAllowedH
                planW = planH * planResult.aspect
              }

              // If width exceeds available horizontal space, scale down proportionally by width
              if (planW > maxAllowedW) {
                planW = maxAllowedW
                planH = planW / planResult.aspect
              }

              // Horizontally center the key plan within the page margins
              const planX = margin + Math.max(0, (maxAllowedW - planW) / 2)

              // Keyplan Title - Simple Text (Capitalized)
              doc.setFont(pdfFont, 'bold')
              doc.setFontSize(9.5)
              doc.setTextColor(15, 23, 42)
              doc.text(`KEY PLAN — ${fp.name.toUpperCase()} (PIN LOCATIONS)`, margin, y + 3.5)
              y += titleH

              try {
                doc.addImage(planResult.dataUrl, 'JPEG', planX, y, planW, planH, '', 'FAST')
                doc.setDrawColor(203, 213, 225)
                doc.setLineWidth(0.2)
                doc.rect(planX, y, planW, planH)
              } catch (imgErr) {
                console.warn('Failed to render key plan image onto PDF:', imgErr)
              }

              y += planH + 7
            }
          }

          // Observations on this drawing
          const fpPunchItems = itemsToExport.filter(i => i.floorPlanUuid === fp.uuid)

          if (fpPunchItems.length > 0) {
            // If remaining vertical space cannot accommodate observations header + first item with photos (~45mm), advance to clean page
            if (y > H - margin - 45) {
              addPageNum()
              doc.addPage()
              y = margin
            }

            doc.setFont(pdfFont, 'bold')
            doc.setFontSize(10)
            doc.setTextColor(15, 23, 42)
            doc.text(`OBSERVATIONS — ${fp.name.toUpperCase()}`, margin, y + 2)
            y += 5
            doc.setDrawColor(203, 213, 225)
            doc.setLineWidth(0.2)
            doc.line(margin, y, W - margin, y)
            y += 5

            for (const item of fpPunchItems) {
              renderObservationItem(item)
              exportedItemUuids.add(item.uuid)
            }
          }
        }

        // ── ANY UNASSIGNED ITEMS (NOT TIED TO RENDERED DRAWINGS) ───────────────
        const remainingItems = itemsToExport.filter(i => !exportedItemUuids.has(i.uuid))
        if (remainingItems.length > 0) {
          if (drawingsToRender.length > 0 && y > H - margin - 30) {
            addPageNum()
            doc.addPage()
            y = margin
          }

          doc.setFont(pdfFont, 'bold')
          doc.setFontSize(10)
          doc.setTextColor(15, 23, 42)
          doc.text('OBSERVATION ITEMS', margin, y + 2)
          y += 5
          doc.setDrawColor(203, 213, 225)
          doc.setLineWidth(0.2)
          doc.line(margin, y, W - margin, y)
          y += 5

          for (const item of remainingItems) {
            renderObservationItem(item)
            exportedItemUuids.add(item.uuid)
          }
        }
      }

      // Add a clean disclaimer box if exported in free preview mode
      if (isCapped) {
        if (y > H - margin - 18) {
          addPageNum()
          doc.addPage()
          y = margin
        }
        y += 4
        doc.setFillColor(254, 243, 199)
        doc.setDrawColor(252, 211, 77)
        doc.setLineWidth(0.2)
        doc.roundedRect(margin, y, W - margin * 2, 8, 1.5, 1.5, 'FD')
        doc.setFont(pdfFont, 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(180, 83, 9)
        doc.text(
          `Free Export Preview: 2 of ${sortedItems.length} observation items exported. Unlock this project to export all items.`,
          margin + 3,
          y + 5.2
        )
        y += 12
      }

      addPageNum()

      // Prepare PDF for visual preview & export confirmation
      const safeReport = (effectiveReport?.name || project?.name || 'Report').replace(/[^a-z0-9]/gi, '_')
      const currentDrawingObj = floorPlans.find(f => f.uuid === filterDrawing)
      const safeDrawing = filterDrawing !== 'All' && currentDrawingObj ? `_${currentDrawingObj.name.replace(/[^a-z0-9]/gi, '_')}` : ''
      const filename = `PunchList_${safeReport}${safeDrawing}_${new Date().toISOString().slice(0, 10)}.pdf`
      
      const blob = doc.output('blob')
      const previewUrl = URL.createObjectURL(blob)
      const pageCount = doc.internal.getNumberOfPages()

      setPdfPreviewModal({
        url: previewUrl,
        blob,
        doc,
        filename,
        pageCount,
      })
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('PDF generation failed: ' + (err.message || String(err)))
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirmDownloadPDF = () => {
    if (!pdfPreviewModal) return
    const { doc, filename, url } = pdfPreviewModal
    try {
      if (doc && doc.save) {
        doc.save(filename)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      try {
        incrementExportedPdfCount?.()
        // Log PDF export per-project for the Logs tab in Settings
        logExport({
          projectUuid: currentProjectUuid || '',
          projectName: project?.name || '',
          type: 'pdf',
          reportName: effectiveReport?.name || project?.name || '',
          filename: pdfPreviewModal.filename || filename,
          pageCount: pdfPreviewModal.pageCount || null,
        }).catch(() => {})
      } catch {}
      setDone(true)
      setTimeout(() => {
        setDone(false)
        if (pdfPreviewModal?.url) {
          URL.revokeObjectURL(pdfPreviewModal.url)
        }
        setPdfPreviewModal(null)
        closePDFPreview()
      }, 1200)
    } catch (err) {
      alert('Download failed: ' + (err.message || String(err)))
    }
  }

  const handleClosePreviewModal = () => {
    if (pdfPreviewModal?.url) {
      URL.revokeObjectURL(pdfPreviewModal.url)
    }
    setPdfPreviewModal(null)
  }

  const handlePrintPDF = () => {
    if (!pdfPreviewModal?.url) return
    const win = window.open(pdfPreviewModal.url)
    if (win) {
      win.focus()
      win.print()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-full w-full overflow-hidden select-none">
      {/* Full Page Header - 100% Edge-to-Edge */}
      <header
        className="sitepunch-header text-white shadow-lg flex-shrink-0"
        style={{
          background: 'var(--brand-header, #1e40af)',
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
          paddingBottom: '12px',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center justify-between min-h-[44px] max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={closePDFPreview}
              className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={20} className="block" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h1 className="font-bold text-base leading-tight truncate text-white drop-shadow-xs">
                Generate Site Visit Report
              </h1>
              <p className="text-white/80 text-xs leading-tight mt-0.5 truncate font-medium">
                {filterDrawing !== 'All'
                  ? `Configuring single key plan export for "${availableDrawings.find(f => f.uuid === filterDrawing)?.name || 'Key Plan'}"`
                  : activeReport
                  ? `Configuring export for "${activeReport.name}"`
                  : 'Print-ready PDF & spreadsheet exporter'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Full Page Content */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50"
        style={{
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto w-full space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader size={32} className="animate-spin text-brand-600" />
            </div>
          ) : (
            <>
              {/* Report Fields & Visibility Card */}
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={17} className="text-brand-700" style={{ color: 'var(--brand-button, #1d4ed8)' }} />
                    <h3 className="text-sm font-bold text-gray-900">Report Field Visibility</h3>
                    <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {Object.values(exportFields).filter(Boolean).length} / {Object.keys(exportFields).length} active
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFields}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
                      style={{ color: 'var(--brand-button, #1d4ed8)' }}
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllFields}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-3">
                    Choose which key plan drawings and observation fields to show in the export:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Column 1: Key Plans & Drawing fields */}
                    <div className="flex flex-col gap-2.5">
                      {[
                        { id: 'keyPlans',        label: 'Key Plans' },
                        {
                          id: 'keyPlanSnips',
                          label: 'Key Plan Snip with Pin',
                          sublabel: 'Snip around pin next to observation item'
                        },
                        { id: 'status',          label: 'Status' },
                        { id: 'priority',        label: 'Priority' },
                        { id: 'trade',           label: 'Category' },
                        { id: 'reportCreatedBy', label: 'Report Created By' },
                      ].map(field => {
                        const isChecked = !!exportFields[field.id]
                        return (
                          <button
                            key={field.id}
                            type="button"
                            onClick={() => toggleExportField(field.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                              isChecked
                                ? 'border-brand-500 bg-blue-50/50 shadow-2xs ring-1 ring-brand-300/60'
                                : 'border-gray-200 bg-white hover:bg-gray-50/80 text-gray-500'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                isChecked
                                  ? 'text-white'
                                  : 'border-2 border-gray-300 bg-white'
                              }`}
                              style={isChecked ? { background: 'var(--brand-button, #1d4ed8)' } : {}}
                            >
                              {isChecked && <Check size={12} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-bold leading-tight ${isChecked ? 'text-gray-900' : 'text-gray-500'}`}>
                                {field.label}
                              </p>
                              {field.sublabel && (
                                <p className={`text-[10px] mt-0.5 font-medium leading-tight ${isChecked ? 'text-brand-700' : 'text-gray-400'}`}>
                                  {field.sublabel}
                                </p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Column 2: Photos & Observation detail fields */}
                    <div className="flex flex-col gap-2.5">
                      {[
                        { id: 'photos',          label: 'Observation Photos' },
                        {
                          id: 'photosOnRight',
                          label: 'Observation Images on Right Side',
                          sublabel: exportFields.photosOnRight ? 'On the right side' : 'Below observation notes'
                        },
                        { id: 'dueDate',         label: 'Due Date' },
                        { id: 'notes',           label: 'Pin Observation Description' },
                        { id: 'attendees',       label: 'List of Attendees' },
                        {
                          id: 'reportAsTable',
                          label: 'Report as Table',
                          tag: 'Table Layout',
                          sublabel: 'Category, Description, Photos, Drawing location'
                        },
                      ].map(field => {
                        const isChecked = !!exportFields[field.id]
                        return (
                          <button
                            key={field.id}
                            type="button"
                            onClick={() => toggleExportField(field.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                              isChecked
                                ? 'border-brand-500 bg-blue-50/50 shadow-2xs ring-1 ring-brand-300/60'
                                : 'border-gray-200 bg-white hover:bg-gray-50/80 text-gray-500'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                isChecked
                                  ? 'text-white'
                                  : 'border-2 border-gray-300 bg-white'
                              }`}
                              style={isChecked ? { background: 'var(--brand-button, #1d4ed8)' } : {}}
                            >
                              {isChecked && <Check size={12} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className={`text-xs font-bold leading-tight ${isChecked ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {field.label}
                                </p>
                                {field.tag && (
                                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${isChecked ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-500'}`}>
                                    {field.tag}
                                  </span>
                                )}
                              </div>
                              {field.sublabel && (
                                <p className={`text-[10px] mt-0.5 font-medium leading-tight ${isChecked ? 'text-brand-700' : 'text-gray-400'}`}>
                                  {field.sublabel}
                                </p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Format & Print Options Card */}
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Sliders size={17} className="text-brand-700" style={{ color: 'var(--brand-button, #1d4ed8)' }} />
                  <h3 className="text-sm font-bold text-gray-900">Format &amp; Print Options</h3>
                </div>

                {/* File Format Selector */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    Export File Format
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormat('pdf')}
                      className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                        format === 'pdf'
                          ? 'border-brand-500 bg-blue-50/60 shadow-xs ring-1 ring-brand-400'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                        format === 'pdf' ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        <FileText size={18} />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${format === 'pdf' ? 'text-brand-900' : 'text-gray-800'}`}>
                          PDF Document
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormat('csv')}
                      className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                        format === 'csv'
                          ? 'border-brand-500 bg-blue-50/60 shadow-xs ring-1 ring-brand-400'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                        format === 'csv' ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        <FileSpreadsheet size={18} />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${format === 'csv' ? 'text-brand-900' : 'text-gray-800'}`}>
                          Spreadsheet (CSV)
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormat('zip')}
                      className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                        format === 'zip'
                          ? 'border-brand-500 bg-blue-50/60 shadow-xs ring-1 ring-brand-400'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                        format === 'zip' ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        <FolderArchive size={18} />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${format === 'zip' ? 'text-brand-900' : 'text-gray-800'}`}>
                          Images (ZIP)
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* ZIP Specific Info Panel */}
                {format === 'zip' && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="p-3.5 bg-blue-50/70 border border-brand-200 rounded-xl space-y-2.5">
                      <div className="flex items-center gap-2">
                        <FolderArchive size={16} className="text-brand-700" />
                        <span className="text-xs font-bold text-brand-900">Archive Package Contents</span>
                      </div>
                      <p className="text-[11px] text-brand-800 leading-relaxed">
                        Packages all key plan drawings with pin markers and high-resolution defect photos into organized folders alongside an inspection summary:
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <div className="bg-white p-2.5 rounded-lg border border-brand-100 shadow-2xs">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">Key Plan Drawings</span>
                          <p className="text-xs font-bold text-gray-900 mt-0.5">
                            {availableDrawings.length > 0 ? availableDrawings.length : floorPlans.length} Drawing(s) with pins
                          </p>
                          <span className="text-[10px] text-gray-400">Folder: /01_Key_Plans</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-brand-100 shadow-2xs">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">Defect Photos</span>
                          <p className="text-xs font-bold text-gray-900 mt-0.5">
                            {filteredItems.reduce((acc, it) => acc + (photosMap[it.uuid] || []).length, 0)} Camera Photo(s)
                          </p>
                          <span className="text-[10px] text-gray-400">Folder: /02_Observation_Photos</span>
                        </div>
                      </div>
                      {!isLicensed && filteredItems.length > 2 && (
                        <p className="text-[11px] font-medium text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                          Unlicensed project: Zip archive will export the first 2 observations. Activate a license to export all observations and photos.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* PDF Specific Settings */}
                {format === 'pdf' && (
                  <div className="space-y-4 pt-2 border-t border-gray-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Paper Size */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                          Paper Size
                        </label>
                        <select
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-800 font-medium focus:ring-2 focus:ring-brand-400 focus:outline-none"
                          value={paperSize}
                          onChange={e => setPaperSize(e.target.value)}
                        >
                          <option value="letter">Letter (8.5" × 11") — Standard US</option>
                          <option value="a4">A4 (210 × 297 mm) — International</option>
                          <option value="tabloid">Tabloid / 11×17 (279 × 432 mm) — Large</option>
                        </select>
                      </div>

                      {/* Orientation */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                          Page Orientation
                        </label>
                        <select
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-800 font-medium focus:ring-2 focus:ring-brand-400 focus:outline-none"
                          value={orientation}
                          onChange={e => setOrientation(e.target.value)}
                        >
                          <option value="portrait">Portrait (Vertical)</option>
                          <option value="landscape">Landscape (Horizontal)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
                {/* Active Photo Quality Summary (for PDF & Images ZIP) */}
                {(format === 'pdf' || format === 'zip') && (
                  <div className="flex items-center justify-between gap-2 flex-wrap px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200/80 text-xs">
                    <div className="flex items-center gap-2 text-gray-700">
                      <ImageIcon size={14} className="text-brand-600 flex-shrink-0" />
                      <span className="font-semibold">Photo Quality:</span>
                      <span className="font-bold text-gray-900">{activeQualityProfile.label}</span>
                      <span className="text-gray-500">({activeQualityProfile.sizeHint})</span>
                    </div>
                    <span className="text-[11px] text-gray-400">Configured in Settings → Manage Projects</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Docked Full-Width Bottom Action Bar */}
      <div
        className="flex-shrink-0 bg-white border-t border-gray-200 p-4 shadow-xl z-20"
        style={{
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={closePDFPreview}
            className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5 ml-auto flex-wrap">
            {!isLicensed && (
              <button
                type="button"
                onClick={() => setShowLicenseModal(true)}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Key size={14} />
                <span>Activate License to Export</span>
              </button>
            )}
            {isLicensed && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <Check size={14} className="text-emerald-600" />
                <span>Export Unlocked</span>
              </span>
            )}

            <button
              type="button"
              disabled={generating || filteredItems.length === 0}
              onClick={
                format === 'pdf'
                  ? handleGeneratePDF
                  : format === 'csv'
                  ? handleGenerateCSV
                  : handleGenerateZip
              }
              className="sitepunch-btn-primary px-5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-md bg-brand-700 hover:bg-brand-800 text-white cursor-pointer"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {generating ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Generating {format.toUpperCase()}...
                </>
              ) : done ? (
                <>
                  <Check size={16} />
                  Exported!
                </>
              ) : format === 'pdf' ? (
                <>
                  <Eye size={16} />
                  <span>Preview &amp; Confirm PDF</span>
                </>
              ) : format === 'csv' ? (
                <>
                  <Download size={16} />
                  <span>Download CSV File</span>
                </>
              ) : (
                <>
                  <FolderArchive size={16} />
                  <span>Download Images (.zip)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PDF Export Preview & Confirmation Modal */}
      {pdfPreviewModal && (
        <div className="fixed inset-0 z-[60] bg-gray-900 flex flex-col h-full w-full select-none">
          {/* Edge-to-Edge Header */}
          <header
            className="sitepunch-header text-white px-4 py-3 flex items-center justify-between shadow-lg flex-shrink-0"
            style={{
              background: 'var(--brand-header, #1e40af)',
              paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
              paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
              paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleClosePreviewModal}
                className="p-2 -ml-2 rounded-full hover:bg-black/15 transition-colors flex items-center justify-center flex-shrink-0 text-white cursor-pointer min-w-[40px] min-h-[40px]"
                aria-label="Back to settings"
                title="Back to export settings"
              >
                <ArrowLeft size={22} />
              </button>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <FileCheck size={18} className="text-emerald-300 flex-shrink-0" />
                  <h2 className="font-bold text-base truncate">PDF Export Preview &amp; Confirmation</h2>
                </div>
                <p className="text-xs text-brand-200 truncate mt-0.5">
                  {pdfPreviewModal.filename} • {pdfPreviewModal.pageCount} page{pdfPreviewModal.pageCount !== 1 ? 's' : ''} • {filteredItems.length} observation{filteredItems.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </header>

          {/* Interactive PDF Document Viewer */}
          <div
            className="flex-1 bg-gray-800 p-2 sm:p-4 flex flex-col min-h-0 overflow-hidden"
            style={{
              paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
              paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
            }}
          >
            <div className="flex-1 w-full bg-white rounded-xl overflow-hidden shadow-2xl border border-gray-700 flex flex-col">
              <iframe
                src={`${pdfPreviewModal.url}#view=FitH&toolbar=1`}
                className="w-full h-full border-none bg-white"
                title="PDF Report Document Preview"
              />
            </div>
          </div>

          {/* Bottom Confirmation Footer Bar */}
          <div
            className="flex-shrink-0 bg-gray-900 border-t border-gray-700 px-4 py-3 shadow-2xl flex items-center justify-between gap-3"
            style={{
              paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
              paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
            }}
          >
            <button
              type="button"
              onClick={handleClosePreviewModal}
              className="px-4 py-2 border border-gray-600 hover:bg-gray-800 text-gray-300 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back to Edit Options</span>
            </button>

            <div className="flex items-center gap-2.5">
              {!isLicensed && filteredItems.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowLicenseModal(true)}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Key size={14} />
                  <span>Activate Project License</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmDownloadPDF}
                disabled={done}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                {done ? (
                  <>
                    <Check size={16} />
                    <span>Exported Successfully!</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>Confirm &amp; Download PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLicenseModal && (
        <LicenseActivationModal
          project={project}
          onSuccess={async (license) => {
            setIsLicensed(true)
            setShowLicenseModal(false)
            if (pdfPreviewModal) {
              await handleGeneratePDF()
            }
          }}
          onClose={() => setShowLicenseModal(false)}
        />
      )}
    </div>
  )
}
