import React, { useState, useEffect, useRef } from 'react'
import { X, Check, Edit2, ArrowLeft, Upload, FileImage, RefreshCw, AlertCircle } from 'lucide-react'
import { saveFloorPlan } from '../db/database'
import { Spinner } from './NewProjectModal'
import PdfPageSelector, { useKeyPlanUpload, KEY_PLAN_FILE_ACCEPT } from './PdfPageSelector'

export default function RenameFloorPlanModal({ floorPlan, onClose, onSaved }) {
  const [name,        setName]        = useState(floorPlan?.name || '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const inputRef = useRef(null)
  const {
    preview,
    hasNewMedia,
    loadingMedia,
    mediaError,
    setMediaError,
    pdfInfo,
    needsPageSelection,
    processFile,
    confirmPdfPage,
    openPagePicker,
    cancelPageSelection,
    resetMedia,
  } = useKeyPlanUpload(floorPlan?.imageData || null)

  useEffect(() => {
    if (floorPlan) {
      setName(floorPlan.name || '')
      resetMedia(floorPlan.imageData || null)
    }
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 100)
  }, [floorPlan])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    await processFile(file)
  }

  function handleResetImage() {
    resetMedia(floorPlan?.imageData || null)
    setError('')
  }

  async function handleSave(e) {
    e?.preventDefault()
    if (loadingMedia) {
      setError('Please wait for the key plan file to finish loading.')
      return
    }
    if (needsPageSelection) {
      setError('Please select one page from the PDF for this key plan.')
      return
    }
    if (!name.trim()) {
      setError('Key plan name cannot be empty.')
      return
    }

    setSaving(true)
    setError('')
    setMediaError('')
    try {
      const updated = {
        ...floorPlan,
        name: name.trim(),
        imageData: preview || floorPlan.imageData,
        updatedAt: Date.now(),
      }
      await saveFloorPlan(updated)
      setSaving(false)
      onSaved?.(name.trim(), updated.imageData)
      onClose()
    } catch (err) {
      setError('Failed to save key plan changes: ' + (err.message || 'Unknown error'))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-full w-full overflow-hidden select-none">
      {/* Full Page Header - 100% Edge-to-Edge */}
      <header
        className="sitepunch-header bg-brand-800 text-white shadow-lg flex-shrink-0"
        style={{
          background: 'var(--brand-header, #1e40af)',
          paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
          paddingBottom: '14px',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center justify-between min-h-[46px] max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-black/15 transition-colors flex items-center justify-center flex-shrink-0 text-white cursor-pointer min-w-[40px] min-h-[40px]"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={22} className="block" />
            </button>
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl font-bold tracking-tight leading-tight truncate">Edit Key Plan</h1>
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">
                Update key plan title and select or replace key plan image or PDF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-black/15 rounded-full transition-colors ml-2 flex-shrink-0 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between overflow-hidden bg-gray-50">
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8"
          style={{
            paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto w-full space-y-5">
            {(error || mediaError) && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-3.5 rounded-xl font-medium border border-red-200">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error || mediaError}</span>
              </div>
            )}

            {/* Drawing Sheet Name Card */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-sm space-y-3">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">
                Key Plan Name *
              </label>
              <input
                ref={inputRef}
                type="text"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white placeholder-gray-400 shadow-xs"
                placeholder="e.g. 01 First Key Plan, Structural Section 2, Key Plan"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                This name appears on the key plan viewer, observation list badges, and exported PDF reports.
              </p>
            </div>

            {/* Drawing Image Selection & Replacement Card */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">
                    Key Plan Sheet
                  </label>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Select a new key plan image (JPG, PNG, WebP up to 20 MB) or PDF (up to 30 MB)
                  </p>
                </div>
                {hasNewMedia && (
                  <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200 shadow-2xs">
                    New Sheet Selected
                  </span>
                )}
              </div>

              {/* Preview and Upload Action Area */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col md:flex-row items-center gap-5">
                {/* Visual Thumbnail */}
                <div className="w-56 h-36 bg-white rounded-xl border border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center shadow-xs relative group">
                  {loadingMedia ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Spinner />
                      <span className="text-[11px] text-gray-500 font-medium">Rendering PDF...</span>
                    </div>
                  ) : preview ? (
                    <img
                      src={preview}
                      alt={name || 'Key plan'}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-300 gap-1">
                      <FileImage size={36} />
                      <span className="text-[11px] text-gray-400">No Image</span>
                    </div>
                  )}
                  {hasNewMedia && !loadingMedia && (
                    <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm">
                      NEW
                    </div>
                  )}
                </div>

                {/* Details & Controls */}
                <div className="flex-1 space-y-2 text-center md:text-left min-w-0">
                  <h4 className="text-sm font-bold text-gray-800">
                    {hasNewMedia ? 'New Key Plan Sheet Ready to Apply' : 'Current Key Plan Sheet'}
                  </h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Selecting a new key plan image or PDF updates the background sheet on this key plan while preserving all your existing pinned observations, notes, and photos.
                  </p>

                  <div className="flex items-center gap-2 pt-2 flex-wrap justify-center md:justify-start">
                    <label
                      className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all hover:opacity-95 active:scale-95"
                      style={{ background: 'var(--brand-button, #1d4ed8)' }}
                    >
                      <Upload size={14} />
                      <span>{preview ? 'Select New Image or PDF' : 'Upload Key Plan Image or PDF'}</span>
                      <input
                        type="file"
                        accept={KEY_PLAN_FILE_ACCEPT}
                        disabled={loadingMedia}
                        onChange={handleFile}
                        className="hidden"
                      />
                    </label>

                    {hasNewMedia && (
                      <button
                        type="button"
                        onClick={handleResetImage}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 hover:bg-white text-gray-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer bg-white/70"
                        title="Revert back to original image"
                      >
                        <RefreshCw size={13} />
                        <span>Revert to Original</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <PdfPageSelector
                pdfInfo={pdfInfo}
                needsPageSelection={needsPageSelection}
                loading={loadingMedia}
                onConfirmPage={confirmPdfPage}
                onOpenPicker={openPagePicker}
                onCancelPicker={cancelPageSelection}
              />
            </div>
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
          <div className="max-w-4xl mx-auto w-full flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingMedia || needsPageSelection}
              className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {saving ? <Spinner /> : <><Check size={16} /> Save Changes</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
