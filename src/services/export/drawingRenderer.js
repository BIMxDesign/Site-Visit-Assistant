import { getKeyPlanQualityProfile } from '../../utils/media'
import { getFontFamily } from '../../utils/font'

/**
 * Gets natural dimensions and aspect ratio of an image source
 */
export function getImageDimensions(src) {
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

/**
 * Render floor plan image with circular numbered pins scaled to the active Photo Quality profile
 */
export async function renderFloorPlanWithPins({
  floorPlan,
  itemsToDraw = [],
  activeQuality = 'balanced',
  pinColor = '#a40e26',
  fontName = 'system',
}) {
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

          // Primary pin
          if (
            item.floorPlanUuid === floorPlan.uuid &&
            item.pinX != null && !isNaN(item.pinX) &&
            item.pinY != null && !isNaN(item.pinY)
          ) {
            let px = Number(item.pinX)
            let py = Number(item.pinY)
            if (px <= 1 && py <= 1 && natW > 1 && natH > 1) {
              px = px * natW
              py = py * natH
            }
            px = px * outScale
            py = py * outScale
            pinDataList.push({
              item,
              origX: px,
              origY: py,
              x: px,
              y: py,
              isExtra: false,
              id: `${item.uuid}_primary`,
            })
          }

          // Extra pins
          if (Array.isArray(item.extraPins)) {
            item.extraPins.forEach((ep, epIdx) => {
              const epFp = ep.floorPlanUuid || item.floorPlanUuid
              if (
                epFp === floorPlan.uuid &&
                ep.pinX != null && !isNaN(ep.pinX) &&
                ep.pinY != null && !isNaN(ep.pinY)
              ) {
                let px = Number(ep.pinX)
                let py = Number(ep.pinY)
                if (px <= 1 && py <= 1 && natW > 1 && natH > 1) {
                  px = px * natW
                  py = py * natH
                }
                px = px * outScale
                py = py * outScale
                pinDataList.push({
                  item,
                  origX: px,
                  origY: py,
                  x: px,
                  y: py,
                  isExtra: true,
                  id: `${item.uuid}_extra_${epIdx}`,
                })
              }
            })
          }
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

          // Outer white casing for leader line
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

          // Drop shadow
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
          const activeFontFamily = getFontFamily(fontName)
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

/**
 * Render high-res cropped floor plan snippet centered on a specific pin for the Table View / Snips
 */
export async function renderPinDrawingCrop({
  floorPlan,
  item,
  pinColor = '#a40e26',
  fontName = 'system',
}) {
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

        // Crop window size: roughly 22% of image dimension
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
        const activeFontFamily = getFontFamily(fontName)
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
