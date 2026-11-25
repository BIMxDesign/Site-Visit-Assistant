import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Camera, Mic, MicOff, Trash2, Image as ImageIcon,
  Plus, Check, Edit2, AlertCircle, Tag, ArrowLeft, Lock, Copy,
  ChevronLeft, ChevronRight, MapPin, Search, ChevronDown, ChevronUp,
  Bold, Italic, Underline, List, ListOrdered, Clock, GripVertical
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  getPunchItem,
  savePunchItem,
  deletePunchItem,
  getPunchItems,
  getFloorPlan,
  getFloorPlans,
  getFloorPlansByPhase,
  getPhases,
  db,
  getPhotos,
  savePhoto,
  deletePhoto,
  getCustomTrades,
  saveCustomTrades,
  reassignPunchItemsTrade,
  DEFAULT_TRADES
} from '../db/database'
import { ModalOverlay, ModalHeader, Field, INPUT, Spinner } from './NewProjectModal'
import PhotoAnnotator from './PhotoAnnotator'
import InAppCameraModal from './InAppCameraModal'
import { v4 as uuidv4 } from 'uuid'
import { OBSERVATION_STATUSES, normalizeObservationStatus, stripHtmlToPlainText } from '../utils/formatters'
import { preparePhotoForQuality, getStoredPhotoQuality, readFileAsDataUrl } from '../utils/media'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

export function notesToHtml(notes) {
  if (!notes) return ''
  let html = String(notes)

  // If already contains HTML markup, return it
  if (/<(b|i|u|strong|em|ul|ol|li|p|div|br)\b/i.test(html)) {
    return html
  }

  // Convert markdown to HTML:
  // **bold** -> <b>bold</b>
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
  // *italic* -> <i>italic</i>
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')
  // __underline__ -> <u>underline</u>
  html = html.replace(/__(.*?)__/g, '<u>$1</u>')
  // Newlines -> <br>
  html = html.replace(/\r?\n/g, '<br>')

  return html
}

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
  const [loadError,   setLoadError]   = useState(false)
  const [photos,      setPhotos]      = useState([])
  const [saving,      setSaving]      = useState(false)
  const [deletingPin, setDeletingPin] = useState(false)
  const [error,       setError]       = useState('')

  // Sibling observations for desktop left/right navigation
  const [siblings,    setSiblings]    = useState([])

  // Report Observation Notes Reuse (Searchable Dropdown across all Site Visits in Project)
  const [reportNotes,       setReportNotes]       = useState([])
  const [reusedSuccessMsg,  setReusedSuccessMsg]  = useState('')
  const [reuseSearch,       setReuseSearch]       = useState('')
  const [reuseScope,        setReuseScope]        = useState('all') // 'all' | 'current' | 'other'
  const [showReuseDropdown, setShowReuseDropdown] = useState(false)
  const reuseDropdownRef = useRef(null)

  // Observation Notes Rich Text Editor
  const editorRef = useRef(null)
  const [activeStyles, setActiveStyles] = useState({ bold: false, italic: false, underline: false })

  // Observation Photos Drag & Drop Reordering
  const [draggedPhotoUuid, setDraggedPhotoUuid] = useState(null)
  const [dragOverPhotoUuid, setDragOverPhotoUuid] = useState(null)
  const photoDragRef = useRef(null)

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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null
          recognitionRef.current.onend = null
          recognitionRef.current.onerror = null
          recognitionRef.current.stop()
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
    setLoadError(false)
    let it = await getPunchItem(currentPunchItemUuid)
    if (!it) {
      // Retry in case database transaction is settling
      for (let attempt = 0; attempt < 5 && !it; attempt++) {
        await new Promise(r => setTimeout(r, 80))
        it = await getPunchItem(currentPunchItemUuid)
      }
    }
    if (!it) {
      setLoadError(true)
      return
    }
    const initialContent = it.notes || it.description || it.title || ''
    const notesHtml = notesToHtml(initialContent)
    setItem(it)
    itemRef.current = it
    hadNotesInitiallyRef.current = !!(initialContent && initialContent.trim().length > 0)
    isSavedRef.current = false
    setForm({
      title:      it.title      || '',
      notes:      notesHtml,
      trade:      it.trade      || 'General',
      priority:   it.priority   || 'Medium',
      status:     normalizeObservationStatus(it.status),
      assignedTo: it.assignedTo || '',
      dueDate:    it.dueDate    || '',
    })
    if (editorRef.current) {
      editorRef.current.innerHTML = notesHtml
    }
    const ph = await getPhotos(it.uuid)
    setPhotos(ph)
    initialLoadedUuid.current = currentPunchItemUuid

    // Load sibling observations and notes from the WHOLE site visit report
    try {
      let pUuid = it.phaseUuid || currentPhaseUuid || null
      let projUuid = it.projectUuid || currentProjectUuid || null

      if (it.floorPlanUuid) {
        const fp = await getFloorPlan(it.floorPlanUuid)
        if (fp) {
          if (!pUuid) pUuid = fp.phaseUuid || null
          if (!projUuid) projUuid = fp.projectUuid || null
        }
      }

      if (!pUuid && currentFloorPlanUuid) {
        const fp = await getFloorPlan(currentFloorPlanUuid)
        if (fp) {
          pUuid = fp.phaseUuid || null
          if (!projUuid) projUuid = fp.projectUuid || null
        }
      }

      if (projUuid && !pUuid) {
        const projPhases = await getPhases(projUuid)
        if (projPhases.length > 0) {
          for (const ph of projPhases) {
            const phFps = await getFloorPlansByPhase(ph.uuid)
            if (phFps.some(f => f.uuid === it.floorPlanUuid || f.uuid === currentFloorPlanUuid)) {
              pUuid = ph.uuid
              break
            }
          }
          if (!pUuid) {
            pUuid = projPhases[0].uuid
          }
        }
      }

      // Fetch all floor plans in this project
      const allProjFps = projUuid ? await getFloorPlans(projUuid) : await db.floorPlans.toArray()
      const allFpMap = new Map(allProjFps.map(f => [f.uuid, f]))

      // Fetch all phases/site visits in this project
      const allProjPhases = projUuid ? await getPhases(projUuid) : await db.phases.toArray()
      const phaseMap = new Map(allProjPhases.map(ph => [ph.uuid, ph]))

      // Current report floor plans
      let reportFps = []
      if (pUuid) {
        reportFps = allProjFps.filter(f => f.phaseUuid === pUuid)
      } else {
        reportFps = allProjFps
      }

      const fpSet = new Set(reportFps.map(f => f.uuid))
      if (it.floorPlanUuid) fpSet.add(it.floorPlanUuid)
      if (currentFloorPlanUuid) fpSet.add(currentFloorPlanUuid)
      const fpMap = new Map(allProjFps.map(f => [f.uuid, f.name]))

      // Load all observations in the project (or db)
      const allProjItems = projUuid ? await getPunchItems(projUuid) : await db.punchItems.toArray()

      // Whole Site Visit Report observations (current report):
      // Includes all observations in this phase/site visit report (direct or via any of its key plans)
      const wholeReportItems = allProjItems.filter(p => {
        if (pUuid && p.phaseUuid && String(p.phaseUuid).trim() === String(pUuid).trim()) return true
        if (p.floorPlanUuid && fpSet.has(p.floorPlanUuid)) return true
        if (!pUuid) return true
        return false
      })

      // Sibling observations for desktop left/right navigation (same drawing if opened from drawing, or report)
      let planSiblings = []
      if (currentFloorPlanUuid && it.floorPlanUuid === currentFloorPlanUuid) {
        planSiblings = allProjItems.filter(p => p.floorPlanUuid === currentFloorPlanUuid)
      } else {
        planSiblings = [...wholeReportItems]
      }
      if (!planSiblings.some(s => s.uuid === it.uuid)) {
        planSiblings.push(it)
      }
      planSiblings.sort((a, b) => {
        const numA = Number(a.itemNumber)
        const numB = Number(b.itemNumber)
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB
        }
        return (a.createdAt || 0) - (b.createdAt || 0)
      })
      setSiblings(planSiblings)

      // Notes from ALL site visits in this project (searchable & reusable across visits):
      const validNotes = allProjItems
        .filter(p => p.uuid !== it.uuid && p.notes && stripHtmlToPlainText(p.notes).trim().length > 0)
        .map(p => {
          const drawing = allFpMap.get(p.floorPlanUuid)
          const drawingName = drawing?.name || fpMap.get(p.floorPlanUuid) || ''

          let itemPhaseUuid = p.phaseUuid || drawing?.phaseUuid || null
          if (!itemPhaseUuid && allProjPhases.length > 0) {
            itemPhaseUuid = allProjPhases[0].uuid
          }
          const itemPhase = itemPhaseUuid ? phaseMap.get(itemPhaseUuid) : null
          const phaseName = itemPhase?.name || (itemPhaseUuid === pUuid ? 'This Report' : 'Site Visit')

          const isCurrentReport = Boolean(
            (pUuid && itemPhaseUuid && String(itemPhaseUuid).trim() === String(pUuid).trim()) ||
            (p.floorPlanUuid && fpSet.has(p.floorPlanUuid)) ||
            (!pUuid)
          )

          return {
            ...p,
            drawingName,
            phaseUuid: itemPhaseUuid,
            phaseName,
            isCurrentReport,
          }
        })

      // Sort notes: current report notes first (by itemNumber), then other site visits (by phase & itemNumber)
      validNotes.sort((a, b) => {
        if (a.isCurrentReport !== b.isCurrentReport) {
          return a.isCurrentReport ? -1 : 1
        }
        if (a.phaseName !== b.phaseName) {
          return (a.phaseName || '').localeCompare(b.phaseName || '')
        }
        const numA = Number(a.itemNumber)
        const numB = Number(b.itemNumber)
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB
        }
        return (a.createdAt || 0) - (b.createdAt || 0)
      })

      setReportNotes(validNotes)
    } catch (err) {
      console.error('Failed to load site visit report observations:', err)
      setReportNotes([])
      setSiblings([])
    }
  }, [currentPunchItemUuid, currentPhaseUuid, currentProjectUuid, currentFloorPlanUuid])

  useEffect(() => {
    if (currentPunchItemUuid !== initialLoadedUuid.current) {
      loadInitialData()
    }
  }, [currentPunchItemUuid, loadInitialData])

  // Set initial content into rich text editor once mounted or when switching observations
  useEffect(() => {
    if (editorRef.current && item) {
      const targetHtml = notesToHtml(item.notes || '')
      if (editorRef.current.innerHTML !== targetHtml) {
        editorRef.current.innerHTML = targetHtml
      }
    }
  }, [item?.uuid])

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
    const plainNotes = stripHtmlToPlainText(form.notes || '')
    if (item && plainNotes) {
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

  // Update toolbar active formatting indicators (bold, italic, underline)
  const updateActiveStyles = useCallback(() => {
    try {
      setActiveStyles({
        bold: Boolean(document.queryCommandState && document.queryCommandState('bold')),
        italic: Boolean(document.queryCommandState && document.queryCommandState('italic')),
        underline: Boolean(document.queryCommandState && document.queryCommandState('underline')),
      })
    } catch (_) {}
  }, [])

  // Sync editor content with form state
  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    const plain = (editorRef.current.innerText || '').trim()
    setError('')
    setForm(f => ({ ...f, notes: plain ? html : '' }))
    updateActiveStyles()
  }, [updateActiveStyles])

  // Rich Text Formatting Actions (Bold, Italic, Underline, Bullet Lists, Numbered Lists, Timestamp)
  const applyFormatting = useCallback((type) => {
    const el = editorRef.current
    if (!el) return
    el.focus()

    if (type === 'bold') {
      document.execCommand('bold', false, null)
    } else if (type === 'italic') {
      document.execCommand('italic', false, null)
    } else if (type === 'underline') {
      document.execCommand('underline', false, null)
    } else if (type === 'bullet') {
      document.execCommand('insertUnorderedList', false, null)
    } else if (type === 'number') {
      document.execCommand('insertOrderedList', false, null)
    } else if (type === 'timestamp') {
      const now = new Date()
      const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      const dateStr = now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
      const stamp = `[${dateStr} ${timeStr}] `
      document.execCommand('insertText', false, stamp)
    }

    handleEditorInput()
    updateActiveStyles()
  }, [handleEditorInput, updateActiveStyles])

  // Case Conversion on Selection or Full Text
  const applyCaseConversion = useCallback((caseType) => {
    const el = editorRef.current
    if (!el) return
    el.focus()

    const transform = (str) => {
      if (caseType === 'uppercase') return str.toUpperCase()
      if (caseType === 'lowercase') return str.toLowerCase()
      if (caseType === 'sentence') return str.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
      if (caseType === 'title') return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
      return str
    }

    const sel = window.getSelection()
    const selectedText = sel ? sel.toString() : ''

    if (selectedText && selectedText.trim()) {
      document.execCommand('insertText', false, transform(selectedText))
      handleEditorInput()
    } else {
      const fullText = el.innerText
      if (fullText) {
        el.innerText = transform(fullText)
        handleEditorInput()
      }
    }
  }, [handleEditorInput])

  // Reuse previous observation note: Keep text already inside box and append copied text after that!
  const handleSelectReuseNote = (found) => {
    if (!found) return
    const incomingHtml = notesToHtml(found.notes || '')
    if (editorRef.current) {
      editorRef.current.focus()
      const existing = editorRef.current.innerHTML.trim()
      const merged = existing ? `${existing}<br>${incomingHtml}` : incomingHtml
      editorRef.current.innerHTML = merged
      handleEditorInput()
    } else {
      setForm(prev => {
        const existing = (prev.notes || '').trim()
        const addition = incomingHtml.trim()
        const merged = existing ? `${existing}<br>${addition}` : addition
        return {
          ...prev,
          notes: merged,
          trade: (prev.trade === 'General' || !prev.trade) && found.trade ? found.trade : prev.trade,
          priority: (prev.priority === 'Medium' || !prev.priority) && found.priority ? found.priority : prev.priority,
        }
      })
    }
    setError('')
    setShowReuseDropdown(false)
    setReuseSearch('')
    setReusedSuccessMsg(`Appended note from Observation #${found.itemNumber || ''}${found.phaseName && !found.isCurrentReport ? ` (${found.phaseName})` : ''}`)
    setTimeout(() => {
      setReusedSuccessMsg('')
    }, 3500)
  }

  // ── Observation Photos Drag & Drop Rearranging ─────────────────────────────
  const handleReorderPhotos = async (sourceUuid, targetUuid) => {
    if (!sourceUuid || !targetUuid || sourceUuid === targetUuid) return
    const currentList = [...photos]
    const fromIdx = currentList.findIndex(p => p.uuid === sourceUuid)
    const toIdx = currentList.findIndex(p => p.uuid === targetUuid)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return

    const [moved] = currentList.splice(fromIdx, 1)
    currentList.splice(toIdx, 0, moved)

    setPhotos(currentList)

    for (let i = 0; i < currentList.length; i++) {
      await db.photos.where('uuid').equals(currentList[i].uuid).modify({
        order: i,
      })
    }
  }

  const handlePhotoDragStart = (e, uuid) => {
    e.dataTransfer.setData('text/plain', uuid)
    setDraggedPhotoUuid(uuid)
  }

  const handlePhotoDragOver = (e, uuid) => {
    e.preventDefault()
    if (draggedPhotoUuid && draggedPhotoUuid !== uuid) {
      setDragOverPhotoUuid(uuid)
    }
  }

  const handlePhotoDrop = async (e, targetUuid) => {
    e.preventDefault()
    const sourceUuid = e.dataTransfer.getData('text/plain') || draggedPhotoUuid
    setDraggedPhotoUuid(null)
    setDragOverPhotoUuid(null)
    if (sourceUuid && targetUuid && sourceUuid !== targetUuid) {
      await handleReorderPhotos(sourceUuid, targetUuid)
    }
  }

  const handlePhotoDragEnd = () => {
    setDraggedPhotoUuid(null)
    setDragOverPhotoUuid(null)
  }

  // Mobile & iPad Touch / Pointer Dragging for Photos
  const handlePhotoPointerDown = (e, uuid, index) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    photoDragRef.current = {
      pointerId: e.pointerId,
      uuid,
      index,
      startX: e.clientX,
      hasMoved: false,
    }
  }

  const handlePhotoPointerMove = (e) => {
    if (!photoDragRef.current) return
    const dx = Math.abs(e.clientX - photoDragRef.current.startX)
    if (!photoDragRef.current.hasMoved && dx > 8) {
      photoDragRef.current.hasMoved = true
      setDraggedPhotoUuid(photoDragRef.current.uuid)
    }
    if (!photoDragRef.current.hasMoved) return

    const elem = document.elementFromPoint(e.clientX, e.clientY)
    const card = elem?.closest('[data-photo-uuid]')
    if (card) {
      const targetUuid = card.getAttribute('data-photo-uuid')
      if (targetUuid && targetUuid !== photoDragRef.current.uuid) {
        setDragOverPhotoUuid(targetUuid)
      }
    }
  }

  const handlePhotoPointerUp = async () => {
    if (!photoDragRef.current) return
    const { uuid, hasMoved } = photoDragRef.current
    const targetUuid = dragOverPhotoUuid
    photoDragRef.current = null
    setDraggedPhotoUuid(null)
    setDragOverPhotoUuid(null)

    if (hasMoved && targetUuid && targetUuid !== uuid) {
      await handleReorderPhotos(uuid, targetUuid)
    }
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

    const plainNotes = stripHtmlToPlainText(form.notes || '')
    if (!plainNotes) {
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
    const currentItem = item || itemRef.current
    if (currentItem && !hadNotesInitiallyRef.current && !isSavedRef.current) {
      isSavedRef.current = true
      try {
        await deletePunchItem(currentItem.uuid)
      } catch (err) {
        console.error('Failed to clean up unsaved blank pin:', err)
      }
    }
    closePunchForm()
  }

  // ── Voice to text (Robust, continuous, multi-platform) ───────────────────
  function appendSpeechToNotes(text) {
    const clean = (text || '').trim()
    if (!clean) return
    if (editorRef.current) {
      editorRef.current.focus()
      const cur = editorRef.current.innerHTML.trim()
      const sep = cur && !cur.endsWith(' ') && !cur.endsWith('<br>') && !cur.endsWith('&nbsp;') ? ' ' : ''
      try {
        document.execCommand('insertText', false, `${sep}${clean}`)
      } catch {
        editorRef.current.innerHTML = `${editorRef.current.innerHTML}${sep}${clean}`
      }
      handleEditorInput()
    } else {
      setForm(prev => {
        const current = (prev.notes || '').trim()
        if (!current) return { ...prev, notes: clean }
        return { ...prev, notes: `${current} ${clean}` }
      })
    }
  }

  function stopVoiceSession() {
    isListeningRef.current = false
    setListening(false)

    // Commit any pending interim speech so words aren't lost
    const pending = (latestInterimRef.current || '').trim()
    latestInterimRef.current = ''
    setInterimText('')
    if (pending) {
      appendSpeechToNotes(pending)
    }

    if (recognitionRef.current) {
      const rec = recognitionRef.current
      recognitionRef.current = null
      try {
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.stop()
      } catch {
        try {
          rec.abort()
        } catch {}
      }
    }
  }

  async function startRecognitionSession() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SR) {
      setError('Voice recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari, and ensure you are connected via HTTPS or localhost.')
      setListening(false)
      isListeningRef.current = false
      return
    }

    // Proactively verify / request microphone permission
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Immediately stop the probe track so SpeechRecognition has exclusive mic access
        stream.getTracks().forEach(t => t.stop())
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Microphone permission blocked. Please allow microphone access in your browser or device settings.')
          setListening(false)
          isListeningRef.current = false
          return
        }
      }
    }

    // Clean up any lingering previous session before starting fresh
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }

    try {
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.maxAlternatives = 1

      // Reset index tracking for this session
      processedFinalIndicesRef.current = new Set()
      latestInterimRef.current = ''
      setInterimText('')
      setError('')

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
          // Normal brief pause while user is thinking; do not kill session or show error
          return
        }
        if (e.error === 'aborted') {
          // Normal user abort/stop; do not show error
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
        setError(`Voice input notice: ${e.error}`)
      }

      rec.onend = () => {
        // Commit any remaining unfinalized interim speech
        const pending = (latestInterimRef.current || '').trim()
        latestInterimRef.current = ''
        setInterimText('')
        if (pending) {
          appendSpeechToNotes(pending)
        }

        // Clean teardown so subsequent taps start freshly and reliably
        isListeningRef.current = false
        setListening(false)
        recognitionRef.current = null
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

  const [showInAppCamera, setShowInAppCamera] = useState(false)

  function handleCameraCapture() {
    if (photos.length >= MAX_PHOTOS) {
      alert(`Maximum ${MAX_PHOTOS} images can be uploaded to a punch list item.`)
      return
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
    }
    // Open in-app camera modal to keep photos outside of personal photo gallery
    setShowInAppCamera(true)
  }

  async function handleInAppPhotoCaptured(capturedDataUrl) {
    setShowInAppCamera(false)
    if (item) {
      await savePunchItem({ ...item, ...form })
    }
    const activeQuality = photoQuality || getStoredPhotoQuality()
    const preparedDataUrl = await preparePhotoForQuality(capturedDataUrl, activeQuality)
    setAnnotatingPhoto({ uuid: null, dataUrl: preparedDataUrl })
  }

  async function handleStartEditPhoto(photo) {
    if (item) {
      await savePunchItem({ ...item, ...form })
    }
    setAnnotatingPhoto({ uuid: photo.uuid, dataUrl: photo.imageData })
  }

  async function saveAnnotatedPhoto(annotatedDataUrl) {
    const photoUuid = (annotatingPhoto && annotatingPhoto.uuid) || uuidv4()

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
    const plainNotes = stripHtmlToPlainText(form.notes || '')
    if (!plainNotes) {
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

  // Filtered notes for keyword search in reuse notes dropdown across all Site Visits
  const filteredReportNotes = reportNotes.filter(n => {
    if (reuseScope === 'current' && !n.isCurrentReport) return false
    if (reuseScope === 'other' && n.isCurrentReport) return false

    if (!reuseSearch.trim()) return true
    const q = reuseSearch.toLowerCase().trim()
    const notesMatch = (n.notes || '').toLowerCase().includes(q)
    const itemNumMatch = String(n.itemNumber || '').includes(q) || `#${n.itemNumber}`.includes(q)
    const tradeMatch = (n.trade || '').toLowerCase().includes(q)
    const titleMatch = (n.title || '').toLowerCase().includes(q)
    const drawingMatch = (n.drawingName || '').toLowerCase().includes(q)
    const phaseMatch = (n.phaseName || '').toLowerCase().includes(q)
    return notesMatch || itemNumMatch || tradeMatch || titleMatch || drawingMatch || phaseMatch
  })

  const currentReportNotesCount = reportNotes.filter(n => n.isCurrentReport).length
  const otherReportNotesCount = reportNotes.filter(n => !n.isCurrentReport).length

  if (!item) {
    return (
      <ModalOverlay onClose={handleCancel}>
        <div className="w-full h-full flex flex-col flex-1 overflow-hidden bg-gray-50">
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
            <div className="flex items-center justify-between min-h-[46px] max-w-4xl mx-auto w-full px-0 md:px-16 lg:px-20">
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
                  <h1 className="text-xl font-bold tracking-tight leading-tight truncate">
                    {loadError ? 'Observation Not Found' : 'Loading Observation…'}
                  </h1>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            {loadError ? (
              <div className="flex flex-col items-center gap-3 max-w-sm">
                <AlertCircle size={40} className="text-amber-500" />
                <p className="text-sm font-semibold text-gray-800">
                  This observation could not be loaded or may have been removed.
                </p>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="mt-2 px-5 py-2.5 bg-brand-700 hover:bg-brand-800 text-white font-semibold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                  style={{ background: 'var(--brand-button, #1d4ed8)' }}
                >
                  Return to Key Plan
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-semibold text-gray-600">Loading observation details…</p>
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>
    )
  }

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
            <div className="flex items-center justify-between min-h-[46px] max-w-4xl mx-auto w-full px-0 md:px-16 lg:px-20">
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
            </div>
          </header>

          <div
            className="flex-1 overflow-y-auto py-4 sm:py-6 pb-8 bg-gray-50"
            style={{
              paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
              paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
            }}
          >
            <div className="max-w-4xl mx-auto w-full space-y-4 px-0 md:px-16 lg:px-20">
              {/* Compulsory Validation Error Alert */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Photos - Center Aligned */}
              <div
                className="flex flex-col items-center text-center"
                onPointerMove={handlePhotoPointerMove}
                onPointerUp={handlePhotoPointerUp}
                onPointerCancel={handlePhotoPointerUp}
              >
                <div className="flex items-center justify-between w-full max-w-md px-1 mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">
                    Photos ({photos.length} / {MAX_PHOTOS})
                  </label>
                  {photos.length > 1 && (
                    <span className="text-[11px] text-gray-400 font-medium select-none">
                      Drag photos to rearrange
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 mt-1 flex-wrap w-full">
                  {photos.map((ph, idx) => (
                    <div
                      key={ph.uuid}
                      data-photo-uuid={ph.uuid}
                      draggable
                      onDragStart={(e) => handlePhotoDragStart(e, ph.uuid)}
                      onDragOver={(e) => handlePhotoDragOver(e, ph.uuid)}
                      onDrop={(e) => handlePhotoDrop(e, ph.uuid)}
                      onDragEnd={handlePhotoDragEnd}
                      className={`w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 transition-all duration-150 ${
                        draggedPhotoUuid === ph.uuid ? 'opacity-40 scale-95' : ''
                      } ${
                        dragOverPhotoUuid === ph.uuid ? 'ring-2 ring-brand-500 rounded-xl scale-105' : ''
                      }`}
                    >
                      <PhotoThumb
                        photo={ph}
                        index={idx + 1}
                        onGripPointerDown={(e) => handlePhotoPointerDown(e, ph.uuid, idx)}
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Combined Case Selection Dropdown */}
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          applyCaseConversion(e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className="bg-white hover:bg-gray-100 text-gray-700 text-[11px] font-medium px-2 py-1 rounded-lg border border-gray-250 cursor-pointer focus:outline-none shadow-2xs transition-colors"
                      title="Change text case"
                    >
                      <option value="" disabled>Aa Case</option>
                      <option value="uppercase">UPPERCASE</option>
                      <option value="sentence">Sentence case</option>
                      <option value="title">Title Case</option>
                      <option value="lowercase">lowercase</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Formatting Tools */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyFormatting('bold')
                      }}
                      className={`p-1.5 rounded-lg border cursor-pointer transition-all shadow-2xs ${
                        activeStyles.bold
                          ? 'bg-brand-100 text-brand-800 border-brand-400 font-bold ring-1 ring-brand-300'
                          : 'text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border-gray-250'
                      }`}
                      title="Bold (Ctrl+B)"
                    >
                      <Bold size={13} strokeWidth={activeStyles.bold ? 3 : 2} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyFormatting('italic')
                      }}
                      className={`p-1.5 rounded-lg border cursor-pointer transition-all shadow-2xs ${
                        activeStyles.italic
                          ? 'bg-brand-100 text-brand-800 border-brand-400 font-bold ring-1 ring-brand-300'
                          : 'text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border-gray-250'
                      }`}
                      title="Italic (Ctrl+I)"
                    >
                      <Italic size={13} strokeWidth={activeStyles.italic ? 3 : 2} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyFormatting('underline')
                      }}
                      className={`p-1.5 rounded-lg border cursor-pointer transition-all shadow-2xs ${
                        activeStyles.underline
                          ? 'bg-brand-100 text-brand-800 border-brand-400 font-bold ring-1 ring-brand-300'
                          : 'text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border-gray-250'
                      }`}
                      title="Underline (Ctrl+U)"
                    >
                      <Underline size={13} strokeWidth={activeStyles.underline ? 3 : 2} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyFormatting('bullet')
                      }}
                      className="p-1.5 rounded-lg text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer transition-colors shadow-2xs"
                      title="Insert bullet point list"
                    >
                      <List size={13} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyFormatting('number')
                      }}
                      className="p-1.5 rounded-lg text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer transition-colors shadow-2xs"
                      title="Insert sequential numbered list"
                    >
                      <ListOrdered size={13} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyFormatting('timestamp')
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium text-gray-700 hover:text-brand-700 bg-white hover:bg-gray-100 border border-gray-250 cursor-pointer flex items-center gap-1 transition-colors shadow-2xs"
                      title="Insert current date & time stamp"
                    >
                      <Clock size={12} />
                      <span className="hidden sm:inline">Time</span>
                    </button>
                  </div>
                </div>

                {/* Rich-Text ContentEditable Editor with live formatting preview */}
                <div className="relative">
                  {!form.notes && (
                    <div className="absolute top-2.5 left-3 text-sm text-gray-400 pointer-events-none select-none z-10">
                      Enter detailed site observation notes (Compulsory)...
                    </div>
                  )}
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    className={`${INPUT} sitepunch-editor min-h-[110px] max-h-[380px] overflow-y-auto rounded-t-none pr-12 text-sm text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 leading-relaxed ${
                      error && !form.notes ? 'border-red-400 ring-2 ring-red-100' : ''
                    }`}
                    onInput={handleEditorInput}
                    onKeyUp={updateActiveStyles}
                    onMouseUp={updateActiveStyles}
                    onTouchEnd={updateActiveStyles}
                    onBlur={handleEditorInput}
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
                        "{interimText}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Field>

            {/* Reuse Observation Note from Same Project / Different Site Visits (Searchable Dropdown & Combobox) */}
            <div className="relative" ref={reuseDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Copy size={13} className="text-brand-600" />
                  <span>Reuse Note (All Site Visits)</span>
                </label>
                {reportNotes.length > 0 && (
                  <span className="text-[11px] text-gray-400 font-normal">
                    {reportNotes.length} note{reportNotes.length !== 1 ? 's' : ''} across project
                    {otherReportNotesCount > 0 && ` (${otherReportNotesCount} from other visits)`}
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
                      ? 'No observations in project to reuse'
                      : 'Search keywords or click to select note from any site visit…'
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
                    maxHeight: '300px',
                    boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  {/* Top Bar with Filter Tabs */}
                  <div className="p-2 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {reuseSearch ? `Found ${filteredReportNotes.length} matching notes` : `All ${filteredReportNotes.length} notes`}
                    </span>
                    {otherReportNotesCount > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReuseScope('all')}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer text-[10px] ${
                            reuseScope === 'all'
                              ? 'bg-brand-600 text-white'
                              : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          All ({reportNotes.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setReuseScope('current')}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer text-[10px] ${
                            reuseScope === 'current'
                              ? 'bg-brand-600 text-white'
                              : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          This Report ({currentReportNotesCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setReuseScope('other')}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer text-[10px] ${
                            reuseScope === 'other'
                              ? 'bg-brand-600 text-white'
                              : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Other Visits ({otherReportNotesCount})
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-y-auto max-h-[240px] divide-y divide-gray-100">
                    {filteredReportNotes.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-500">
                        {reuseSearch
                          ? `No notes found matching "${reuseSearch}"`
                          : 'No notes available in this view'}
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
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <span className="text-xs font-bold text-gray-800">
                                  Observation #{n.itemNumber}
                                </span>
                                {n.phaseName && (
                                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-medium border ${
                                    n.isCurrentReport
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}>
                                    {n.isCurrentReport ? 'This Report' : n.phaseName}
                                  </span>
                                )}
                                {n.drawingName && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-md font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    {n.drawingName}
                                  </span>
                                )}
                                {n.trade && n.trade !== 'General' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-md font-medium bg-gray-100 text-gray-600">
                                    {n.trade}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                {cleanNote}
                              </p>
                            </div>
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
            <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3 px-0 md:px-16 lg:px-20">
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
                  className="hidden md:flex fixed top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white text-gray-800 shadow-2xl border border-gray-200 items-center justify-center hover:bg-brand-50 hover:text-brand-700 hover:scale-110 active:scale-95 transition-all z-30 cursor-pointer group"
                  style={{
                    left: 'max(0.75rem, calc(50% - 448px - 3.75rem))',
                  }}
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
                  className="hidden md:flex fixed top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white text-gray-800 shadow-2xl border border-gray-200 items-center justify-center hover:bg-brand-50 hover:text-brand-700 hover:scale-110 active:scale-95 transition-all z-30 cursor-pointer group"
                  style={{
                    right: 'max(0.75rem, calc(50% - 448px - 3.75rem))',
                  }}
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
            <div className="flex items-center justify-between min-h-[46px] max-w-4xl mx-auto w-full px-0 md:px-16 lg:px-20">
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

      {/* ── In-App Camera Viewfinder (Photos Kept Outside Phone Gallery) ── */}
      <InAppCameraModal
        isOpen={showInAppCamera}
        onClose={() => setShowInAppCamera(false)}
        onCapture={handleInAppPhotoCaptured}
        onFallbackFilePick={() => fileInputRef.current?.click()}
      />
    </>
  )
}

function PhotoThumb({ photo, index, onGripPointerDown, onEdit, onDelete }) {
  return (
    <div className="relative w-full h-full aspect-square rounded-xl overflow-hidden border border-gray-200 group bg-gray-100 shadow-2xs select-none">
      <img src={photo.imageData} alt="" className="w-full h-full object-cover pointer-events-none" />

      {/* Photo Order Badge (1st photo is main observation thumbnail) */}
      <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none z-10 flex items-center gap-1 shadow-xs">
        <span>#{index}</span>
        {index === 1 && <span className="text-[9px] text-emerald-300 font-semibold uppercase">Main</span>}
      </div>

      {/* Touch / Pointer Grip Handle for Mobile / iPad */}
      <div
        onPointerDown={onGripPointerDown}
        className="absolute bottom-1.5 left-1.5 p-1 bg-black/50 hover:bg-black/70 text-white/90 hover:text-white rounded-md cursor-grab active:cursor-grabbing z-10 touch-none shadow-xs"
        title="Drag to rearrange photo position"
      >
        <GripVertical size={14} />
      </div>

      {/* Edit & Delete hover/tap overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 bg-white hover:bg-gray-100 rounded-full text-brand-700 shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95"
          title="Edit photo markup"
        >
          <Edit2 size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 bg-white hover:bg-gray-100 rounded-full text-red-600 shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95"
          title="Delete photo"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
