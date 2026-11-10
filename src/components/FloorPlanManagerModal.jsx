import React, { useState, useEffect } from 'react'
import { X, Image as ImageIcon, Trash2, Check, ArrowLeft } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { saveFloorPlan, savePhase, getPhases, ensureProjectPhases } from '../db/database'
import { Spinner } from './NewProjectModal'

export default function FloorPlanManagerModal({ projectUuid, defaultPhaseUuid, onClose, onSaved }) {
  const [name,       setName]       = useState('')
  const [preview,    setPreview]    = useState(null) // base64
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [saved,      setSaved]      = useState(false)
  const [phases,     setPhases]     = useState([])
  const [phaseUuid,  setPhaseUuid]  = useState(defaultPhaseUuid || '')

  useEffect(() => {
    async function loadPhases() {
      if (!projectUuid) return
      const list = await ensureProjectPhases(projectUuid)
      setPhases(list)
      if (defaultPhaseUuid && list.some(p => p.uuid === defaultPhaseUuid)) {
        setPhaseUuid(defaultPhaseUuid)
      } else if (list.length > 0 && !phaseUuid) {
        setPhaseUuid(list[0].uuid)
      }
    }
    loadPhases()
  }, [projectUuid, defaultPhaseUuid])

  const activeReport = phases.find(p => p.uuid === (phaseUuid || defaultPhaseUuid)) || phases[0]
  const targetReportName = activeReport?.name || ''

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select a JPG or PNG image file.'); return }
    if (file.size > 20 * 1024 * 1024)   { setError('Image must be under 20 MB.'); return }
    setError('')
    const dataUrl = await readFile(file)
    setPreview(dataUrl)
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''))
  }

  async function handleSave() {
    if (!preview)      { setError('Please select a key plan image.'); return }
    if (!name.trim())  { setError('Please enter a key plan name.'); return }
    setSaving(true)
    let effectivePhaseUuid = phaseUuid || defaultPhaseUuid || (phases[0]?.uuid) || null
    if (!effectivePhaseUuid && projectUuid) {
      const newPhaseUuid = uuidv4()
      await savePhase({
        uuid: newPhaseUuid,
        projectUuid,
        name: 'Report 1 - Initial Observation',
        order: 1,
        createdAt: Date.now(),
      })
      effectivePhaseUuid = newPhaseUuid
    }
    await saveFloorPlan({
      uuid: uuidv4(),
      projectUuid,
      phaseUuid: effectivePhaseUuid,
      name: name.trim(),
      imageData: preview,
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => { onSaved?.(); onClose() }, 600)
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
              className="p-2 -ml-2 rounded-full hover:bg-black/15 transition-colors flex items-center justify-center flex-shrink-0 text-white min-w-[40px] min-h-[40px]"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={22} className="block" />
            </button>
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl font-bold tracking-tight leading-tight truncate">Add Key Plan</h1>
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5 font-medium">
                {targetReportName || 'Upload a plan image or PDF sheet to pin observations'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-black/15 rounded-full transition-colors ml-2 flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50"
        style={{
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto w-full space-y-5">
          {error && (
            <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl font-medium border border-red-100">
              {error}
            </p>
          )}

          {/* Upload zone */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">
              Key Plan Image File *
            </label>
            <label className={`block border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              preview ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
            }`}>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
              {preview ? (
                <div className="relative p-3">
                  <img src={preview} alt="Key plan preview" className="w-full max-h-80 object-contain rounded-xl" />
                  <div className="absolute top-5 right-5 bg-brand-600 text-white p-1.5 rounded-full shadow-md"><Check size={16}/></div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <ImageIcon size={32} className="text-gray-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-700">Tap to select key plan</p>
                    <p className="text-xs text-gray-400 mt-1">JPG or PNG · Max 20 MB</p>
                  </div>
                </div>
              )}
            </label>

            {/* Floor plan name */}
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1 block">
                Key Plan Name *
              </label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white placeholder-gray-400 shadow-xs font-medium"
                placeholder="e.g. Level 1, Building A - 2nd Floor"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
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
            className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
            style={{ background: 'var(--brand-button, #1d4ed8)' }}
          >
            {saved   ? <><Check size={16}/> Saved!</> :
             saving  ? <Spinner /> :
             <span>Add Key Plan</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

function readFile(file) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = e => resolve(e.target.result)
    r.readAsDataURL(file)
  })
}
