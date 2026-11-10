import React, { useState, useEffect, useRef } from 'react'
import { Check, ClipboardList, FileText, ArrowLeft, Plus, Trash2, AlertCircle, CheckCircle2, ArrowUpDown } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { savePhase, getPhases } from '../db/database'
import { useAppStore } from '../store/useAppStore'
import { Field, INPUT, Spinner } from './NewProjectModal'

const QUICK_WEATHER = ['Sunny', 'Partly Cloudy', 'Overcast', 'Rain', 'Windy', 'Clear']

export default function PhaseModal({ projectUuid, phase, onClose, onSaved }) {
  const isEditing = !!phase
  const [name, setName] = useState(phase?.name || '')
  const [createdBy, setCreatedBy] = useState(() => {
    if (phase?.createdBy) return phase.createdBy
    const cu = useAppStore.getState().currentUser
    return cu?.name || [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || cu?.email || ''
  })
  const [visitDate, setVisitDate] = useState(phase?.visitDate || (!isEditing ? new Date().toISOString().slice(0, 10) : ''))
  const [visitTime, setVisitTime] = useState(phase?.visitTime || '')
  const [weather, setWeather] = useState(phase?.weather || '')
  const [description, setDescription] = useState(phase?.description || '')

  // Attendees structured as an array of items
  const [attendeesList, setAttendeesList] = useState(() => {
    if (!phase?.attendees) return []
    const raw = String(phase.attendees).trim()
    if (!raw) return []
    let lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (lines.length === 1 && lines[0].includes(',')) {
      lines = lines[0].split(',').map(s => s.trim()).filter(Boolean)
    }
    return lines
  })
  const [newAttendee, setNewAttendee] = useState('')
  const [projectAttendees, setProjectAttendees] = useState([])
  const [sortByAZ, setSortByAZ] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Load project-wide attendees so any attendee added in any report of this project is accessible
  useEffect(() => {
    async function loadProjectAttendees() {
      try {
        const pool = new Set()

        // 1. Load from all other reports in this project
        if (projectUuid) {
          const allPhases = await getPhases(projectUuid)
          for (const p of allPhases) {
            if (p?.attendees) {
              const lines = String(p.attendees).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
              lines.forEach(l => { if (l) pool.add(l) })
            }
          }
        }

        // 2. Load from localStorage project attendee directory
        try {
          const stored = localStorage.getItem(`sitepunch_attendees_${projectUuid}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) {
              parsed.forEach(a => { if (typeof a === 'string' && a.trim()) pool.add(a.trim()) })
            }
          }
        } catch {}

        // 3. Include any current report attendees
        attendeesList.forEach(a => { if (a && a.trim()) pool.add(a.trim()) })

        setProjectAttendees(Array.from(pool))
      } catch (err) {
        console.error('Failed to load project attendees:', err)
      }
    }
    loadProjectAttendees()
  }, [projectUuid])

  function persistProjectAttendees(updatedPool) {
    try {
      if (projectUuid) {
        localStorage.setItem(`sitepunch_attendees_${projectUuid}`, JSON.stringify(Array.from(new Set(updatedPool))))
      }
    } catch {}
  }

  function handleAddAttendee(nameToAdd) {
    const raw = (nameToAdd != null ? nameToAdd : newAttendee).trim()
    if (!raw) return

    // Allow adding single or multiple comma/newline separated entries
    let itemsToAdd = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (itemsToAdd.length === 1 && itemsToAdd[0].includes(',')) {
      itemsToAdd = itemsToAdd[0].split(',').map(s => s.trim()).filter(Boolean)
    }

    const currentLower = new Set(attendeesList.map(a => a.toLowerCase()))
    const toAppend = []

    for (const it of itemsToAdd) {
      if (!currentLower.has(it.toLowerCase())) {
        toAppend.push(it)
        currentLower.add(it.toLowerCase())
      }
    }

    if (toAppend.length > 0) {
      let nextList = [...attendeesList, ...toAppend]
      if (sortByAZ) {
        nextList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      }
      setAttendeesList(nextList)

      const nextPool = Array.from(new Set([...projectAttendees, ...toAppend]))
      setProjectAttendees(nextPool)
      persistProjectAttendees(nextPool)
    }

    setNewAttendee('')
  }

  function handleRemoveAttendee(itemToRemove) {
    setAttendeesList(prev => prev.filter(a => a !== itemToRemove))
  }

  // Attendees from the project pool not yet added to this report
  const availableProjectAttendees = projectAttendees.filter(
    pa => !attendeesList.some(a => a.toLowerCase() === pa.toLowerCase())
  )

  // Live duplicate detection
  const query = newAttendee.trim().toLowerCase()
  const exactMatch = query ? attendeesList.find(a => a.trim().toLowerCase() === query) : null
  const isDuplicate = !!exactMatch
  const partialMatches = query.length >= 2
    ? attendeesList.filter(a => a.toLowerCase().includes(query) && a.trim().toLowerCase() !== query)
    : []
  const projectExactMatch = query && !isDuplicate
    ? availableProjectAttendees.find(a => a.trim().toLowerCase() === query)
    : null

  // Live-sorted attendees list:
  // When user is typing in newAttendee, prioritize matches (exact match first, then prefix, then substring)
  // Otherwise, respect A-Z sorting or natural order
  const displayedAttendees = [...attendeesList].sort((a, b) => {
    if (query) {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      const aExact = aLower === query
      const bExact = bLower === query
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1

      const aStarts = aLower.startsWith(query)
      const bStarts = bLower.startsWith(query)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      const aIncludes = aLower.includes(query)
      const bIncludes = bLower.includes(query)
      if (aIncludes && !bIncludes) return -1
      if (!aIncludes && bIncludes) return 1
    }
    if (sortByAZ) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    }
    return 0
  })

  // Live-sorted available project attendees: matching contacts float to front
  const sortedProjectAttendees = [...availableProjectAttendees].sort((a, b) => {
    if (query) {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      const aStarts = aLower.startsWith(query)
      const bStarts = bLower.startsWith(query)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      const aIncludes = aLower.includes(query)
      const bIncludes = bLower.includes(query)
      if (aIncludes && !bIncludes) return -1
      if (!aIncludes && bIncludes) return 1
    }
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })

  async function handleSave(e) {
    if (e) e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a report name.')
      return
    }

    const trimmedCreatedBy = createdBy.trim()
    if (!trimmedCreatedBy) {
      setError('Please enter who created this report.')
      return
    }

    setSaving(true)
    try {
      const attendeesString = attendeesList.map(a => a.trim()).filter(Boolean).join('\n')

      const payload = {
        name: trimmed,
        reportType: phase?.reportType || 'standard',
        visitDate: visitDate || '',
        visitTime: visitTime || '',
        weather: weather.trim(),
        attendees: attendeesString,
        description: description.trim(),
        createdBy: trimmedCreatedBy,
      }

      // Persist all project attendees to storage so subsequent reports access them immediately
      persistProjectAttendees([...projectAttendees, ...attendeesList])

      if (isEditing) {
        await savePhase({
          ...phase,
          ...payload,
        })
      } else {
        await savePhase({
          uuid: uuidv4(),
          projectUuid,
          ...payload,
        })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError('Failed to save report: ' + (err.message || String(err)))
    } finally {
      setSaving(false)
    }
  }

  const modalTitle = isEditing ? (phase?.name || 'Report Name') : (name.trim() || 'New Report')

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
              className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl font-bold tracking-tight leading-tight truncate">{modalTitle}</h1>
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">
                {isEditing ? 'Update observation scope and report configurations' : 'Create a new observation report for this project'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between overflow-hidden bg-gray-50">
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8"
          style={{
            paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto w-full space-y-5">
            {error && (
              <p className="text-red-600 text-xs bg-red-50 p-2.5 rounded-lg font-medium border border-red-100">
                {error}
              </p>
            )}

            {/* Report Name, Created By & Description Card */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Report Name" required>
                  <input
                    ref={inputRef}
                    type="text"
                    className={INPUT}
                    placeholder="e.g. Punch List Inspection"
                    value={name}
                    onChange={e => {
                      setName(e.target.value)
                      if (error) setError('')
                    }}
                  />
                </Field>

                <Field label="Report Created By" required>
                  <input
                    type="text"
                    className={INPUT}
                    placeholder="e.g. John Doe - Architect"
                    value={createdBy}
                    onChange={e => {
                      setCreatedBy(e.target.value)
                      if (error) setError('')
                    }}
                  />
                </Field>
              </div>

              <Field label="Report Description">
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter scope of walkthrough, general inspection findings, or summary notes..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-gray-50 placeholder-gray-400 resize-y"
                />
              </Field>
            </div>

            {/* Site Visit Details Card - Matches Settings Page Style */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <ClipboardList size={18} className="text-brand-700" style={{ color: 'var(--brand-button, #1d4ed8)' }} />
                <h3 className="text-sm font-bold text-gray-900">Site Visit Details</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    className={INPUT}
                    value={visitDate}
                    onChange={e => setVisitDate(e.target.value)}
                  />
                </Field>

                <Field label="Time">
                  <input
                    type="time"
                    className={INPUT}
                    value={visitTime}
                    onChange={e => setVisitTime(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Weather">
                <input
                  type="text"
                  className={INPUT}
                  placeholder="e.g. 72°F, Clear / Sunny, Calm winds"
                  value={weather}
                  onChange={e => setWeather(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-gray-400 mr-1">Quick select:</span>
                  {QUICK_WEATHER.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setWeather(prev => prev ? `${prev}, ${item}` : item)
                      }}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Attendees Section as Structured List with Live Duplicate Detection & Sort */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Attendees {attendeesList.length > 0 && <span className="text-gray-400 font-normal">({attendeesList.length})</span>}
                  </label>
                  {attendeesList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSortByAZ(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                        sortByAZ
                          ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                      title={sortByAZ ? 'Sorted Alphabetically A-Z (click for order added)' : 'Order Added (click to sort A-Z)'}
                    >
                      <ArrowUpDown size={12} />
                      <span>{sortByAZ ? 'Sorted A-Z' : 'Order Added'}</span>
                    </button>
                  )}
                </div>

                {/* Add Attendee Input & Action with Live Duplicate Feedback (Moved to Top) */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        className={`${INPUT} ${
                          isDuplicate
                            ? 'border-amber-400 bg-amber-50/20 focus:ring-amber-300'
                            : ''
                        }`}
                        placeholder="Type attendee name (e.g. John Doe - Architect)"
                        value={newAttendee}
                        onChange={e => setNewAttendee(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (!isDuplicate) handleAddAttendee()
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddAttendee()}
                      disabled={!newAttendee.trim() || isDuplicate}
                      className={`sitepunch-btn-primary px-4 py-2.5 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 flex-shrink-0 shadow-sm ${
                        isDuplicate
                          ? 'bg-amber-600 hover:bg-amber-600 opacity-60 cursor-not-allowed'
                          : 'bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                      }`}
                      style={!isDuplicate ? { background: 'var(--brand-button, #1d4ed8)' } : undefined}
                      title={isDuplicate ? 'Duplicate attendee already in list' : 'Add attendee'}
                    >
                      {isDuplicate ? <AlertCircle size={15} /> : <Plus size={15} />}
                      <span>{isDuplicate ? 'Duplicate' : 'Add'}</span>
                    </button>
                  </div>

                  {/* Live Feedback Messages */}
                  {isDuplicate && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium animate-fadeIn">
                      <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                      <span className="truncate">
                        <strong>"{exactMatch}"</strong> is already in this report's attendees list.
                      </span>
                    </div>
                  )}

                  {!isDuplicate && partialMatches.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50/80 border border-blue-200 text-blue-800 text-xs font-medium">
                      <CheckCircle2 size={14} className="text-blue-600 flex-shrink-0" />
                      <span className="truncate">
                        Similar existing attendee: <strong>{partialMatches[0]}</strong>{partialMatches.length > 1 ? ` (+${partialMatches.length - 1} more)` : ''}
                      </span>
                    </div>
                  )}

                  {!isDuplicate && projectExactMatch && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                      <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                      <span className="truncate">
                        Found in project contacts! Click pill below to add.
                      </span>
                    </div>
                  )}
                </div>

                {/* Attendees List with Live Feedback & Sort */}
                {displayedAttendees.length > 0 ? (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                    {displayedAttendees.map((att, idx) => {
                      const attLower = att.toLowerCase()
                      const isItemExactMatch = query && attLower === query
                      const isItemPartialMatch = query && !isItemExactMatch && attLower.includes(query)

                      return (
                        <div
                          key={`${att}-${idx}`}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-all ${
                            isItemExactMatch
                              ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-200/60 shadow-xs'
                              : isItemPartialMatch
                              ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-100'
                              : 'bg-slate-50 hover:bg-slate-100/90 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 ${
                                isItemExactMatch
                                  ? 'bg-amber-200 text-amber-900'
                                  : isItemPartialMatch
                                  ? 'bg-blue-200 text-blue-900'
                                  : ''
                              }`}
                              style={
                                !isItemExactMatch && !isItemPartialMatch
                                  ? { background: 'var(--brand-header-light, #dbeafe)', color: 'var(--brand-button, #1d4ed8)' }
                                  : undefined
                              }
                            >
                              {idx + 1}
                            </span>
                            <span className="text-xs font-medium text-slate-800 truncate" title={att}>
                              {att}
                            </span>
                            {isItemExactMatch && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex-shrink-0">
                                Duplicate Match
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttendee(att)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center cursor-pointer"
                            title="Remove attendee"
                            aria-label={`Remove ${att}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                    <p className="text-xs text-gray-400">No attendees added yet. Type an attendee name above or select from other reports.</p>
                  </div>
                )}

                {/* Project-wide Attendees Quick Add - Accessible across reports in this project */}
                {sortedProjectAttendees.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-500">
                        {query ? 'Matching Project Attendees:' : 'Add from other reports in this project:'}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {sortedProjectAttendees.length} available
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {sortedProjectAttendees.map(att => {
                        const isMatch = query && att.toLowerCase().includes(query)
                        return (
                          <button
                            key={att}
                            type="button"
                            onClick={() => handleAddAttendee(att)}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors group cursor-pointer ${
                              isMatch
                                ? 'bg-blue-100 text-blue-900 border border-blue-300 ring-1 ring-blue-200 font-semibold'
                                : 'bg-blue-50/90 hover:bg-blue-100 text-blue-700 border border-blue-200/80'
                            }`}
                            title={`Add ${att} to this report`}
                          >
                            <Plus size={12} className="text-blue-500 group-hover:scale-110 transition-transform" />
                            <span>{att}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
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
              type="submit"
              disabled={saving}
              className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {saving ? <Spinner /> : <><Check size={16} /> {isEditing ? 'Save Changes' : 'Create Report'}</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
