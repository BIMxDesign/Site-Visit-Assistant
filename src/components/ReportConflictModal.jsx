import React from 'react'
import {
  AlertTriangle, RefreshCw, Copy, X, Clock, Calendar, ShieldCheck,
  Layers, CheckCircle2, ArrowRight, Sparkles, GitMerge
} from 'lucide-react'

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

export default function ReportConflictModal({
  conflictData,
  onMerge,
  onOverwrite,
  onDuplicate,
  onClose,
  loading = false
}) {
  if (!conflictData) return null

  const {
    existingProject,
    existingPhase,
    incomingPhase,
    existingUpdatedAt,
    incomingUpdatedAt,
    isIncomingNewer,
    existingPlanCount = 0,
    existingItemCount = 0,
    incomingPlanCount = 0,
    incomingItemCount = 0
  } = conflictData

  const existingDateStr = formatTimestamp(existingUpdatedAt)
  const incomingDateStr = formatTimestamp(incomingUpdatedAt)

  return (
    <div className="fixed inset-0 z-[75] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[92vh] overflow-y-auto slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-150">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Site Visit Report Already Exists</h3>
              <p className="text-xs text-gray-500">
                In project: <span className="font-semibold text-gray-800">"{existingProject.name}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
            title="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          A report named <strong className="text-gray-900 font-bold">"{incomingPhase.name}"</strong> already exists in this project. Review the timestamps below to choose how to proceed:
        </p>

        {/* Side-by-Side Version Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Existing on Device */}
          <div className={`p-3 rounded-xl border transition-all ${
            !isIncomingNewer ? 'border-emerald-300 bg-emerald-50/50 shadow-2xs' : 'border-gray-200 bg-gray-50/70'
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                On This Device
              </span>
              {!isIncomingNewer ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-900">
                  <CheckCircle2 size={11} /> Most Current
                </span>
              ) : (
                <span className="text-[10px] font-medium text-gray-400">Older Version</span>
              )}
            </div>
            <p className="font-bold text-gray-900 text-xs truncate" title={existingPhase.name}>
              {existingPhase.name}
            </p>
            <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1">
              <Clock size={12} className="flex-shrink-0" />
              <span className="truncate">{existingDateStr}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200/70 text-[11px] text-gray-600 flex items-center gap-2">
              <span><strong>{existingPlanCount}</strong> Key Plans</span>
              <span>•</span>
              <span><strong>{existingItemCount}</strong> Observations</span>
            </div>
          </div>

          {/* Card 2: Incoming Backup */}
          <div className={`p-3 rounded-xl border transition-all ${
            isIncomingNewer ? 'border-emerald-300 bg-emerald-50/50 shadow-2xs' : 'border-gray-200 bg-gray-50/70'
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Incoming Backup
              </span>
              {isIncomingNewer ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-900">
                  <CheckCircle2 size={11} /> Most Current
                </span>
              ) : (
                <span className="text-[10px] font-medium text-gray-400">Older Version</span>
              )}
            </div>
            <p className="font-bold text-gray-900 text-xs truncate" title={incomingPhase.name}>
              {incomingPhase.name}
            </p>
            <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1">
              <Clock size={12} className="flex-shrink-0" />
              <span className="truncate">{incomingDateStr}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200/70 text-[11px] text-gray-600 flex items-center gap-2">
              <span><strong>{incomingPlanCount}</strong> Key Plans</span>
              <span>•</span>
              <span><strong>{incomingItemCount}</strong> Observations</span>
            </div>
          </div>
        </div>

        {/* Informative Guidance */}
        <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-[11px] flex items-center gap-2">
          <ShieldCheck size={16} className="text-blue-700 flex-shrink-0" />
          <span>
            {isIncomingNewer
              ? 'The incoming backup is newer than what is currently on this device.'
              : 'The version on this device was updated more recently than the backup file.'}
            {' '}Active project license is preserved automatically.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 text-xs pt-1">
          {/* Option: Merge & Compare Observations */}
          {onMerge && (
            <button
              type="button"
              onClick={onMerge}
              disabled={loading}
              className="w-full text-left p-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/70 hover:bg-emerald-50 hover:border-emerald-400 transition-all flex items-start gap-3 group cursor-pointer shadow-2xs"
            >
              <div className="p-2 bg-emerald-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
                <GitMerge size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-emerald-950 text-xs">
                    Merge &amp; Compare Observations
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800">
                    Recommended • Zero Data Loss
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900 mt-0.5">
                  Compare duplicate key pins and observations side-by-side to choose which version to keep or keep both.
                </p>
              </div>
            </button>
          )}

          {/* Overwrite */}
          <button
            type="button"
            onClick={onOverwrite}
            disabled={loading}
            className="w-full text-left p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-amber-50 hover:border-amber-300 transition-all flex items-start gap-3 group cursor-pointer"
          >
            <div className="p-2 bg-amber-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
              <RefreshCw size={16} />
            </div>
            <div>
              <p className="font-bold text-gray-900 group-hover:text-amber-950 text-xs">
                Overwrite / Replace Existing Report
              </p>
              <p className="text-[11px] text-gray-500 group-hover:text-amber-800 mt-0.5">
                Replaces key plans and observations of "{existingPhase.name}" with this backup. A safety restore snapshot will be created first.
              </p>
            </div>
          </button>

          {/* Duplicate */}
          <button
            type="button"
            onClick={onDuplicate}
            disabled={loading}
            className="w-full text-left p-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-start gap-3 group cursor-pointer"
          >
            <div className="p-2 bg-brand-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
              <Copy size={16} />
            </div>
            <div>
              <p className="font-bold text-blue-950 text-xs">
                Duplicate / Import as New Report Copy
              </p>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Creates a separate report named <em>"{incomingPhase.name} (Imported)"</em> so your existing report remains untouched.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="pt-1 text-right">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
