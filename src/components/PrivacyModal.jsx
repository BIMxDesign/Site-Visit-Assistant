import React, { useState, useEffect } from 'react'
import {
  X, Shield, Lock, Download, Trash2, CheckCircle2,
  AlertTriangle, FileText, Smartphone, Database, Check, ArrowLeft
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { exportAllUserData, deleteAllUserData } from '../db/database'

export default function PrivacyModal({ onClose }) {
  const { currentUser, logout, closePrivacyModal } = useAppStore()
  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [purging, setPurging] = useState(false)
  const [showConfirmPurge, setShowConfirmPurge] = useState(false)
  const [telemetryConsent, setTelemetryConsent] = useState(() => {
    return localStorage.getItem('sitepunch_telemetry_consent') === 'true'
  })

  const handleClose = () => {
    if (onClose) onClose()
    else closePrivacyModal()
  }

  // Accessibility: Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleDownloadPersonalData() {
    setDownloading(true)
    try {
      const dataPackage = await exportAllUserData(currentUser?.email)
      const blob = new Blob([JSON.stringify(dataPackage, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sitepunch_personal_data_gdpr_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDownloadDone(true)
      setTimeout(() => setDownloadDone(false), 3000)
    } catch (err) {
      alert('Failed to export data: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  async function handlePurgeAccount() {
    setPurging(true)
    try {
      await deleteAllUserData(currentUser?.email)
      logout()
      handleClose()
      alert('Your account, credentials, and all local project data have been permanently erased in compliance with GDPR Art. 17 and CCPA.')
      window.location.reload()
    } catch (err) {
      alert('Failed to erase data: ' + err.message)
      setPurging(false)
    }
  }

  function handleToggleTelemetry(enabled) {
    setTelemetryConsent(enabled)
    localStorage.setItem('sitepunch_telemetry_consent', enabled ? 'true' : 'false')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-full w-full overflow-hidden select-none"
    >
      {/* Full Page Header - 100% Edge-to-Edge */}
      <header
        className="sitepunch-header bg-brand-800 text-white px-4 shadow-lg flex-shrink-0"
        style={{
          background: 'var(--brand-header, #1e40af)',
          paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
          paddingBottom: '14px',
        }}
      >
        <div className="flex items-center justify-between min-h-[46px] max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleClose}
              className="p-2 -ml-2 rounded-full hover:bg-black/15 transition-colors flex items-center justify-center flex-shrink-0 text-white"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={22} className="block" />
            </button>
            <div className="flex flex-col justify-center min-w-0">
              <h1 id="privacy-modal-title" className="text-xl font-bold tracking-tight leading-tight truncate flex items-center gap-2">
                <Shield size={20} className="text-white" />
                <span>Privacy &amp; User Rights</span>
              </h1>
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">
                GDPR, CCPA/CPRA &amp; CalOPPA Compliance Information
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close Privacy Center"
            className="p-1.5 text-white/80 hover:text-white hover:bg-black/15 rounded-full transition-colors ml-2"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50 text-xs text-gray-700">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          {/* Key Privacy Highlights Card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-150">
              <Database size={17} className="text-brand-700" />
              <h3 className="text-sm font-bold text-gray-900">Local-First Data Privacy Guarantee</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">
              Site Visit Assistant is engineered with a strict <strong>Local-First Architecture</strong>. Your drawing blueprints, punch list observations, inspection photos, and site notes are stored directly on your own device using browser IndexedDB storage.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="bg-emerald-50/70 border border-emerald-150 p-3 rounded-xl flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-emerald-900 block">Stays on Your Device</span>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Key plans, photos, pins, and punch list records</p>
                </div>
              </div>
              <div className="bg-blue-50/70 border border-blue-150 p-3 rounded-xl flex items-start gap-2">
                <Lock size={16} className="text-brand-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-brand-900 block">Encrypted Online Sync</span>
                  <p className="text-[11px] text-brand-700 mt-0.5">Only account credentials (name, email, phone) &amp; payment tokens</p>
                </div>
              </div>
            </div>
          </div>

          {/* User Rights Tools (GDPR Art. 17 & 20) */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-150">
              <FileText size={17} className="text-brand-700" />
              <h3 className="text-sm font-bold text-gray-900">Your Regulatory Rights (GDPR &amp; CCPA)</h3>
            </div>

            {/* Right to Access & Portability */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-gray-900 text-xs">Right to Data Portability (GDPR Art. 20)</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Download a complete, machine-readable JSON archive of all your personal profile, projects, and observation records.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadPersonalData}
                disabled={downloading}
                className="sitepunch-btn-primary px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 flex-shrink-0"
                style={{ background: 'var(--brand-button, #1d4ed8)' }}
              >
                {downloadDone ? (
                  <>
                    <Check size={14} />
                    <span>Archive Exported!</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>{downloading ? 'Preparing...' : 'Export My Data'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Right to Erasure */}
            <div className="p-4 bg-red-50/60 rounded-xl border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-red-900 text-xs">Right to be Forgotten / Erasure (GDPR Art. 17)</h4>
                <p className="text-[11px] text-red-700 mt-0.5">
                  Permanently erase your account, login credentials, and wipe all local databases and photos from this device.
                </p>
              </div>
              {!showConfirmPurge ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmPurge(true)}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  <Trash2 size={14} />
                  <span>Erase All Data</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowConfirmPurge(false)}
                    className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={purging}
                    onClick={handlePurgeAccount}
                    className="px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold shadow-xs"
                  >
                    {purging ? 'Purging...' : 'Confirm Permanent Erasure'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Privacy Consent Controls */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Consent Preferences</h3>
            <div className="divide-y divide-gray-150 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-gray-900 block">Strictly Necessary Storage (IndexedDB)</span>
                  <span className="text-[11px] text-gray-500">Required for offline app operation, punch list item persistence, and license verification.</span>
                </div>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 font-bold rounded-md text-[10px]">
                  Always Active
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-gray-900 block">Anonymous Diagnostic Telemetry</span>
                  <span className="text-[11px] text-gray-500">Allows crash reporting and performance metrics to improve mobile drawing speed.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={telemetryConsent}
                    onChange={e => handleToggleTelemetry(e.target.checked)}
                    className="sr-only peer"
                    aria-label="Toggle Anonymous Diagnostic Telemetry"
                  />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Docked Full-Width Bottom Action Bar */}
      <div
        className="flex-shrink-0 bg-white border-t border-gray-200 p-4 shadow-xl z-20"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-4xl mx-auto w-full flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            style={{ background: 'var(--brand-button, #1d4ed8)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
