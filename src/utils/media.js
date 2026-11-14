import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Configure pdf.js worker locally for offline PWA & Electron support
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const PHOTO_QUALITY_STORAGE_KEY = 'sitepunch_photo_quality'
export const DEFAULT_PHOTO_QUALITY = 'balanced'

export const PHOTO_QUALITY_OPTIONS = [
  {
    id: 'saver',
    label: 'Saver',
    badge: 'Compact',
    sizeHint: 'Up to 1024px · Smaller backups',
    description: 'Faster syncing and compact storage (~1024px max dimension).',
    maxDim: 1024,
    quality: 0.72,
    keyPlanMaxDim: 1600,
    keyPlanQuality: 0.78,
    logoMaxDim: 512,
    exportTargetBytes: 220 * 1024,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    badge: 'Default',
    sizeHint: 'Print-ready image size (1600px max)',
    description: 'Recommended print-ready image size (~1600px) with sharp PDF report quality and efficient storage.',
    maxDim: 1600,
    quality: 0.86,
    keyPlanMaxDim: 2200,
    keyPlanQuality: 0.88,
    logoMaxDim: 900,
    exportTargetBytes: 550 * 1024,
  },
  {
    id: 'original',
    label: 'Original',
    badge: 'Full Res',
    sizeHint: 'Full camera resolution · Largest size',
    description: 'Keeps native camera dimensions without downscaling (uses the most storage).',
    maxDim: Infinity,
    quality: 0.95,
    keyPlanMaxDim: 3200,
    keyPlanQuality: 0.94,
    logoMaxDim: Infinity,
    exportTargetBytes: Infinity,
  },
]

export function getPhotoQualityProfile(qualityId) {
  return (
    PHOTO_QUALITY_OPTIONS.find(opt => opt.id === qualityId) ||
    PHOTO_QUALITY_OPTIONS.find(opt => opt.id === DEFAULT_PHOTO_QUALITY)
  )
}

export function getKeyPlanQualityProfile(qualityId) {
  const profile = getPhotoQualityProfile(qualityId)
  return {
    id: profile.id,
    maxDim: profile.keyPlanMaxDim,
    quality: profile.keyPlanQuality,
  }
}

export function getStoredPhotoQuality() {
  try {
    const raw = localStorage.getItem(PHOTO_QUALITY_STORAGE_KEY)
    if (raw && PHOTO_QUALITY_OPTIONS.some(opt => opt.id === raw)) {
      return raw
    }
  } catch {}
  return DEFAULT_PHOTO_QUALITY
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return dataUrl.length
  return Math.floor((dataUrl.length - commaIdx - 1) * 0.75)
}

function resizeDataUrl(dataUrl, { maxDim, quality, preserveAlpha = false, skipIfFits = false, targetBytes = Infinity }) {
  if (!dataUrl) return Promise.resolve(dataUrl)

  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width
        const natH = img.naturalHeight || img.height
        if (!natW || !natH) {
          resolve(dataUrl)
          return
        }

        const maxSide = Math.max(natW, natH)
        const scale = Number.isFinite(maxDim) && maxSide > maxDim ? maxDim / maxSide : 1
        const isJpeg = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')
        const byteSize = estimateDataUrlBytes(dataUrl)

        if (skipIfFits && scale === 1 && (preserveAlpha || isJpeg) && byteSize <= targetBytes) {
          resolve(dataUrl)
          return
        }

        const outW = Math.max(1, Math.round(natW * scale))
        const outH = Math.max(1, Math.round(natH * scale))

        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }

        const usePng = preserveAlpha && (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp'))
        if (!usePng) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, outW, outH)
        }
        ctx.drawImage(img, 0, 0, outW, outH)
        resolve(usePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export function preparePhotoForQuality(dataUrl, qualityId = DEFAULT_PHOTO_QUALITY) {
  const profile = getPhotoQualityProfile(qualityId)
  if (!dataUrl || profile.id === 'original') {
    return Promise.resolve(dataUrl)
  }
  return resizeDataUrl(dataUrl, {
    maxDim: profile.maxDim,
    quality: profile.quality,
    preserveAlpha: false,
    skipIfFits: false,
  })
}

export function ensurePhotoMatchesQuality(dataUrl, qualityId = DEFAULT_PHOTO_QUALITY) {
  const profile = getPhotoQualityProfile(qualityId)
  if (!dataUrl || profile.id === 'original') {
    return Promise.resolve(dataUrl)
  }
  return resizeDataUrl(dataUrl, {
    maxDim: profile.maxDim,
    quality: profile.quality,
    preserveAlpha: false,
    skipIfFits: true,
    targetBytes: profile.exportTargetBytes,
  })
}

export function prepareKeyPlanImageForQuality(dataUrl, qualityId = DEFAULT_PHOTO_QUALITY) {
  const profile = getPhotoQualityProfile(qualityId)
  if (!dataUrl || profile.id === 'original') {
    return Promise.resolve(dataUrl)
  }
  const kp = getKeyPlanQualityProfile(qualityId)
  return resizeDataUrl(dataUrl, {
    maxDim: kp.maxDim,
    quality: kp.quality,
    preserveAlpha: true,
    skipIfFits: true,
    targetBytes: profile.id === 'saver' ? 900 * 1024 : 2.2 * 1024 * 1024,
  })
}

export function prepareLogoForQuality(dataUrl, qualityId = DEFAULT_PHOTO_QUALITY) {
  const profile = getPhotoQualityProfile(qualityId)
  if (!dataUrl || profile.id === 'original') {
    return Promise.resolve(dataUrl)
  }
  return resizeDataUrl(dataUrl, {
    maxDim: profile.logoMaxDim,
    quality: profile.quality,
    preserveAlpha: true,
    skipIfFits: true,
    targetBytes: profile.id === 'saver' ? 120 * 1024 : 300 * 1024,
  })
}

export function getAnnotatorExportOptions(naturalWidth, naturalHeight, canvasWidth, qualityId = DEFAULT_PHOTO_QUALITY) {
  const profile = getPhotoQualityProfile(qualityId)
  const natW = Math.max(1, naturalWidth || canvasWidth || 1)
  const natH = Math.max(1, naturalHeight || canvasWidth || 1)
  const maxNat = Math.max(natW, natH)
  const targetScale = Number.isFinite(profile.maxDim) && maxNat > profile.maxDim
    ? profile.maxDim / maxNat
    : 1
  const targetWidth = Math.max(1, Math.round(natW * targetScale))
  const multiplier = Math.max(0.5, targetWidth / Math.max(1, canvasWidth || 1))

  return {
    format: 'jpeg',
    quality: profile.quality,
    multiplier,
  }
}

export function isPdfFile(file) {
  if (!file) return false
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
}

export function isKeyPlanImageFile(file) {
  if (!file) return false
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name || '')
}

export async function loadPdfDocument(file) {
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdfDoc = await loadingTask.promise
  return { pdfDoc, numPages: pdfDoc.numPages }
}

async function renderPdfPageCanvas(pdfDoc, pageNumber = 1, maxDim = 2200, maxScale = 3.5) {
  const safePage = Math.min(Math.max(1, pageNumber), pdfDoc.numPages || 1)
  const page = await pdfDoc.getPage(safePage)
  const baseViewport = page.getViewport({ scale: 1 })
  const baseMax = Math.max(baseViewport.width, baseViewport.height) || 1
  const scale = Math.min(maxScale, Math.max(0.2, maxDim / baseMax))
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not initialize canvas for PDF rendering')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

export async function renderPdfThumbnail(pdfDoc, pageNumber = 1, maxDim = 320) {
  const canvas = await renderPdfPageCanvas(pdfDoc, pageNumber, maxDim, 1.5)
  return canvas.toDataURL('image/jpeg', 0.78)
}

export async function renderPdfPageToDataUrl(pdfDoc, pageNumber = 1, qualityId = DEFAULT_PHOTO_QUALITY) {
  const kp = getKeyPlanQualityProfile(qualityId)
  const canvas = await renderPdfPageCanvas(pdfDoc, pageNumber, kp.maxDim, 3.5)

  if (kp.id !== 'saver') {
    const pngDataUrl = canvas.toDataURL('image/png')
    // Keep lossless PNG for crisp CAD vectors on Balanced/Original when output size stays compact
    const maxPngBytes = kp.id === 'original' ? 4.5 * 1024 * 1024 : 2.5 * 1024 * 1024
    if (estimateDataUrlBytes(pngDataUrl) <= maxPngBytes) {
      return pngDataUrl
    }
  }
  return canvas.toDataURL('image/jpeg', kp.quality)
}
