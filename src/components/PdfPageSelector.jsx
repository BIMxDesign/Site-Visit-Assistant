import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, FileText, Check, X, Layers, CopyPlus, FileCheck2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  isPdfFile,
  isKeyPlanImageFile,
  readFileAsDataUrl,
  loadPdfDocument,
  renderPdfPageToDataUrl,
  renderPdfThumbnail,
  prepareKeyPlanImageForQuality,
  getStoredPhotoQuality,
} from '../utils/media'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_PDF_BYTES = 30 * 1024 * 1024
const THUMBS_PER_BATCH = 6

export const KEY_PLAN_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.pdf'

export function useKeyPlanUpload(initialPreview = null, options = {}) {
  const { allowAllPages = false } = options
  const { photoQuality } = useAppStore()
  const activeQuality = photoQuality || getStoredPhotoQuality()
  const [preview, setPreview] = useState(initialPreview)
  const [hasNewMedia, setHasNewMedia] = useState(false)
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [pdfInfo, setPdfInfo] = useState(null) // { doc, baseName, fileName, totalPages, currentPage }
  const [needsPageSelection, setNeedsPageSelection] = useState(false)
  const [importAllPages, setImportAllPages] = useState(false)
  const [renderProgress, setRenderProgress] = useState(null) // { current, total } | null
  const pdfDocRef = useRef(null)
  const suggestNameCbRef = useRef(null)
  const lastAutoSuggestedRef = useRef('')

  function disposePdfDoc() {
    if (pdfDocRef.current) {
      try {
        pdfDocRef.current.destroy?.()
      } catch {}
      pdfDocRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      disposePdfDoc()
    }
  }, [])

  function resetMedia(nextPreview = initialPreview) {
    disposePdfDoc()
    setPdfInfo(null)
    setNeedsPageSelection(false)
    setImportAllPages(false)
    setRenderProgress(null)
    setPreview(nextPreview)
    setHasNewMedia(false)
    setMediaError('')
    setLoadingMedia(false)
    lastAutoSuggestedRef.current = ''
  }

  async function processFile(file, onSuggestName) {
    if (!file) return false

    const pdf = isPdfFile(file)
    const image = isKeyPlanImageFile(file)

    if (!pdf && !image) {
      setMediaError('Please select a JPG, PNG, WebP image or PDF file.')
      return false
    }

    if (pdf && file.size > MAX_PDF_BYTES) {
      setMediaError('PDF file must be under 30 MB.')
      return false
    }
    if (!pdf && file.size > MAX_IMAGE_BYTES) {
      setMediaError('Image must be under 20 MB.')
      return false
    }

    setMediaError('')
    setLoadingMedia(true)
    suggestNameCbRef.current = onSuggestName || null

    try {
      const baseName = file.name.replace(/\.[^.]+$/, '')

      if (pdf) {
        disposePdfDoc()
        const { pdfDoc, numPages } = await loadPdfDocument(file)
        pdfDocRef.current = pdfDoc

        if (numPages > 1) {
          // Do not auto-commit Page 1 for multi-page PDFs; require user to pick single page or all pages
          setPdfInfo({
            doc: pdfDoc,
            baseName,
            fileName: file.name,
            totalPages: numPages,
            currentPage: null,
          })
          setImportAllPages(false)
          setNeedsPageSelection(true)
        } else {
          const dataUrl = await renderPdfPageToDataUrl(pdfDoc, 1, activeQuality)
          setPdfInfo({
            doc: pdfDoc,
            baseName,
            fileName: file.name,
            totalPages: 1,
            currentPage: 1,
          })
          setImportAllPages(false)
          setNeedsPageSelection(false)
          setPreview(dataUrl)
          setHasNewMedia(true)
          lastAutoSuggestedRef.current = baseName
          onSuggestName?.(baseName, '')
        }
      } else {
        disposePdfDoc()
        setPdfInfo(null)
        setImportAllPages(false)
        setNeedsPageSelection(false)
        const rawDataUrl = await readFileAsDataUrl(file)
        const dataUrl = await prepareKeyPlanImageForQuality(rawDataUrl, activeQuality)
        setPreview(dataUrl)
        setHasNewMedia(true)
        lastAutoSuggestedRef.current = baseName
        onSuggestName?.(baseName, '')
      }
      return true
    } catch (err) {
      console.error('Failed to process key plan file:', err)
      setMediaError(
        pdf
          ? 'Could not render this PDF file. Please verify it is not password-protected or corrupted.'
          : 'Failed to read image file. Please try another file.'
      )
      return false
    } finally {
      setLoadingMedia(false)
    }
  }

  async function confirmPdfPage(pageNumber) {
    if (!pdfInfo?.doc) return
    const clamped = Math.min(Math.max(1, Number(pageNumber) || 1), pdfInfo.totalPages)

    setLoadingMedia(true)
    setMediaError('')
    try {
      const dataUrl = await renderPdfPageToDataUrl(pdfInfo.doc, clamped, activeQuality)
      const prevAuto = lastAutoSuggestedRef.current
      const nextAuto = pdfInfo.totalPages > 1
        ? `${pdfInfo.baseName} - Page ${clamped}`
        : pdfInfo.baseName

      setImportAllPages(false)
      setPreview(dataUrl)
      setHasNewMedia(true)
      setNeedsPageSelection(false)
      setPdfInfo(prev => (prev ? { ...prev, currentPage: clamped } : prev))
      lastAutoSuggestedRef.current = nextAuto
      suggestNameCbRef.current?.(nextAuto, prevAuto)
    } catch (err) {
      console.error('Failed to render PDF page:', err)
      setMediaError('Failed to render the selected PDF page.')
    } finally {
      setLoadingMedia(false)
    }
  }

  async function confirmAllPdfPages() {
    if (!allowAllPages || !pdfInfo?.doc || pdfInfo.totalPages <= 1) return

    setLoadingMedia(true)
    setMediaError('')
    try {
      // Render page 1 as sample preview for the upload card
      const firstPagePreview = await renderPdfPageToDataUrl(pdfInfo.doc, 1, activeQuality)
      const prevAuto = lastAutoSuggestedRef.current
      const nextAuto = pdfInfo.baseName

      setImportAllPages(true)
      setPreview(firstPagePreview)
      setHasNewMedia(true)
      setNeedsPageSelection(false)
      setPdfInfo(prev => (prev ? { ...prev, currentPage: 1 } : prev))
      lastAutoSuggestedRef.current = nextAuto
      suggestNameCbRef.current?.(nextAuto, prevAuto)
    } catch (err) {
      console.error('Failed to prepare PDF preview:', err)
      setMediaError('Failed to prepare multi-page PDF import.')
    } finally {
      setLoadingMedia(false)
    }
  }

  async function renderAllPagesForSave(onPageRendered) {
    if (!pdfInfo?.doc || !importAllPages) return []
    const total = pdfInfo.totalPages
    const results = []
    setRenderProgress({ current: 0, total })
    try {
      for (let pageNum = 1; pageNum <= total; pageNum++) {
        setRenderProgress({ current: pageNum, total })
        const imageData = await renderPdfPageToDataUrl(pdfInfo.doc, pageNum, activeQuality)
        results.push({ pageNumber: pageNum, imageData })
        if (onPageRendered) {
          await onPageRendered(pageNum, imageData, total)
        }
      }
      return results
    } finally {
      setRenderProgress(null)
    }
  }

  function openPagePicker() {
    if (pdfInfo?.totalPages > 1) {
      setNeedsPageSelection(true)
    }
  }

  function cancelPageSelection() {
    if (pdfInfo && pdfInfo.currentPage == null && !importAllPages) {
      // No page or batch mode confirmed yet — discard pending PDF doc
      disposePdfDoc()
      setPdfInfo(null)
    }
    setNeedsPageSelection(false)
  }

  return {
    preview,
    hasNewMedia,
    loadingMedia,
    mediaError,
    setMediaError,
    pdfInfo,
    needsPageSelection,
    importAllPages,
    allowAllPages,
    renderProgress,
    processFile,
    confirmPdfPage,
    confirmAllPdfPages,
    renderAllPagesForSave,
    openPagePicker,
    cancelPageSelection,
    resetMedia,
  }
}

function PdfMultiPagePickerModal({
  pdfInfo,
  allowAllPages,
  initialMode,
  loadingMedia,
  onConfirmPage,
  onConfirmAllPages,
  onCancel,
}) {
  const { doc, baseName, fileName, totalPages, currentPage } = pdfInfo
  const [mode, setMode] = useState(initialMode || 'single') // 'single' | 'all'
  const [selectedPage, setSelectedPage] = useState(currentPage || null)
  const [batchStart, setBatchStart] = useState(() => {
    if (!currentPage) return 1
    return Math.floor((currentPage - 1) / THUMBS_PER_BATCH) * THUMBS_PER_BATCH + 1
  })
  const [thumbs, setThumbs] = useState({})

  const batchEnd = Math.min(totalPages, batchStart + THUMBS_PER_BATCH - 1)
  const visiblePages = Array.from(
    { length: batchEnd - batchStart + 1 },
    (_, i) => batchStart + i
  )

  useEffect(() => {
    let cancelled = false
    async function loadBatchThumbnails() {
      for (const pageNum of visiblePages) {
        if (cancelled) return
        if (thumbs[pageNum]) continue
        try {
          const thumbUrl = await renderPdfThumbnail(doc, pageNum, 320)
          if (!cancelled) {
            setThumbs(prev => (prev[pageNum] ? prev : { ...prev, [pageNum]: thumbUrl }))
          }
        } catch {
          // Ignore individual thumbnail failure; fallback tile keeps page selectable
        }
      }
    }
    loadBatchThumbnails()
    return () => {
      cancelled = true
    }
  }, [doc, batchStart, totalPages])

  function handleJumpPage(targetPage) {
    setMode('single')
    setSelectedPage(targetPage)
    const targetBatchStart = Math.floor((targetPage - 1) / THUMBS_PER_BATCH) * THUMBS_PER_BATCH + 1
    if (targetBatchStart !== batchStart) {
      setBatchStart(targetBatchStart)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-page-picker-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-5 py-4 text-white flex items-center justify-between gap-3 flex-shrink-0"
          style={{ background: 'var(--brand-header, #1e40af)' }}
        >
          <div className="min-w-0">
            <h2 id="pdf-page-picker-title" className="text-base sm:text-lg font-bold truncate">
              {allowAllPages ? 'Import Multi-Page PDF Key Plan' : 'Choose 1 Page from PDF'}
            </h2>
            <p className="text-xs text-white/80 truncate mt-0.5">
              {fileName} · {totalPages} pages total
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loadingMedia}
            className="p-1.5 rounded-full hover:bg-black/15 text-white/85 hover:text-white transition-colors cursor-pointer"
            aria-label="Close page selector"
          >
            <X size={20} />
          </button>
        </div>

        {/* Option Switcher (when importing into Add Key Plan) or single-page banner */}
        {allowAllPages ? (
          <div className="p-4 sm:px-5 bg-white border-b border-gray-200 space-y-2.5 flex-shrink-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              How would you like to import this {totalPages}-page PDF?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loadingMedia}
                onClick={() => setMode('single')}
                className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-2.5 ${
                  mode === 'single'
                    ? 'bg-blue-50/40 shadow-2xs'
                    : 'border-gray-200 bg-gray-50/60 hover:bg-white'
                }`}
                style={
                  mode === 'single'
                    ? { borderColor: 'var(--brand-button, #1d4ed8)' }
                    : undefined
                }
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode === 'single' ? 'text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                  style={mode === 'single' ? { background: 'var(--brand-button, #1d4ed8)' } : undefined}
                >
                  <FileCheck2 size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900">Select Single Page</p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                    Pick 1 specific sheet from this PDF to add as one key plan.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={loadingMedia}
                onClick={() => setMode('all')}
                className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-2.5 ${
                  mode === 'all'
                    ? 'bg-blue-50/40 shadow-2xs'
                    : 'border-gray-200 bg-gray-50/60 hover:bg-white'
                }`}
                style={
                  mode === 'all'
                    ? { borderColor: 'var(--brand-button, #1d4ed8)' }
                    : undefined
                }
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode === 'all' ? 'text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                  style={mode === 'all' ? { background: 'var(--brand-button, #1d4ed8)' } : undefined}
                >
                  <CopyPlus size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900">Import All {totalPages} Pages</p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                    Creates {totalPages} separate key plans — each PDF page gets its own key plan view.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-amber-900 font-medium">
              <Layers size={15} className="text-amber-700 flex-shrink-0" />
              <span>Only one page can be uploaded per key plan. Select the sheet you want to use:</span>
            </div>
          </div>
        )}

        {/* Body: either All-Pages summary OR Single-Page thumbnail selector */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-gray-50">
          {mode === 'all' && allowAllPages ? (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-bold text-gray-900">
                  {totalPages} Individual Key Plans Will Be Created
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Each PDF page stays strictly on its own key plan view so pins and observations stay isolated per sheet:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 max-h-52 overflow-y-auto pr-1">
                  {Array.from({ length: totalPages }, (_, idx) => (
                    <div
                      key={idx + 1}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200/80 text-xs"
                    >
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 flex-shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-medium text-gray-800 truncate">
                        {baseName} - Page {idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                Tip: You can edit the name prefix on the next screen before saving all {totalPages} key plans.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <span className="text-xs font-semibold text-gray-600">
                  Only 1 page can be attached to this key plan — tap a page below:
                </span>
                {totalPages > THUMBS_PER_BATCH && (
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 flex-shrink-0">
                    <span>Go to:</span>
                    <select
                      value={selectedPage || ''}
                      onChange={e => {
                        const val = Number(e.target.value)
                        if (val) handleJumpPage(val)
                      }}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      aria-label="Jump to PDF page"
                    >
                      <option value="" disabled>Page...</option>
                      {Array.from({ length: totalPages }, (_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          Page {idx + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {visiblePages.map(pageNum => {
                  const isSelected = selectedPage === pageNum
                  const thumbUrl = thumbs[pageNum]
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      disabled={loadingMedia}
                      onClick={() => setSelectedPage(pageNum)}
                      className={`group text-left rounded-xl border-2 bg-white overflow-hidden transition-all cursor-pointer flex flex-col ${
                        isSelected
                          ? 'shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-xs'
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: 'var(--brand-button, #1d4ed8)',
                              boxShadow: '0 0 0 2px rgba(29, 78, 216, 0.16)',
                            }
                          : undefined
                      }
                    >
                      <div className="aspect-[4/3] w-full bg-white border-b border-gray-100 flex items-center justify-center relative p-2 overflow-hidden">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={`PDF page ${pageNum}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-gray-400">
                            <div className="w-5 h-5 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                            <span className="text-[11px] font-medium">Page {pageNum}</span>
                          </div>
                        )}
                        {isSelected && (
                          <span
                            className="absolute top-2 right-2 w-6 h-6 rounded-full text-white flex items-center justify-center shadow-sm"
                            style={{ background: 'var(--brand-button, #1d4ed8)' }}
                          >
                            <Check size={14} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                        <span className="text-xs font-bold text-gray-900">Page {pageNum}</span>
                        <span className="text-[11px] text-gray-400 font-medium">
                          {isSelected ? 'Selected' : 'Tap to choose'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {totalPages > THUMBS_PER_BATCH && (
                <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-gray-200">
                  <button
                    type="button"
                    disabled={loadingMedia || batchStart <= 1}
                    onClick={() => setBatchStart(Math.max(1, batchStart - THUMBS_PER_BATCH))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                    <span>Previous Pages</span>
                  </button>
                  <span className="text-xs font-semibold text-gray-500">
                    Showing {batchStart}–{batchEnd} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={loadingMedia || batchEnd >= totalPages}
                    onClick={() => setBatchStart(batchStart + THUMBS_PER_BATCH)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                  >
                    <span>More Pages</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-gray-200 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
          <p className="text-xs font-medium text-gray-600">
            {mode === 'all' && allowAllPages
              ? <>Mode: <strong className="text-gray-900">Import all {totalPages} pages</strong> (each gets its own key plan)</>
              : selectedPage
                ? <>Selected: <strong className="text-gray-900">Page {selectedPage} of {totalPages}</strong></>
                : 'Select one page above to upload as this key plan'}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={loadingMedia}
              className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {mode === 'all' && allowAllPages ? (
              <button
                type="button"
                disabled={loadingMedia}
                onClick={onConfirmAllPages}
                className="px-5 py-2 text-white font-semibold text-xs rounded-xl transition-opacity flex items-center gap-1.5 shadow-sm disabled:opacity-45 cursor-pointer"
                style={{ background: 'var(--brand-button, #1d4ed8)' }}
              >
                {loadingMedia ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Preparing...</span>
                  </>
                ) : (
                  <>
                    <CopyPlus size={14} />
                    <span>Import All {totalPages} Pages</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={!selectedPage || loadingMedia}
                onClick={() => selectedPage && onConfirmPage(selectedPage)}
                className="px-5 py-2 text-white font-semibold text-xs rounded-xl transition-opacity flex items-center gap-1.5 shadow-sm disabled:opacity-45 cursor-pointer"
                style={{ background: 'var(--brand-button, #1d4ed8)' }}
              >
                {loadingMedia ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Rendering Page {selectedPage}...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>{selectedPage ? `Use Page ${selectedPage}` : 'Select a Page'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PdfPageSelector({
  pdfInfo,
  needsPageSelection,
  importAllPages = false,
  allowAllPages = false,
  loading,
  onConfirmPage,
  onConfirmAllPages,
  onOpenPicker,
  onCancelPicker,
}) {
  if (!pdfInfo) return null

  const { totalPages, currentPage, fileName } = pdfInfo

  return (
    <>
      {(currentPage != null || importAllPages) && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 flex-shrink-0">
              <FileText size={12} />
              PDF
            </span>
            <span className="text-xs font-medium text-gray-700 truncate">{fileName}</span>
            <span className="text-[11px] text-gray-500 font-medium flex-shrink-0">
              {importAllPages && totalPages > 1
                ? `(All ${totalPages} pages · 1 key plan per page)`
                : totalPages > 1
                  ? `(Page ${currentPage} of ${totalPages} · 1 page per key plan)`
                  : '(1 page)'}
            </span>
          </div>

          {totalPages > 1 && (
            <button
              type="button"
              disabled={loading}
              onClick={onOpenPicker}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-45 cursor-pointer flex-shrink-0"
            >
              {importAllPages ? 'Change Selection' : 'Change Page'}
            </button>
          )}
        </div>
      )}

      {needsPageSelection && totalPages > 1 && (
        <PdfMultiPagePickerModal
          pdfInfo={pdfInfo}
          allowAllPages={allowAllPages}
          initialMode={importAllPages ? 'all' : 'single'}
          loadingMedia={loading}
          onConfirmPage={onConfirmPage}
          onConfirmAllPages={onConfirmAllPages}
          onCancel={onCancelPicker}
        />
      )}
    </>
  )
}
