import React, { useState, useEffect } from 'react'
import { ShieldCheck, X, ExternalLink } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function ConsentBanner() {
  const { openPrivacyModal } = useAppStore()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const hasConsented = localStorage.getItem('sitepunch_privacy_consent_v1')
    if (!hasConsented) {
      // Show consent banner after a short delay on first visit
      const timer = setTimeout(() => setVisible(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem('sitepunch_privacy_consent_v1', 'accepted')
    setVisible(false)
  }

  function handleDismiss() {
    localStorage.setItem('sitepunch_privacy_consent_v1', 'dismissed')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Privacy & Local Storage Consent"
      className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-lg z-40 bg-white/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xl border border-gray-200 text-xs animate-slideUp select-none"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldCheck size={20} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-900 text-sm">Privacy &amp; Local Storage</h4>
            <button
              onClick={handleDismiss}
              aria-label="Close consent banner"
              className="p-1 -mr-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-gray-600 leading-relaxed text-[11px]">
            We follow strict data privacy standards (GDPR &amp; CCPA). Your blueprints, drawings, photos, and punch observations stay strictly private on your device (IndexedDB).
          </p>
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <button
              type="button"
              onClick={handleAccept}
              className="sitepunch-btn-primary px-3.5 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              Accept &amp; Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setVisible(false)
                openPrivacyModal()
              }}
              className="px-3 py-1.5 text-brand-700 hover:bg-brand-50 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1"
            >
              <span>Manage Rights &amp; Policy</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
