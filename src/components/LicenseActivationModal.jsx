import React, { useState } from 'react'
import {
  Key, CheckCircle2, AlertCircle, ExternalLink, X, ArrowLeft,
  Settings, Globe, Eye, EyeOff, Check, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  activateProjectLicense,
  getWordPressUrl,
  setWordPressUrl,
  getLmfwcConsumerKey,
  getLmfwcConsumerSecret,
  setLmfwcCredentials,
  testWordPressConnection
} from '../services/licenseService'
import { ModalOverlay, ModalHeader, Spinner } from './NewProjectModal'

export default function LicenseActivationModal({ project, onSuccess, onClose }) {
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  // Inline Store Connection Editor
  const [showStoreConfig, setShowStoreConfig] = useState(false)
  const [modalWpUrl, setModalWpUrl] = useState(() => getWordPressUrl())
  const [modalConsumerKey, setModalConsumerKey] = useState(() => getLmfwcConsumerKey())
  const [modalConsumerSecret, setModalConsumerSecret] = useState(() => getLmfwcConsumerSecret())
  const [showSecret, setShowSecret] = useState(false)
  const [testingConn, setTestingConn] = useState(false)
  const [connTestResult, setConnTestResult] = useState(null)
  const [savedKeysMsg, setSavedKeysMsg] = useState(false)

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
      // If authorization failed, automatically suggest opening the store configuration
      if (err.message && (err.message.includes('authorization failed') || err.message.includes('401') || err.message.includes('403'))) {
        setShowStoreConfig(true)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleTestStoreConn() {
    setTestingConn(true)
    setConnTestResult(null)
    try {
      const res = await testWordPressConnection(modalWpUrl, modalConsumerKey, modalConsumerSecret)
      setConnTestResult(res)
    } catch (err) {
      setConnTestResult({
        success: false,
        message: err.message || 'Connection test failed.',
      })
    } finally {
      setTestingConn(false)
    }
  }

  function handleSaveStoreKeys() {
    setWordPressUrl(modalWpUrl)
    setLmfwcCredentials(modalConsumerKey, modalConsumerSecret)
    setSavedKeysMsg(true)
    setTimeout(() => setSavedKeysMsg(false), 2500)
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
              <form onSubmit={handleActivate} className="bg-white rounded-2xl p-5 sm:p-7 border border-gray-200 shadow-sm space-y-5">
                {/* Project Badge & Store Settings Button */}
                <div className="flex items-center justify-between p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl gap-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider block">Project</span>
                    <p className="text-sm font-bold text-gray-900 truncate">{prjName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStoreConfig(!showStoreConfig)}
                      className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Configure WordPress Store URL & API Keys"
                    >
                      <Settings size={13} className="text-gray-500" />
                      <span>{showStoreConfig ? 'Hide Store Keys' : 'Store Keys'}</span>
                      {showStoreConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <a
                      href={getWordPressUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-white hover:bg-brand-50 text-brand-700 hover:text-brand-800 border border-blue-200 text-xs font-bold rounded-lg whitespace-nowrap shadow-2xs flex items-center gap-1.5 transition-colors"
                      title="Get a license key from the store"
                    >
                      <span>Get Key</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                {/* Inline Store Configuration Drawer */}
                {showStoreConfig && (
                  <div className="bg-gray-50 border border-amber-200 rounded-xl p-4 space-y-3 animate-fade-in text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                      <div className="flex items-center gap-1.5 font-bold text-gray-800">
                        <Globe size={14} className="text-brand-600" />
                        <span>WordPress Store Connection</span>
                      </div>
                      <span className="text-[10px] text-gray-500">WooCommerce REST API</span>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">Store Address (URL)</label>
                      <input
                        type="url"
                        className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={modalWpUrl}
                        onChange={e => setModalWpUrl(e.target.value)}
                        placeholder="https://www.bimxdesign.com"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                        WooCommerce Consumer Key (<span className="font-mono text-gray-500">ck_...</span>)
                      </label>
                      <input
                        type="text"
                        className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={modalConsumerKey}
                        onChange={e => setModalConsumerKey(e.target.value)}
                        placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                        WooCommerce Consumer Secret (<span className="font-mono text-gray-500">cs_...</span>)
                      </label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                          value={modalConsumerSecret}
                          onChange={e => setModalConsumerSecret(e.target.value)}
                          placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                        >
                          {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>

                    {connTestResult && (
                      <div
                        className={`p-2.5 rounded-lg border text-xs whitespace-pre-line leading-relaxed ${
                          connTestResult.success
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        {connTestResult.message}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={handleTestStoreConn}
                        disabled={testingConn}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {testingConn ? <Spinner /> : <RefreshCw size={12} />}
                        <span>Test Connection</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveStoreKeys}
                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        style={{ background: 'var(--brand-button, #a40e26)' }}
                      >
                        {savedKeysMsg ? <Check size={12} /> : null}
                        <span>{savedKeysMsg ? 'Keys Saved!' : 'Save Keys'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2.5 font-medium leading-relaxed">
                    <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="flex-1 whitespace-pre-line">{error}</span>
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
                    Enter the license key received upon checkout, or use an offline key (e.g. <code className="font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded">OFFLINE-KEY</code>) if working on-site without internet.
                  </p>
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
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
