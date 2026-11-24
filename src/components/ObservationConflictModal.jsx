import React, { useState } from 'react'
import {
  AlertTriangle, Check, Copy, ArrowRight, Clock, MapPin,
  ClipboardList, CheckCircle2, RefreshCw, Layers, ShieldCheck, X, Eye
} from 'lucide-react'
import { stripHtmlToPlainText } from '../utils/formatters'

function formatTimestamp(ts) {
  if (!ts) return 'Unknown date'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) + ' at ' + d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function ObservationConflictModal({
  conflictReport,
  onApplyDecisions,
  onCancel,
  loading = false
}) {
  if (!conflictReport || !conflictReport.conflictingItems) return null

  const {
    targetProject,
    incomingProject,
    conflictingItems = [],
    newItemsCount = 0,
    matchingReportsCount = 0,
    matchingPlansCount = 0
  } = conflictReport

  // Initial decisions: default to 'newer' (whichever is newer by timestamp)
  const [decisions, setDecisions] = useState(() => {
    const initial = {}
    for (const item of conflictingItems) {
      initial[item.id] = item.isIncomingNewer ? 'incoming' : 'existing'
    }
    return initial
  })

  // Bulk actions
  function handleSelectAll(choice) {
    const updated = {}
    for (const item of conflictingItems) {
      if (choice === 'newer') {
        updated[item.id] = item.isIncomingNewer ? 'incoming' : 'existing'
      } else {
        updated[item.id] = choice // 'existing' | 'incoming' | 'both'
      }
    }
    setDecisions(updated)
  }

  function handleSetDecision(itemId, choice) {
    setDecisions(prev => ({
      ...prev,
      [itemId]: choice
    }))
  }

  function handleSave() {
    onApplyDecisions(decisions)
  }

  const existingCount = Object.values(decisions).filter(d => d === 'existing').length
  const incomingCount = Object.values(decisions).filter(d => d === 'incoming').length
  const bothCount = Object.values(decisions).filter(d => d === 'both').length

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden slide-up">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 via-brand-700 to-brand-800 text-white flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded-lg bg-white/20 text-white shadow-xs">
                <AlertTriangle size={16} />
              </span>
              <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                Compare Duplicate Observations &amp; Key Pins
              </h3>
            </div>
            <p className="text-xs text-white/90 leading-snug max-w-2xl">
              Found <strong className="underline font-bold">{conflictingItems.length} duplicate observation(s)</strong> between local project <strong>"{targetProject?.name}"</strong> and the incoming backup. Compare differences side-by-side and choose which version to keep for 100% zero data loss.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition-colors"
            title="Cancel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Bulk Action Toolbar */}
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap flex-shrink-0 text-xs">
          <span className="font-bold text-gray-700 text-[11px] uppercase tracking-wider">
            Quick Decisions:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleSelectAll('newer')}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[11px] shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              title="Automatically choose the most recently updated version for every item"
            >
              <span>⚡ Keep All Newer</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('existing')}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold text-[11px] shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Keep all current observations on this device"
            >
              <span>📱 Keep All On Device</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('incoming')}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 font-bold text-[11px] shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Overwrite with incoming imported observations"
            >
              <span>📥 Use All Incoming</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('both')}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 font-bold text-[11px] shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="Keep existing item and add incoming as a new separate pin (Zero Overwrite)"
            >
              <span>➕ Keep Both (Duplicate)</span>
            </button>
          </div>
        </div>

        {/* Scrollable Conflicting Items List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 bg-gray-50/50">
          {conflictingItems.map((item, idx) => {
            const decision = decisions[item.id] || (item.isIncomingNewer ? 'incoming' : 'existing')
            const existingDateStr = formatTimestamp(item.existing?.updatedAt || item.existing?.createdAt)
            const incomingDateStr = formatTimestamp(item.incoming?.updatedAt || item.incoming?.createdAt)
            const existingNotes = stripHtmlToPlainText(item.existing?.description || '')
            const incomingNotes = stripHtmlToPlainText(item.incoming?.description || '')

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md"
              >
                {/* Observation Meta & Decision Selector Bar */}
                <div className="px-3.5 py-2.5 bg-gray-100/90 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-full bg-brand-700 text-white font-black text-xs shadow-2xs">
                      #{item.pinNumber || idx + 1}
                    </span>
                    <span className="font-bold text-gray-800 text-xs truncate max-w-[200px] sm:max-w-xs" title={item.planName}>
                      📍 {item.planName || 'Key Plan'}
                    </span>
                    <span className="text-[11px] text-gray-500 truncate" title={item.phaseName}>
                      • 📋 {item.phaseName || 'Site Visit'}
                    </span>
                  </div>

                  {/* Decision Selector Buttons */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleSetDecision(item.id, 'existing')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        decision === 'existing'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Keep On Device
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDecision(item.id, 'incoming')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        decision === 'incoming'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Use Incoming
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDecision(item.id, 'both')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        decision === 'both'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Keep Both
                    </button>
                  </div>
                </div>

                {/* Side-by-Side Comparison Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                  {/* Column 1: On This Device (Local) */}
                  <div className={`p-3.5 space-y-2.5 transition-colors ${
                    decision === 'existing' || decision === 'both' ? 'bg-emerald-50/20' : 'bg-gray-50/40 opacity-70'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                        📱 On This Device (Local)
                      </span>
                      {!item.isIncomingNewer ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={11} /> Most Current
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">Older</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="font-bold text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200">
                        Status: <strong className={item.existing?.status === 'Closed' ? 'text-emerald-700' : 'text-rose-700'}>{item.existing?.status || 'Open'}</strong>
                      </span>
                      <span className="font-bold text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200">
                        Priority: {item.existing?.priority || 'Low'}
                      </span>
                      {item.existing?.trade && (
                        <span className="font-bold text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200">
                          {item.existing.trade}
                        </span>
                      )}
                    </div>

                    {/* Notes comparison */}
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 text-xs text-gray-800 max-h-24 overflow-y-auto leading-relaxed">
                      <p className="font-semibold text-[10px] text-gray-400 uppercase mb-0.5">Notes:</p>
                      {existingNotes || <em className="text-gray-400">No notes recorded</em>}
                    </div>

                    {/* Photos thumbnails */}
                    {item.existingPhotos && item.existingPhotos.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-gray-500">
                          {item.existingPhotos.length} Photo(s):
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                          {item.existingPhotos.map((ph, pIdx) => {
                            const src = ph.imageData || ph.dataUrl
                            if (!src) return null
                            return (
                              <img
                                key={ph.uuid || pIdx}
                                src={src}
                                alt="Photo"
                                className="w-12 h-12 rounded-lg object-cover border border-gray-200 shadow-2xs flex-shrink-0"
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-[10px] text-gray-400 pt-1">
                      <Clock size={11} />
                      <span>{existingDateStr}</span>
                    </div>
                  </div>

                  {/* Column 2: Incoming (Imported Backup) */}
                  <div className={`p-3.5 space-y-2.5 transition-colors ${
                    decision === 'incoming' || decision === 'both' ? 'bg-blue-50/20' : 'bg-gray-50/40 opacity-70'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
                        📥 Incoming Backup (Imported)
                      </span>
                      {item.isIncomingNewer ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-900">
                          <CheckCircle2 size={11} /> Most Current
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">Older</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="font-bold text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200">
                        Status: <strong className={item.incoming?.status === 'Closed' ? 'text-emerald-700' : 'text-rose-700'}>{item.incoming?.status || 'Open'}</strong>
                      </span>
                      <span className="font-bold text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200">
                        Priority: {item.incoming?.priority || 'Low'}
                      </span>
                      {item.incoming?.trade && (
                        <span className="font-bold text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200">
                          {item.incoming.trade}
                        </span>
                      )}
                    </div>

                    {/* Notes comparison */}
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 text-xs text-gray-800 max-h-24 overflow-y-auto leading-relaxed">
                      <p className="font-semibold text-[10px] text-gray-400 uppercase mb-0.5">Notes:</p>
                      {incomingNotes || <em className="text-gray-400">No notes recorded</em>}
                    </div>

                    {/* Photos thumbnails */}
                    {item.incomingPhotos && item.incomingPhotos.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-gray-500">
                          {item.incomingPhotos.length} Photo(s):
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                          {item.incomingPhotos.map((ph, pIdx) => {
                            const src = ph.imageData || ph.dataUrl
                            if (!src) return null
                            return (
                              <img
                                key={ph.uuid || pIdx}
                                src={src}
                                alt="Photo"
                                className="w-12 h-12 rounded-lg object-cover border border-gray-200 shadow-2xs flex-shrink-0"
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-[10px] text-gray-400 pt-1">
                      <Clock size={11} />
                      <span>{incomingDateStr}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
          <div className="text-xs text-gray-600">
            <span>Summary: </span>
            <strong className="text-emerald-700">{existingCount} Keep Device</strong> •{' '}
            <strong className="text-blue-700">{incomingCount} Use Incoming</strong> •{' '}
            <strong className="text-purple-700">{bothCount} Keep Both</strong>
            {newItemsCount > 0 && (
              <span className="text-gray-500"> (+{newItemsCount} brand new pins will be added)</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 active:scale-95 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Check size={16} />
              <span>Apply Decisions &amp; Complete Merge</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
