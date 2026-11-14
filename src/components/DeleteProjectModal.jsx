import React, { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Download, Trash2, X } from 'lucide-react'
import { downloadProjectBackup } from '../db/database'

/**
 * Safeguarded project deletion dialog:
 * - Warns users to export a JSON backup before deleting (permanent loss otherwise)
 * - Offers a direct one-click JSON backup download inside the dialog
 * - Requires typing the exact project name before deletion is enabled
 */
export default function DeleteProjectModal({ project, onClose, onConfirmDelete }) {
  const [typedName, setTypedName] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportedBackup, setExportedBackup] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTypedName('')
    setExportedBackup(false)
    setError('')
  }, [project?.uuid])

  if (!project) return null

  const expectedName = (project.name || '').trim()
  const isNameMatch = expectedName ? typedName.trim() === expectedName : true
  const isLicensed = Boolean(project.isLicensed || project.licenseKey)

  async function handleExportBackup() {
    setExporting(true)
    setError('')
    try {
      await downloadProjectBackup(project)
      setExportedBackup(true)
    } catch (err) {
      console.error('Failed to export JSON backup:', err)
      setError('Failed to export JSON backup. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  async function handleConfirm(e) {
    if (e) e.preventDefault()
    if (!isNameMatch || deleting) return
    setDeleting(true)
    setError('')
    try {
      await onConfirmDelete(project)
    } catch (err) {
      console.error('Failed to delete project:', err)
      setError('Failed to delete project. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget && !deleting) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
    >
      <form
        onSubmit={handleConfirm}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <h3 id="delete-project-title" className="text-base font-bold text-gray-900">
                Delete Project Permanently
              </h3>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {project.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Explicit Recovery Warning + Direct JSON Backup Export */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 space-y-2.5">
            <p className="text-xs font-bold text-red-900 leading-snug">
              Export a JSON backup before deleting or you will not be able to recover it.
            </p>
            <p className="text-[11px] text-red-800 leading-relaxed">
              Deleting permanently removes this project along with all site visits, key plans, observations, and photos from this device.
              {isLicensed && ' This project also has an active license — exporting a JSON backup is the only way to restore the project and its license later.'}
            </p>

            <button
              type="button"
              onClick={handleExportBackup}
              disabled={exporting || deleting}
              className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                exportedBackup
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-white border-red-300 text-red-700 hover:bg-red-100/70'
              }`}
            >
              {exporting ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : exportedBackup ? (
                <CheckCircle2 size={14} className="text-emerald-600" />
              ) : (
                <Download size={14} />
              )}
              <span>{exportedBackup ? 'JSON Backup Exported' : 'Export JSON Backup Before Deleting'}</span>
            </button>
          </div>

          {/* Exact Name Confirmation Input */}
          <div className="space-y-1.5">
            <label htmlFor="confirm-delete-project-name" className="block text-xs font-semibold text-gray-700">
              Type <span className="font-bold text-gray-900 select-all bg-gray-100 px-1.5 py-0.5 rounded">{expectedName || 'DELETE'}</span> to confirm deletion:
            </label>
            <input
              id="confirm-delete-project-name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={expectedName || 'Enter project name'}
              autoComplete="off"
              autoFocus
              disabled={deleting}
              className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
            />
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-medium">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isNameMatch || deleting}
            className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {deleting ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            <span>{deleting ? 'Deleting...' : 'Delete Project'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
