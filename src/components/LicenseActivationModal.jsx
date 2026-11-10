import React, { useState } from 'react'
import { Key, CheckCircle2, AlertCircle, ExternalLink, X, ArrowLeft } from 'lucide-react'
import { activateProjectLicense, getWordPressUrl } from '../services/licenseService'
import { ModalOverlay, ModalHeader, Spinner } from './NewProjectModal'

export default function LicenseActivationModal({ project, onSuccess, onClose }) {
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  const prjName = project?.name || 'Site Project'

  async function handleActivate(e) {
    e?.preventDefault()
    if (!licenseKey.trim()) {
      setError('Please enter your license key.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const record = await activateProjectLicense(project?.uuid, licenseKey.trim(), prjName)
      setSuccess(record)
      setTimeout(() => {
        onSuccess?.(record)
        onClose?.()
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to activate license. Please verify your key.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
        <ModalHeader
          title="Activate Project License"
          subtitle={`Unlock unlimited report exports for "${prjName}"`}
          onClose={onClose}
          showCloseButton={false}
        />

        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50 flex items-center justify-center"
          style={{
            paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
            paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="max-w-lg mx-auto w-full space-y-4">
            {success ? (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-emerald-200 shadow-md text-center space-y-4 animate-fade-in">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Project License Activated!</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Unlimited PDF &amp; CSV report exports are now permanently unlocked for <strong>{prjName}</strong>.
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs font-mono font-bold text-emerald-800">
                  Key: {success.licenseKey}
                </div>
                <p className="text-[11px] text-gray-400">
                  This license is saved on-device and will be preserved if you export/import this project to another device.
                </p>
              </div>
            ) : (
              <form onSubmit={handleActivate} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-5">
                {/* Project Badge */}
                <div className="flex items-center justify-between p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider block">Project</span>
                    <p className="text-sm font-bold text-gray-900 truncate">{prjName}</p>
                  </div>
                  <a
                    href={getWordPressUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-white hover:bg-brand-50 text-brand-700 hover:text-brand-800 border border-blue-200 text-xs font-bold rounded-lg whitespace-nowrap shadow-2xs flex items-center gap-1.5 transition-colors flex-shrink-0"
                    title="Get a license key from the store"
                  >
                    <span>Get License Key</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                {error && (
                  <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2 font-medium">
                    <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                  </div>
                )}

                {/* Key Input */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                    <span>Enter License Key <span className="text-red-500">*</span></span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-3 text-sm text-gray-900 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white placeholder-gray-400 uppercase"
                      placeholder="e.g. SP-XXXX-XXXX-XXXX"
                      value={licenseKey}
                      onChange={e => {
                        setError('')
                        setLicenseKey(e.target.value.toUpperCase())
                      }}
                      autoFocus
                      required
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-normal">
                    Enter the license key received upon checkout.
                  </p>
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !licenseKey.trim()}
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Spinner />
                        <span>Verifying with Store…</span>
                      </>
                    ) : (
                      <>
                        <Key size={14} />
                        <span>Activate Project</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
