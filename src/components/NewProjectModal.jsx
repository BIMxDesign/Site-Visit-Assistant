import React, { useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '../store/useAppStore'
import { saveProject, getAllProjects } from '../db/database'

const STATUS_OPTIONS = ['Active', 'Closed']

export default function NewProjectModal() {
  const { closeNewProject, navigateToProject } = useAppStore()
  const [form, setForm] = useState({
    name: '', number: '', address: '', client: '',
    contractor: '', description: '', status: 'Active'
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) { setError('Project name is required.'); return }

    const trimmedNum = form.number ? form.number.trim() : ''
    if (trimmedNum) {
      setSaving(true)
      const allProjects = await getAllProjects()
      const isDuplicate = allProjects.some(
        p => p.number && p.number.trim().toLowerCase() === trimmedNum.toLowerCase()
      )
      if (isDuplicate) {
        setError(`Project number "${trimmedNum}" is already in use by another project. Please enter a unique project number.`)
        setSaving(false)
        return
      }
    }

    setSaving(true)
    const uuid = uuidv4()
    const now = Date.now()
    await saveProject({ uuid, ...form, createdAt: now, updatedAt: now, totalItems: 0, openItems: 0 })
    closeNewProject()
    navigateToProject(uuid)
  }

  return (
    <ModalOverlay onClose={closeNewProject}>
      <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
        <ModalHeader
          title="New Project"
          subtitle="Create a new construction punch list and inspection project"
          onClose={closeNewProject}
        />
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50"
          style={{
            paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto w-full space-y-4">
            {error && (
              <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                {error}
              </p>
            )}

            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200 shadow-sm space-y-4">
              <Field label="Project Name" required>
                <input className={INPUT} placeholder="e.g. Building A Inspection" value={form.name} onChange={e => set('name', e.target.value)} />
              </Field>
              <Field label="Project Number">
                <input className={INPUT} placeholder="e.g. PRJ-2024-001" value={form.number} onChange={e => set('number', e.target.value)} />
              </Field>
              <Field label="Site Address">
                <input className={INPUT} placeholder="123 Main St, City, State" value={form.address} onChange={e => set('address', e.target.value)} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Client Name">
                  <input className={INPUT} placeholder="Client" value={form.client} onChange={e => set('client', e.target.value)} />
                </Field>
                <Field label="Contractor">
                  <input className={INPUT} placeholder="GC / Sub" value={form.contractor} onChange={e => set('contractor', e.target.value)} />
                </Field>
              </div>
              <Field label="Status">
                <select className={INPUT} value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Description / Scope">
                <textarea className={`${INPUT} resize-none`} rows={3} placeholder="Brief description of the inspection scope..." value={form.description} onChange={e => set('description', e.target.value)} />
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
              onClick={closeNewProject}
              className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition-colors min-h-[40px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-md min-h-[40px]"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {saving ? <Spinner /> : 'Create Project & Continue'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

export function ModalOverlay({ children }) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-full w-full overflow-hidden select-none">
      <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({ title, subtitle, onClose, rightAction, showCloseButton = true }) {
  return (
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
            className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col justify-center min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightAction}
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-black/15 rounded-full transition-colors ml-2 min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
export function Field({ label, children, required }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
        {label}{required && <span className="text-red-500 ml-1 font-bold">*</span>}
      </label>
      {children}
    </div>
  )
}
export const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-gray-50 placeholder-gray-400'
export function Spinner() {
  return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
}
