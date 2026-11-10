import React, { useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { saveProject, getAllProjects } from '../db/database'
import { ModalOverlay, ModalHeader, Field, INPUT, Spinner } from './NewProjectModal'
import { isProjectNameLocked } from '../services/licenseService'

const STATUS_OPTIONS = ['Active', 'Closed']

export default function EditProjectModal({ project, onClose, onSaved }) {
  const initialStatus = project?.status === 'In Review' ? 'Active' : (project?.status || 'Active')
  const [form, setForm] = useState({
    name:           project?.name           || '',
    number:         project?.number         || '',
    address:        project?.address        || '',
    client:         project?.client         || '',
    contractor:     project?.contractor     || '',
    description:    project?.description    || '',
    status:         initialStatus,
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')

  // 2-year lock rule: project name is greyed out / uneditable after 2 years
  const nameLockInfo = isProjectNameLocked(project)
  const isNameLocked = nameLockInfo.locked

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    const finalName = isNameLocked ? (project?.name || form.name.trim()) : form.name.trim()
    if (!finalName) {
      setError('Project name is required.')
      return
    }

    const trimmedNum = form.number ? form.number.trim() : ''
    if (trimmedNum) {
      setSaving(true)
      const allProjects = await getAllProjects()
      const isDuplicate = allProjects.some(
        p => p.uuid !== project?.uuid && p.number && p.number.trim().toLowerCase() === trimmedNum.toLowerCase()
      )
      if (isDuplicate) {
        setError(`Project number "${trimmedNum}" is already in use by another project. Please enter a unique project number.`)
        setSaving(false)
        return
      }
    }

    setSaving(true)
    setError('')
    const updated = {
      ...project,
      ...form,
      name: finalName,
      createdAt: project?.createdAt || Date.now(),
    }
    await saveProject(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => {
      onSaved?.(updated)
      onClose()
    }, 400)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
        <ModalHeader
          title="Edit Project Details"
          subtitle="Update project identification, address, and status"
          onClose={onClose}
        />
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50"
          style={{
            paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto w-full space-y-5">
            {error && (
              <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                {error}
              </p>
            )}

            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-sm space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Project Name <span className="text-red-500 ml-0.5 font-bold">*</span>
                </label>
                <input
                  className={`${INPUT} ${
                    isNameLocked
                      ? '!bg-gray-100 !text-gray-400 !border-gray-200 cursor-not-allowed select-none shadow-none focus:ring-0 focus:border-gray-200'
                      : ''
                  }`}
                  placeholder="e.g. Building A Inspection"
                  value={form.name}
                  disabled={isNameLocked}
                  readOnly={isNameLocked}
                  onChange={e => !isNameLocked && set('name', e.target.value)}
                />
                {isNameLocked && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <Lock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <span>{nameLockInfo.reason}</span>
                  </div>
                )}
              </div>

              <Field label="Project Number">
                <input
                  className={INPUT}
                  placeholder="e.g. PRJ-2024-001"
                  value={form.number}
                  onChange={e => set('number', e.target.value)}
                />
              </Field>

              <Field label="Site Address">
                <input
                  className={INPUT}
                  placeholder="123 Main St, City, State"
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Client Name">
                  <input
                    className={INPUT}
                    placeholder="Client"
                    value={form.client}
                    onChange={e => set('client', e.target.value)}
                  />
                </Field>
                <Field label="Contractor">
                  <input
                    className={INPUT}
                    placeholder="GC / Sub"
                    value={form.contractor}
                    onChange={e => set('contractor', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Status">
                <select
                  className={INPUT}
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>

              <Field label="Description / Scope">
                <textarea
                  className={`${INPUT} resize-none`}
                  rows={3}
                  placeholder="Brief description of the inspection scope..."
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                />
              </Field>
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
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {saved ? (
                <>
                  <Check size={16} />
                  <span>Saved!</span>
                </>
              ) : saving ? (
                <Spinner />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
