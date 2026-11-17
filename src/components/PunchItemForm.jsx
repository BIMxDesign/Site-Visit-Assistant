import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Camera, Mic, MicOff, Trash2, Image as ImageIcon,
  Plus, Check, Edit2, AlertCircle, Tag, ArrowLeft, Lock, Copy,
  ChevronLeft, ChevronRight, MapPin, Search, ChevronDown, ChevronUp,
  Bold, List, ListOrdered, Clock
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  getPunchItem,
  savePunchItem,
  deletePunchItem,
  getPunchItems,
  getFloorPlan,
  getFloorPlansByPhase,
  db,
  getPhotos,
  deletePhoto,
  getCustomTrades,
  saveCustomTrades,
  reassignPunchItemsTrade,
  DEFAULT_TRADES
} from '../db/database'
import { ModalOverlay, ModalHeader, Field, INPUT, Spinner } from './NewProjectModal'
import PhotoAnnotator from './PhotoAnnotator'
import { v4 as uuidv4 } from 'uuid'
import { OBSERVATION_STATUSES, normalizeObservationStatus } from '../utils/formatters'
import { preparePhotoForQuality, getStoredPhotoQuality, readFileAsDataUrl } from '../utils/media'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

export default function PunchItemForm() {
  const {
    closePunchForm,
    currentPunchItemUuid,
    currentPhaseUuid,
    currentProjectUuid,
    currentFloorPlanUuid,
    setCurrentPunchItem,
    photoQuality,
    setPendingPinInstanceObs,
    navigateToFloorPlan,
    pinColor,
  } = useAppStore()

  const [item,        setItem]        = useState(null)
  const [photos,      setPhotos]      = useState([])
  const [saving,      setSaving]      = useState(false)
  const [deletingPin, setDeletingPin] = useState(false)
  const [error,       setError]       = useState('')

  // Sibling observations for desktop left/right navigation
  const [siblings,    setSiblings]    = useState([])

  // Report Observation Notes Reuse (Searchable Dropdown)
  const [reportNotes,       setReportNotes]       = useState([])
  const [reusedSuccessMsg,  setReusedSuccessMsg]  = useState('')
  const [reuseSearch,       setReuseSearch]       = useState('')
  const [showReuseDropdown, setShowReuseDropdown] = useState(false)
  const reuseDropdownRef = useRef(null)

  // Observation Notes Text Formatting & Always CAPS LOCK
  const [isCapsLock, setIsCapsLock] = useState(() => {
    try {
      return localStorage.getItem('punchapp_notes_caps_lock') === 'true'
    } catch {
      return false
    }
  })
  const textareaRef = useRef(null)

  // Lists
  const [trades,            setTrades]            = useState([])
  const [showTradeManager,  setShowTradeManager]  = useState(false)
  const [newTradeInput,     setNewTradeInput]     = useState('')
  const [tradeError,        setTradeError]        = useState('')
  const [tradeSuccess,      setTradeSuccess]      = useState('')

  const [form, setForm] = useState({
    title: '', notes: '', trade: 'General', priority: 'Medium', status: 'Open',
    assignedTo: '', dueDate: ''
  })

  const [listening,       setListening]       = useState(false)
  const [interimText,     setInterimText]     = useState('')
  const [annotatingPhoto, setAnnotatingPhoto] = useState(null) // { uuid, dataUrl }
  const recognitionRef    = useRef(null)
  const isListeningRef    = useRef(false)
  const latestInterimRef  = useRef('')
  const processedFinalIndicesRef = useRef(new Set())
  const restartTimeoutRef = useRef(null)
  const fileInputRef      = useRef(null)

  const initialLoadedUuid = useRef(null)
  const isSavedRef        = useRef(false)
  const hadNotesInitiallyRef = useRef(false)
  const itemRef           = useRef(null)

  // Cleanup speech recognition on component unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null
          recognitionRef.current.onend = null
          recognitionRef.current.onerror = null
          recognitionRef.current.abort()
        } catch {}
      }
    }
  }, [])

  // Load trades list
  useEffect(() => {
    async function loadLists() {
      const tList = await getCustomTrades()
      setTrades(tList)
    }
    loadLists()
  }, [])

  // Load punch item data
  const loadInitialData = useCallback(async () => {
    if (!currentPunchItemUuid) return
    const it = await getPunchItem(currentPunchItemUuid)
    if (!it) return
    setItem(it)
    itemRef.current = it
    hadNotesInitiallyRef.current = !!(it.notes && it.notes.trim().length > 0)
    isSavedRef.current = false
    setForm({
      title:      it.title      || '',
      notes:      it.notes      || '',
      trade:      it.trade      || 'General',
      priority:   it.priority   || 'Medium',
      status:     normalizeObservationStatus(it.status),
      assignedTo: it.assignedTo || '',
      dueDate:    it.dueDate    || '',
    })
    const ph = await getPhotos(it.uuid)
    setPhotos(ph)
    initialLoadedUuid.current = currentPunchItemUuid

    // Load sibling observations and notes from the same report / key plan
    try {
      let pUuid = it.phaseUuid || currentPhaseUuid || null
      let projUuid = it.projectUuid || currentProjectUuid || null

      if (!pUuid && it.floorPlanUuid) {
        const fp = await getFloorPlan(it.floorPlanUuid)
        if (fp) {
          pUuid = fp.phaseUuid || null
          if (!projUuid) projUuid = fp.projectUuid || null
        }
      }

      let allSiblings = []
      if (currentFloorPlanUuid && it.floorPlanUuid === currentFloorPlanUuid) {
        // Opened from a specific key plan
        allSiblings = await db.punchItems.where('floorPlanUuid').equals(currentFloorPlanUuid).toArray()
      } else if (pUuid) {
        // Belonging to the site visit / report (and any key plans in this visit)
        const phaseFps = await getFloorPlansByPhase(pUuid)
        const fpSet = new Set(phaseFps.map(f => f.uuid))
        if (it.floorPlanUuid) fpSet.add(it.floorPlanUuid)

        const allProjItems = projUuid ? await getPunchItems(projUuid) : await db.punchItems.toArray()
        allSiblings = allProjItems.filter(p => {
          if (p.phaseUuid && String(p.phaseUuid).trim() === String(pUuid).trim()) return true
          if (p.floorPlanUuid && fpSet.has(p.floorPlanUuid)) return true
          return false
        })
      } else if (it.floorPlanUuid) {
        allSiblings = await db.punchItems.where('floorPlanUuid').equals(it.floorPlanUuid).toArray()
      } else if (projUuid) {
        allSiblings = await getPunchItems(projUuid)
      } else {
        allSiblings = await db.punchItems.toArray()
      }

      if (!allSiblings.some(s => s.uuid === it.uuid)) {
        allSiblings.push(it)
      }

      // Sort logically by itemNumber (1, 2, 3...) then by createdAt
      allSiblings.sort((a, b) => {
        const numA = Number(a.itemNumber)
        const numB = Number(b.itemNumber)
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB
        }
        return (a.createdAt || 0) - (b.createdAt || 0)
      })

      setSiblings(allSiblings)

      const validNotes = allSiblings
        .filter(p => p.uuid !== it.uuid && p.notes && p.notes.trim().length > 0)

      setReportNotes(validNotes)
    } catch (err) {
      console.error('Failed to load sibling observations:', err)
      setReportNotes([])
      setSiblings([])
    }
  }, [currentPunchItemUuid, currentPhaseUuid, currentProjectUuid, currentFloorPlanUuid])

  useEffect(() => {
    if (currentPunchItemUuid !== initialLoadedUuid.current) {
      loadInitialData()
    }
  }, [currentPunchItemUuid, loadInitialData])

  // Current position among sibling observations
  const currentIndex = siblings.findIndex(s => s.uuid === (item?.uuid || currentPunchItemUuid))
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < siblings.length - 1
  const prevItem = hasPrev ? siblings[currentIndex - 1] : null
  const nextItem = hasNext ? siblings[currentIndex + 1] : null

  // Navigate to another observation on desktop
  const navigateToSibling = useCallback(async (targetSibling) => {
    if (!targetSibling || saving || deletingPin) return

    // Stop speech recognition if listening
    if (listening) {
      stopVoiceSession()
    }

    // Auto-save active changes if notes are present
    if (item && form.notes && form.notes.trim()) {
      try {
        await savePunchItem({ ...item, ...form })
      } catch (err) {
        console.warn('Auto-saving observation before switching failed:', err)
      }
    }

    setError('')
    setCurrentPunchItem(targetSibling.uuid)
  }, [saving, deletingPin, listening, item, form, setCurrentPunchItem])

  const handlePrevObservation = useCallback(() => {
    if (hasPrev && prevItem) {
      navigateToSibling(prevItem)
    }
  }, [hasPrev, prevItem, navigateToSibling])

  const handleNextObservation = useCallback(() => {
    if (hasNext && nextItem) {
      navigateToSibling(nextItem)
    }
  }, [hasNext, nextItem, navigateToSibling])

  // Desktop keyboard shortcuts: Left / Right arrow navigation (when not typing in form inputs)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
        return
      }
      if (annotatingPhoto || showTradeManager) return

      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault()
        handlePrevObservation()
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault()
        handleNextObservation()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasPrev, hasNext, handlePrevObservation, handleNextObservation, annotatingPhoto, showTradeManager])

  // Accessibility & UX: Handle Escape key when annotating photo to return directly to observation edit page
  useEffect(() => {
    if (!annotatingPhoto) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        setAnnotatingPhoto(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [annotatingPhoto])

  const set = (k, v) => {
    setError('')
    setForm(f => ({ ...f, [k]: v }))
  }

  // Close searchable reuse dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (reuseDropdownRef.current && !reuseDropdownRef.current.contains(e.target)) {
        setShowReuseDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  // Toggle CAPS LOCK mode (persisted to localStorage)
  const toggleCapsLock = () => {
    setIsCapsLock(prev => {
      const next = !prev
      try {
        localStorage.setItem('punchapp_notes_caps_lock', String(next))
      } catch {}
      if (next && form.notes) {
        set('notes', form.notes.toUpperCase())
      }
      return next
    })
  }

  // Handle typing inside notes textarea with optional always-caps enforcement
  const handleNotesChange = (e) => {
    let val = e.target.value
    if (isCapsLock) {
      val = val.toUpperCase()
    }
    set('notes', val)
  }

  // Text formatting actions (bold, bullets, numbering, timestamps, case transforms)
  const applyTextFormatting = (type) => {
    const el = textareaRef.current
    const currentNotes = form.notes || ''
    if (!el) {
      if (type === 'uppercase') set('notes', currentNotes.toUpperCase())
      if (type === 'lowercase') set('notes', currentNotes.toLowerCase())
      if (type === 'sentence') {
        const sentence = currentNotes.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
        set('notes', sentence)
      }
      return
    }

    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    const selected = currentNotes.slice(start, end)
    let replacement = ''
    let newCursorStart = start
    let newCursorEnd = end

    if (type === 'uppercase') {
      const converted = currentNotes.toUpperCase()
      set('notes', converted)
      return
    }
    if (type === 'lowercase') {
      const converted = currentNotes.toLowerCase()
      set('notes', converted)
      return
    }
    if (type === 'sentence') {
      const sentence = currentNotes.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
      set('notes', sentence)
      return
    }

    if (type === 'bold') {
      if (selected) {
        replacement = `**${selected}**`
        newCursorStart = start
        newCursorEnd = start + replacement.length
      } else {
        replacement = `**BOLD TEXT**`
        newCursorStart = start + 2
        newCursorEnd = start + 11
      }
    } else if (type === 'bullet') {
      if (selected) {
        const lines = selected.split('\n')
        replacement = lines.map(l => l.startsWith('• ') ? l.replace(/^•\s*/, '') : `• ${l}`).join('\n')
        newCursorStart = start
        newCursorEnd = start + replacement.length
      } else {
        const needsNewline = start > 0 && currentNotes[start - 1] !== '\n' ? '\n' : ''
        replacement = `${needsNewline}• `
        newCursorStart = start + replacement.length
        newCursorEnd = newCursorStart
      }
    } else if (type === 'number') {
      if (selected) {
        const lines = selected.split('\n')
        replacement = lines.map((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, '')}`).join('\n')
        newCursorStart = start
        newCursorEnd = start + replacement.length
      } else {
        const needsNewline = start > 0 && currentNotes[start - 1] !== '\n' ? '\n' : ''
        replacement = `${needsNewline}1. `
        newCursorStart = start + replacement.length
        newCursorEnd = newCursorStart
      }
    } else if (type === 'timestamp') {
      const now = new Date()
      const stamp = `[${now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })} ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}] `
      replacement = stamp
      newCursorStart = start + replacement.length
      newCursorEnd = newCursorStart
    }

    let nextText = currentNotes.slice(0, start) + replacement + currentNotes.slice(end)
    if (isCapsLock) nextText = nextText.toUpperCase()
    set('notes', nextText)

    setTimeout(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(newCursorStart, newCursorEnd)
      }
    }, 0)
  }

  // Reuse previous observation note: Keep text already inside box and append copied text after that!
  const handleSelectReuseNote = (found) => {
    if (!found) return
    setForm(prev => {
      const existing = (prev.notes || '').trim()
      let addition = (found.notes || '').trim()
      if (isCapsLock) addition = addition.toUpperCase()
      const merged = existing ? `${existing}\n${addition}` : addition
      return {
        ...prev,
        notes: merged,
        trade: (prev.trade === 'General' || !prev.trade) && found.trade ? found.trade : prev.trade,
        priority: (prev.priority === 'Medium' || !prev.priority) && found.priority ? found.priority : prev.priority,
      }
    })
    setError('')
    setShowReuseDropdown(false)
    setReuseSearch('')
    setReusedSuccessMsg(`Appended note from Observation #${found.itemNumber || ''}`)
    setTimeout(() => {
      setReusedSuccessMsg('')
    }, 3500)
  }

  // ── Custom Trade Management ────────────────────────────────────────────────
  function openTradeManager() {
    setTradeError('')
    setTradeSuccess('')
    setNewTradeInput('')
    setShowTradeManager(true)
  }

  async function handleCreateTrade() {
    if (!newTradeInput || !newTradeInput.trim()) {
      setTradeError('Please enter a category name.')
      setTradeSuccess('')
      return
    }
    const trimmed = newTradeInput.trim()
    if (trimmed.toLowerCase() === 'other') {
      setTradeError('"Other" is a standard system category and cannot be modified or duplicated.')
      setTradeSuccess('')
      return
    }
    if (trades.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setTradeError(`"${trimmed}" is already in the list.`)
      setTradeSuccess('')
      return
    }
    const updated = [...trades, trimmed]
    if (!updated.some(t => t.toLowerCase() === 'other')) {
      updated.push('Other')
    }
    setTrades(updated)
    await saveCustomTrades(updated)
    set('trade', trimmed)
    setNewTradeInput('')
    setTradeError('')
    setTradeSuccess(`Added "${trimmed}" to categories.`)
  }

  async function handleRemoveTrade(tradeToRemove) {
    if (!tradeToRemove || tradeToRemove.trim().toLowerCase() === 'other') {
      setTradeError('The "Other" category is standard and cannot be deleted or modified.')
      setTradeSuccess('')
      return
    }

    const updated = trades.filter(t => t.toLowerCase() !== tradeToRemove.toLowerCase())
    if (!updated.some(t => t.toLowerCase() === 'other')) {
      updated.push('Other')
    }
    setTrades(updated)
    await saveCustomTrades(updated)

    // Auto-reassign any punch items actively assigned to this deleted trade -> 'Other'
    const reassignedCount = await reassignPunchItemsTrade(tradeToRemove, 'Other')

    // If active item in form was assigned to this deleted trade, auto-reassign to 'Other'
    if (form.trade && form.trade.trim().toLowerCase() === tradeToRemove.trim().toLowerCase()) {
      set('trade', 'Other')
    }
    if (item && item.trade && item.trade.trim().toLowerCase() === tradeToRemove.trim().toLowerCase()) {
      setItem(prev => prev ? ({ ...prev, trade: 'Other' }) : prev)
    }

    setTradeError('')
    if (reassignedCount > 0) {
      setTradeSuccess(`Deleted "${tradeToRemove}". ${reassignedCount} active punch item${reassignedCount === 1 ? '' : 's'} automatically reassigned to "Other".`)
    } else {
      setTradeSuccess(`Deleted "${tradeToRemove}".`)
    }
  }

  async function handleResetTrades() {
    if (!window.confirm('Reset the Category list back to standard categories?')) return
    setTrades(DEFAULT_TRADES)
    await saveCustomTrades(DEFAULT_TRADES)
    if (form.trade && !DEFAULT_TRADES.some(t => t.toLowerCase() === form.trade.toLowerCase())) {
      set('trade', 'Other')
    }
    setTradeError('')
    setTradeSuccess('Reset category list to standard categories.')
  }

  // Save the punch item (validating compulsory observation notes)
  async function handleSave() {
    if (!item) return

    if (!form.notes.trim()) {
      setError('Observation notes are compulsory. Please add notes before saving.')
      return
    }

    setSaving(true)
    isSavedRef.current = true
    await savePunchItem({ ...item, ...form })
    setSaving(false)
    closePunchForm()
  }

  // Delete the punch item and its pin
  async function handleDeletePin() {
    if (!item) return
    const totalInstances = 1 + (item.extraPins?.length || 0)
    let confirmed = false
    if (totalInstances > 1) {
      confirmed = window.confirm(
        `Delete Observation #${item.itemNumber}?\n\nThis observation currently has ${totalInstances} pin instances on key plans.\nDeleting this observation will permanently delete all ${totalInstances} pin instances, notes, and attached photos.\n\nDo you want to proceed?`
      )
    } else {
      confirmed = window.confirm(
        `Delete Observation #${item.itemNumber}?\n\n⚠️ Warning: This is the LAST remaining pin instance for Observation #${item.itemNumber}.\n\nDeleting it will permanently remove this observation, all notes, and attached photos from the project, and automatically resequence remaining pins.`
      )
    }
    if (!confirmed) return
    setDeletingPin(true)
    isSavedRef.current = true
    await deletePunchItem(item.uuid)
    setDeletingPin(false)
    closePunchForm()
  }

  // Cancel and discard unsaved newly dropped pin so no blank pin remains on key plan
  const handleCancel = async () => {
    if (item && !hadNotesInitiallyRef.current && !isSavedRef.current) {
      isSavedRef.current = true
      try {
        await deletePunchItem(item.uuid)
      } catch (err) {
        console.error('Failed to clean up unsaved blank pin:', err)
      }
    }
    closePunchForm()
  }

  // Cleanup on unmount: if modal is dismissed or closed without saving notes for a newly placed pin
  useEffect(() => {
    return () => {
      if (itemRef.current && !hadNotesInitiallyRef.current && !isSavedRef.current) {
        deletePunchItem(itemRef.current.uuid).catch(err => {
          console.warn('Cleanup of unsaved blank observation pin failed:', err)
        })
      }
    }
  }, [])

  // ── Voice to text (Robust, continuous, multi-platform) ───────────────────
  function appendSpeechToNotes(text) {
    let clean = (text || '').trim()
    if (!clean) return
    if (isCapsLock) clean = clean.toUpperCase()
    setForm(prev => {
      const current = (prev.notes || '').trim()
      if (!current) return { ...prev, notes: clean }
      return { ...prev, notes: `${current} ${clean}` }
    })
  }

  function stopVoiceSession() {
    isListeningRef.current = false
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }

    // Commit any pending interim speech (guarantees no dropped words on iOS/Safari)
    const pending = (latestInterimRef.current || '').trim()
    latestInterimRef.current = ''
    setInterimText('')
    if (pending) {
      appendSpeechToNotes(pending)
    }

    setListening(false)

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
  }

  function startRecognitionSession() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SR) {
      setError('Voice recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari, and ensure you are connected via HTTPS or localhost.')
      setListening(false)
      isListeningRef.current = false
      return
    }

    // Clean up any lingering previous instance before starting fresh
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.abort()
      } catch {}
      recognitionRef.current = null
    }

    try {
      const rec = new SR()

      try {
        rec.continuous = true
      } catch {
        rec.continuous = false
      }

      rec.interimResults = true
      rec.lang = 'en-US'

      // Reset index tracking for this fresh session cycle
      processedFinalIndicesRef.current = new Set()

      rec.onstart = () => {
        isListeningRef.current = true
        setListening(true)
        setError('')
      }

      rec.onresult = (e) => {
        let currentInterim = ''
        const newFinals = []

        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          const transcript = (res[0]?.transcript || '').trim()
          if (!transcript) continue

          if (res.isFinal) {
            // Process each final index exactly once to eliminate double transcription
            if (!processedFinalIndicesRef.current.has(i)) {
              processedFinalIndicesRef.current.add(i)
              newFinals.push(transcript)
            }
          } else {
            currentInterim += (currentInterim ? ' ' : '') + transcript
          }
        }

        if (newFinals.length > 0) {
          setError('')
          latestInterimRef.current = currentInterim
          setInterimText(currentInterim)
          appendSpeechToNotes(newFinals.join(' '))
        } else if (currentInterim) {
          latestInterimRef.current = currentInterim
          setInterimText(currentInterim)
        } else {
          latestInterimRef.current = ''
          setInterimText('')
        }
      }

      rec.onerror = (e) => {
        console.warn('Speech recognition event error:', e.error)
        if (e.error === 'no-speech') {
          // Normal brief pause while user is thinking; onend will seamlessly restart
          return
        }

        if (e.error === 'not-allowed' || e.error === 'permission-denied') {
          setError('Microphone access blocked. Please click the lock or settings icon in your browser to allow microphone access.')
          stopVoiceSession()
          return
        }

        if (e.error === 'audio-capture') {
          setError('No microphone found or another app is currently using the microphone.')
          stopVoiceSession()
          return
        }

        if (e.error === 'network') {
          setError('Voice recognition requires an active internet connection on this browser.')
          stopVoiceSession()
          return
        }

        if (e.error !== 'aborted') {
          setError(`Voice input notice: ${e.error}`)
        }
      }

      rec.onend = () => {
        // Commit any remaining unfinalized interim speech (WebKit silence flush)
        const pending = (latestInterimRef.current || '').trim()
        latestInterimRef.current = ''
        setInterimText('')
        if (pending) {
          appendSpeechToNotes(pending)
        }

        // If user hasn't explicitly stopped, seamlessly spawn a fresh instance
        if (isListeningRef.current) {
          if (restartTimeoutRef.current) {
            clearTimeout(restartTimeoutRef.current)
          }
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              startRecognitionSession()
            }
          }, 120)
        } else {
          setListening(false)
        }
      }

      recognitionRef.current = rec
      rec.start()
      isListeningRef.current = true
      setListening(true)
    } catch (err) {
      console.error('Failed to start speech recognition session:', err)
      stopVoiceSession()
      setError(`Could not start voice recognition: ${err.message || 'Microphone blocked or not supported'}`)
    }
  }

  function toggleVoice() {
    if (listening || isListeningRef.current) {
      stopVoiceSession()
    } else {
      setError('')
      latestInterimRef.current = ''
      setInterimText('')
      startRecognitionSession()
    }
  }

  const MAX_PHOTOS = 3

  // ── Photo handling ─────────────────────────────────────────────────────────
  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return

    if (photos.length >= MAX_PHOTOS) {
      alert(`Maximum ${MAX_PHOTOS} images can be uploaded to a punch list item.`)
      e.target.value = ''
      return
    }

    // Auto-persist form data before opening annotator
    if (item) {
      await savePunchItem({ ...item, ...form })
    }

    const file = files[0]
    const activeQuality = photoQuality || getStoredPhotoQuality()
    const rawDataUrl = await readFileAsDataUrl(file)
    const dataUrl = await preparePhotoForQuality(rawDataUrl, activeQuality)
    setAnnotatingPhoto({ uuid: null, dataUrl })
    e.target.value = ''
  }

  function handleCameraCapture() {
    if (photos.length >= MAX_PHOTOS) {
      alert(`Maximum ${MAX_PHOTOS} images can be uploaded to a punch list item.`)
      return
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
    }
    fileInputRef.current?.click()
  }

  async function handleStartEditPhoto(photo) {
    if (item) {
      await savePunchItem({ ...item, ...form })
    }
    setAnnotatingPhoto({ uuid: photo.uuid, dataUrl: photo.imageData })
  }

  async function saveAnnotatedPhoto(annotatedDataUrl) {
    const photoUuid = (annotatingPhoto && annotatingPhoto.uuid) || uuidv4()
    const { savePhoto, savePunchItem } = await import('../db/database')

    // 1. Save photo
    await savePhoto({
      uuid: photoUuid,
      punchItemUuid: currentPunchItemUuid,
      imageData: annotatedDataUrl
    })

    // 2. Also save current form values
    if (item) {
      await savePunchItem({ ...item, ...form })
    }

    // 3. Refresh only photos list
    const updatedPhotos = await getPhotos(currentPunchItemUuid)
    setPhotos(updatedPhotos)

    // 4. Return to punch item form
    setAnnotatingPhoto(null)
  }

  async function handleDeletePhoto(uuid) {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return
    await deletePhoto(uuid)
    setPhotos(ph => ph.filter(p => p.uuid !== uuid))
  }

  // ── Extra Pin Instances Handling ───────────────────────────────────────────
  async function handleStartAddPinInstance() {
    if (!form.notes || !form.notes.trim()) {
      setError('Please enter Observation Notes first before placing extra pin instances.')
      return
    }

    if (listening && recognitionRef.current) {
      stopVoiceSession()
    }

    // Save pending form changes
    const updated = { ...item, ...form }
    await savePunchItem(updated)
    isSavedRef.current = true

    const targetFpUuid = item.floorPlanUuid || currentFloorPlanUuid
    const targetProjUuid = item.projectUuid || currentProjectUuid

    setPendingPinInstanceObs({
      obsUuid: item.uuid,
      itemNumber: item.itemNumber,
      floorPlanUuid: targetFpUuid,
    })

    if (targetProjUuid && targetFpUuid) {
      navigateToFloorPlan(targetProjUuid, targetFpUuid)
    }

    closePunchForm()
  }

  async function handleDeleteExtraPin(pinId) {
    if (!window.confirm('Remove this pin instance from the key plan? The observation will remain.')) return
    const remaining = (item.extraPins || []).filter(p => p.id !== pinId)
    const updated = { ...item, ...form, extraPins: remaining }
    await savePunchItem(updated)
    setItem(updated)
    itemRef.current = updated
  }

  // Filtered notes for keyword search in reuse notes dropdown
  const filteredReportNotes = reportNotes.filter(n => {
    if (!reuseSearch.trim()) return true
    const q = reuseSearch.toLowerCase().trim()
    const notesMatch = (n.notes || '').toLowerCase().includes(q)
    const itemNumMatch = String(n.itemNumber || '').includes(q) || `#${n.itemNumber}`.includes(q)
    const tradeMatch = (n.trade || '').toLowerCase().includes(q)
    return notesMatch || itemNumMatch || tradeMatch
  })

  if (!item) return (
    <ModalOverlay onClose={handleCancel}>
      <div className="bg-white rounded-t-2xl p-8 flex items-center justify-center">
        <Spinner />
      </div>
    </ModalOverlay>
  )

  return (
    <>
      {/* ── Main Punch Item Modal ── */}
      <ModalOverlay onClose={handleCancel}>
        <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
          {/* Header with Delete Pin Action */}
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
                  type="button"
                  onClick={handleCancel}
                  className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
                  aria-label="Back"
                  title="Back"
                >
                  <ArrowLeft size={20} className="block" />
                </button>
                <div className="flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight leading-tight truncate">
                      Observation #{item.itemNumber}
                    </h1>
                    <button
                      type="button"
                      onClick={handleStartAddPinInstance}
                      className="liquid-glass-btn p-1.5 rounded-xl text-white hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xs"
                      title={`Add duplicate Pin #${item.itemNumber} on key plan${(item.extraPins?.length || 0) > 0 ? ` (${(item.extraPins?.length || 0) + 1} pin instances)` : ''}`}
                      aria-label="Add duplicate pin on key plan"
                    >
                      <Plus size={16} strokeWidth={2.5} />
                    </button>
                    {(item.extraPins?.length || 0) > 0 && (
                      <span className="text-[11px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full select-none">
                        {(item.extraPins?.length || 0) + 1} pins
                      </span>
                    )}
                  </div>
                  <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">
                    Edit Observation details and photo record
                  </p>
                </div>
              </div>

              {/* Desktop-only Observation Navigation: strictly hidden on phone view */}
              {siblings.length > 1 && (
                <div className="hidden md:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevObservation}
                    disabled={!hasPrev || saving}
                    className="liquid-glass-btn px-3 py-1.5 rounded-xl text-white transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:pointer-events-none hover:bg-white/20 active:scale-95 shadow-sm"
                    title={hasPrev ? `Previous Observation (#${prevItem?.itemNumber || ''})` : 'First observation'}
                    aria-label="Previous observation"
                  >
                    <ChevronLeft size={16} />
                    <span>Prev</span>
                  </button>

                  <div className="px-2.5 py-1 rounded-lg bg-black/20 text-white/90 text-xs font-mono font-medium select-none">
                    {currentIndex >= 0 ? currentIndex + 1 : 1} of {siblings.length}
                  </div>

                  <button
                    type="button"
                    onClick={handleNextObservation}
                    disabled={!hasNext || saving}
                    className="liquid-glass-btn px-3 py-1.5 rounded-xl text-white transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-30 disabled:pointer-events-none hover:bg-white/20 active:scale-95 shadow-sm"
                    title={hasNext ? `Next Observation (#${nextItem?.itemNumber || ''})` : 'Last observation'}
                    aria-label="Next observation"
                  >
                    <span>Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </header>

          <div
            className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50"
            style={{
              paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
              paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
            }}
          >
            <div className="max-w-4xl mx-auto w-full space-y-4">
              {/* Compulsory Validation Error Alert */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Photos - Center Aligned */}
              <div className="flex flex-col items-center text-center">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Photos ({photos.length} / {MAX_PHOTOS})
                </label>

                <div className="flex items-center justify-center gap-3 mt-1 flex-wrap w-full">
                  {photos.map(ph => (
                    <div key={ph.uuid} className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0">
                      <PhotoThumb
                        photo={ph}
                        onEdit={() => handleStartEditPhoto(ph)}
                        onDelete={() => handleDeletePhoto(ph.uuid)}
                      />
                    </div>
                  ))}
                  {/* Add photo button (up to max 3 photos) */}
                  {photos.length < MAX_PHOTOS ? (
                    <button
                      type="button"
                      onClick={handleCameraCapture}
                      className="w-24 h-24 sm:w-28 sm:h-28 aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-400 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:text-brand-500 transition-colors cursor-pointer bg-white hover:bg-brand-50/20"
                      title={`Add photo (${photos.length} of ${MAX_PHOTOS})`}
                    >
                      <Camera size={24} />
                      <span className="text-xs font-medium">Add Photo</span>
                    </button>
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 aspect-square rounded-xl border border-gray-150 bg-gray-50 flex flex-col items-center justify-center p-2 text-center text-gray-400">
                      <Camera size={18} className="opacity-40 mb-1" />
                      <span className="text-[10px] font-semibold leading-tight">Max 3 photos reached</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  Maximum 3 photos can be attached to each punch list item
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={photos.length >= MAX_PHOTOS}
                  onChange={handlePhotoSelect}
                />
              </div>

            {/* Observation Notes (COMPULSORY FIELD) - Adjustable Multi-line Textbox with Formatting Toolbar */}
            <Field label="Observation Notes" required>
              <div className="relative">
                {/* Text Formatting & Case Conversion Toolbar */}
                <div className="bg-gray-50 border border-gray-200 border-b-0 rounded-t-xl px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5 select-none">
                  <div className="flex flex-wrap items-center gap-1">
                    {/* Always CAPS LOCK Toggle */}
                    <button
                      type="button"
                      onClick={toggleCapsLock}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                        isCapsLock
                          ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                          : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-250'
                      }`}
                      title={isCapsLock ? 'CAPS LOCK is ON: Everything typed will be in UPPERCASE. Click to toggle OFF.' : 'Click to enable always CAPS LOCK while typing'}
                    >
                      <span className="font-mono font-black text-[11px] px-1 py-0.2 bg-black/10 rounded">AA</span>
                      <span>CAPS LOCK</span>
                      <span className={`w-2 h-2 rounded-full ${isCapsLock ? 'bg-emerald-300 animate-pulse' : 'bg-gray-300'}`} />
                    </button>

                    <div className="h-4 w-px bg-gray-300 mx-0.5" />

                    {/* Quick Case Conversions */}
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('uppercase')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-700 border border-gray-250 cursor-pointer transition-colors"
                      title="Convert existing notes to ALL UPPERCASE"
                    >
                      UPPER
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('sentence')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-700 border border-gray-250 cursor-pointer transition-colors"
                      title="Convert existing notes to Sentence case"
                    >
                      Sentence
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('lowercase')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-700 border border-gray-250 cursor-pointer transition-colors"
                      title="Convert existing notes to lowercase"
                    >
                      lower
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Formatting Tools */}
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('bold')}
                      className="p-1.5 rounded-lg text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer transition-colors"
                      title="Bold text (**text**)"
                    >
                      <Bold size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('bullet')}
                      className="p-1.5 rounded-lg text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer transition-colors"
                      title="Insert bullet point (• )"
                    >
                      <List size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('number')}
                      className="p-1.5 rounded-lg text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer transition-colors"
                      title="Insert numbered list (1. )"
                    >
                      <ListOrdered size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('timestamp')}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer flex items-center gap-1 transition-colors"
                      title="Insert current date & time stamp"
                    >
                      <Clock size={12} />
                      <span className="hidden sm:inline">Time</span>
                    </button>
                  </div>
                </div>

                {/* Textarea with live uppercase support and voice input */}
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    className={`${INPUT} resize-y min-h-[110px] rounded-t-none pr-12 ${
                      isCapsLock ? 'uppercase' : ''
                    } ${
                      error && !form.notes.trim() ? 'border-red-400 ring-2 ring-red-100' : ''
                    }`}
                    rows={4}
                    placeholder={
                      isCapsLock
                        ? 'ENTER DETAILED SITE OBSERVATION NOTES (ALWAYS CAPS LOCK ACTIVE)...'
                        : 'Enter detailed site observation notes (Compulsory)...'
                    }
                    value={form.notes}
                    onChange={handleNotesChange}
                    required
                  />
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`absolute right-2.5 top-2.5 p-2 rounded-full transition-all shadow-sm z-10 ${
                      listening
                        ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 border border-gray-200'
                    }`}
                    title={listening ? 'Click to stop recording' : 'Voice to text conversion (Dictate notes)'}
                    aria-label={listening ? 'Stop recording' : 'Start voice to text'}
                  >
                    {listening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                </div>
              </div>

              {/* Live Listening & Transcription Feedback Banner */}
              {listening && (
                <div className="mt-2 p-2.5 bg-red-50/90 border border-red-200 rounded-xl flex items-start gap-2.5 shadow-xs">
                  <span className="w-2.5 h-2.5 mt-1 bg-red-500 rounded-full flex-shrink-0 animate-ping" />
                  <div className="text-xs text-red-900 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5 text-red-700">
                        <Mic size={13} className="text-red-600 animate-pulse" />
                        Listening… Speak clearly now
                      </span>
                      <button
                        type="button"
                        onClick={toggleVoice}
                        className="text-[11px] font-bold text-red-700 hover:text-red-900 bg-white/80 hover:bg-white px-2 py-0.5 rounded border border-red-200 shadow-xs cursor-pointer"
                      >
                        Done / Stop
                      </button>
                    </div>
                    <p className="text-red-600/80 text-[11px] mt-0.5">
                      Spoken words will automatically be converted to text and entered into your notes.
                    </p>
                    {interimText && (
                      <div className="mt-1.5 p-2 bg-white rounded-lg border border-red-200 text-gray-900 font-medium text-xs shadow-inner">
                        <span className="text-gray-400 mr-1.5 text-[10px] font-sans uppercase">Recognizing:</span>
                        "{isCapsLock ? interimText.toUpperCase() : interimText}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Field>

            {/* Reuse Observation Note from Same Report (Searchable Dropdown & Combobox) */}
            <div className="relative" ref={reuseDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Copy size={13} className="text-brand-600" />
                  <span>Reuse Note From This Report</span>
                </label>
                {reportNotes.length > 0 && (
                  <span className="text-[11px] text-gray-400 font-normal">
                    {reportNotes.length} note{reportNotes.length !== 1 ? 's' : ''} available
                  </span>
                )}
              </div>

              {/* Search Box & Dropdown Trigger */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Search size={14} className={reuseSearch ? 'text-brand-600' : 'text-gray-400'} />
                </div>
                <input
                  type="text"
                  value={reuseSearch}
                  disabled={reportNotes.length === 0}
                  onFocus={() => {
                    if (reportNotes.length > 0) setShowReuseDropdown(true)
                  }}
                  onChange={e => {
                    setReuseSearch(e.target.value)
                    setShowReuseDropdown(true)
                  }}
                  placeholder={
                    reportNotes.length === 0
                      ? 'No other observations in this report to reuse'
                      : 'Search keywords or click to select note from report…'
                  }
                  className={`${INPUT} pl-9 pr-16 bg-white border-brand-200 hover:border-brand-300 focus:border-brand-500 text-xs text-gray-800 disabled:opacity-60 disabled:cursor-not-allowed`}
                />
                <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center gap-0.5">
                  {reuseSearch && (
                    <button
                      type="button"
                      onClick={() => setReuseSearch('')}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
                      title="Clear keyword search"
                    >
                      <X size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={reportNotes.length === 0}
                    onClick={() => {
                      if (reportNotes.length > 0) {
                        setShowReuseDropdown(prev => !prev)
                      }
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 cursor-pointer disabled:opacity-40"
                    title="Toggle notes dropdown"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${showReuseDropdown ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>

              {/* Search Results Dropdown Menu */}
              {showReuseDropdown && reportNotes.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 z-40 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-fade-in"
                  style={{
                    maxHeight: '260px',
                    boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <div className="p-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {reuseSearch ? `Found ${filteredReportNotes.length} matching notes` : `All ${reportNotes.length} notes in report`}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Click note to append to observation
                    </span>
                  </div>

                  <div className="overflow-y-auto max-h-[210px] divide-y divide-gray-100">
                    {filteredReportNotes.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-500">
                        No notes found matching "{reuseSearch}"
                      </div>
                    ) : (
                      filteredReportNotes.map(n => {
                        const cleanNote = (n.notes || '').replace(/\s+/g, ' ').trim()
                        return (
                          <button
                            key={n.uuid}
                            type="button"
                            onClick={() => handleSelectReuseNote(n)}
                            className="w-full text-left p-2.5 hover:bg-brand-50/70 transition-colors cursor-pointer group flex items-start gap-2.5"
                          >
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
                              style={{ background: pinColor || '#a40e26' }}
                            >
                              #{n.itemNumber}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-xs font-bold text-gray-800">
                                  Observation #{n.itemNumber}
                                </span>
                                {n.trade && n.trade !== 'General' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-gray-100 text-gray-600">
                                    {n.trade}
                                  </span>
                                )}
                                {n.priority && (
                                  <span className="text-[10px] text-gray-400">
                                    • {n.priority}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                {cleanNote}
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-lg flex-shrink-0 mt-0.5 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                              + Append
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              {reusedSuccessMsg && (
                <p className="text-xs text-emerald-600 mt-1.5 font-medium flex items-center gap-1 animate-fade-in">
                  <Check size={13} className="text-emerald-500 flex-shrink-0" />
                  <span>{reusedSuccessMsg}</span>
                </p>
              )}
            </div>

            {/* Category + Due Date */}
            <div className="grid grid-cols-2 gap-3">
              {/* Customizable Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Category
                  </label>
                  <button
                    type="button"
                    onClick={openTradeManager}
                    className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold flex items-center gap-0.5 cursor-pointer"
                    title="Add or remove categories from list"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div className="relative">
                  <select
                    className={INPUT}
                    value={form.trade}
                    onChange={e => set('trade', e.target.value)}
                  >
                    {trades.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <Field label="Due Date">
                <input type="date" className={INPUT} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
              </Field>
            </div>

            {/* Status + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select className={INPUT} value={form.status} onChange={e => set('status', e.target.value)}>
                  {OBSERVATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className={INPUT} value={form.priority} onChange={e => set('priority', e.target.value)}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
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
            <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleDeletePin}
                disabled={deletingPin || saving}
                className="px-4 py-3 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 flex-shrink-0"
                title="Delete this observation"
              >
                <Trash2 size={16} />
                <span className="hidden xs:inline">Delete Item</span>
              </button>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || deletingPin}
                  className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-md"
                  style={{ background: 'var(--brand-button, #1d4ed8)' }}
                >
                  {saving ? <Spinner /> : <><Check size={18}/> Save Changes</>}
                </button>
              </div>
            </div>
          </div>

          {/* Floating Left / Right Navigation Arrows for Desktop view only (strictly hidden on phone view) */}
          {siblings.length > 1 && (
            <>
              {hasPrev && (
                <button
                  type="button"
                  onClick={handlePrevObservation}
                  disabled={saving}
                  className="hidden md:flex fixed left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white text-gray-800 shadow-2xl border border-gray-200 items-center justify-center hover:bg-brand-50 hover:text-brand-700 hover:scale-110 active:scale-95 transition-all z-30 cursor-pointer group"
                  title={`Previous Observation (#${prevItem?.itemNumber || ''})`}
                  aria-label="Previous observation"
                >
                  <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform text-gray-700" />
                </button>
              )}

              {hasNext && (
                <button
                  type="button"
                  onClick={handleNextObservation}
                  disabled={saving}
                  className="hidden md:flex fixed right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white text-gray-800 shadow-2xl border border-gray-200 items-center justify-center hover:bg-brand-50 hover:text-brand-700 hover:scale-110 active:scale-95 transition-all z-30 cursor-pointer group"
                  title={`Next Observation (#${nextItem?.itemNumber || ''})`}
                  aria-label="Next observation"
                >
                  <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform text-gray-700" />
                </button>
              )}
            </>
          )}
        </div>
      </ModalOverlay>

      {/* ── Trade / Category Management Full-Page View ── */}
      {showTradeManager && (
        <div className="fixed inset-0 z-[70] bg-gray-50 flex flex-col h-full w-full overflow-hidden select-none">
          {/* Header */}
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
                  type="button"
                  onClick={() => setShowTradeManager(false)}
                  className="p-2 -ml-2 rounded-full hover:bg-black/15 transition-colors flex items-center justify-center flex-shrink-0 text-white"
                  aria-label="Back"
                  title="Back"
                >
                  <ArrowLeft size={22} className="block" />
                </button>
                <div className="flex flex-col justify-center min-w-0">
                  <h1 className="text-xl font-bold tracking-tight leading-tight truncate">
                    Edit Category List
                  </h1>
                  <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">
                    Add new categories or remove items from the dropdown list
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTradeManager(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-black/15 rounded-full transition-colors ml-2"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-8 bg-gray-50">
            <div className="max-w-4xl mx-auto w-full space-y-5">
              {/* Add New Category Input Card */}
              <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4 space-y-2.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">
                  Add New Category
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTradeInput}
                    onChange={e => {
                      setNewTradeInput(e.target.value)
                      if (tradeError) setTradeError('')
                      if (tradeSuccess) setTradeSuccess('')
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateTrade()
                      }
                    }}
                    placeholder="e.g. Drywall, Flooring, Millwork, Roofing"
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder-gray-400"
                  />
                  <button
                    type="button"
                    onClick={handleCreateTrade}
                    className="sitepunch-btn-primary px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm flex-shrink-0 cursor-pointer"
                    style={{ background: 'var(--brand-button, #1d4ed8)' }}
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
                {tradeSuccess && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-medium flex items-center gap-1.5">
                    <Check size={14} className="text-emerald-600 flex-shrink-0" />
                    <span>{tradeSuccess}</span>
                  </p>
                )}
                {tradeError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-medium flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <span>{tradeError}</span>
                  </p>
                )}
              </div>

              {/* Current Categories List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Current Categories ({trades.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleResetTrades}
                    className="text-xs text-brand-700 hover:underline font-semibold cursor-pointer"
                    title="Restore standard list of categories"
                  >
                    Reset to Defaults
                  </button>
                </div>

                <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-xs">
                  {trades.map(t => {
                    const isOther = t.trim().toLowerCase() === 'other'
                    return (
                      <div
                        key={t}
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/80 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            set('trade', t)
                            setShowTradeManager(false)
                          }}
                          className="flex-1 text-left text-sm font-semibold text-gray-800 hover:text-brand-700 flex items-center gap-2 cursor-pointer"
                          title={`Select "${t}" for this punch item`}
                        >
                          <span>{t}</span>
                          {form.trade === t && (
                            <span className="text-[10px] font-bold bg-blue-50 text-brand-700 px-2 py-0.5 rounded-full border border-blue-200">
                              Active
                            </span>
                          )}
                          {isOther && (
                            <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                              Permanent
                            </span>
                          )}
                        </button>

                        {isOther ? (
                          <div
                            className="p-1.5 text-gray-400 flex items-center justify-center ml-2 cursor-not-allowed"
                            title='"Other" category is permanent and cannot be deleted or modified'
                          >
                            <Lock size={16} className="text-gray-400" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveTrade(t)}
                            className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2 cursor-pointer"
                            title={`Delete "${t}" (active punch items will automatically reassign to "Other")`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {trades.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      No categories in list. Add one above.
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
            <div className="max-w-4xl mx-auto w-full flex justify-end">
              <button
                type="button"
                onClick={() => setShowTradeManager(false)}
                className="sitepunch-btn-primary px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                style={{ background: 'var(--brand-button, #1d4ed8)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Annotation Overlay ── */}
      {annotatingPhoto && (
        <PhotoAnnotator
          imageDataUrl={annotatingPhoto.dataUrl}
          photoQuality={photoQuality || getStoredPhotoQuality()}
          onSave={saveAnnotatedPhoto}
          onCancel={() => setAnnotatingPhoto(null)}
        />
      )}
    </>
  )
}

function PhotoThumb({ photo, onEdit, onDelete }) {
  return (
    <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group">
      <img src={photo.imageData} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
        <button type="button" onClick={onEdit}   className="p-1.5 bg-white rounded-full text-brand-700" title="Edit photo markup"><Edit2 size={14}/></button>
        <button type="button" onClick={onDelete} className="p-1.5 bg-white rounded-full text-red-500" title="Delete photo"><Trash2 size={14}/></button>
      </div>
    </div>
  )
}
