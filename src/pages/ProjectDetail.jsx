import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft, Plus, FileImage, Trash2, ChevronRight, ChevronLeft,
  FileText, AlertCircle, CheckCircle, Clock, MoreVertical,
  Download, Share2, Edit2, Filter, Check, ClipboardList,
  ChevronDown, ChevronUp, MapPin, Calendar, CloudSun, Users,
  GripVertical, Layers, ListOrdered, FolderOpen, Camera, User, Home,
  Search, X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  db,
  getProject, saveProject,
  getFloorPlans, deleteFloorPlan, sortFloorPlans, reorderFloorPlans,
  getPunchItems, deletePunchItem, resequenceReportPins,
  ensureProjectPhases, deletePhase
} from '../db/database'
import FloorPlanThumbnail from '../components/FloorPlanThumbnail'
import FloorPlanManagerModal from '../components/FloorPlanManagerModal'
import RenameFloorPlanModal from '../components/RenameFloorPlanModal'
import EditProjectModal from '../components/EditProjectModal'
import PhaseModal from '../components/PhaseModal'
import Breadcrumbs from '../components/Breadcrumbs'
import ObservationStatusSelect from '../components/ObservationStatusSelect'
import { formatVisitDateTime, formatAttendeesTruncated, formatAttendeesSummary, truncateObservationTitle, formatDatePattern, normalizeObservationStatus } from '../utils/formatters'
import { hexToRgb } from '../utils/theme'

const REPORT_FILTER_OPTIONS = [
  { id: 'All',           label: 'All Site Visits' },
  { id: 'Date (Newest)', label: 'Date (Newest)' },
  { id: 'Date (Oldest)', label: 'Date (Oldest)' },
  { id: 'Name (A-Z)',    label: 'Name (A–Z)' },
  { id: 'Name (Z-A)',    label: 'Name (Z–A)' },
  { id: 'Key Plans',     label: 'With Key Plans' },
  { id: 'List Only',     label: 'List Only' },
]

const PRIORITY_BADGES = {
  Critical: 'bg-red-100 text-red-700',
  High:     'bg-orange-100 text-orange-700',
  Medium:   'bg-yellow-100 text-yellow-700',
  Low:      'bg-blue-100 text-blue-700',
}

export default function ProjectDetail() {
  const {
    currentProjectUuid,
    currentPhaseUuid, setCurrentPhase,
    navigateToDashboard, navigateToProjects, navigateToFloorPlan,
    openFloorPlanManager, showFloorPlanManager, closeFloorPlanManager,
    openPDFPreview, openPunchForm, setCurrentPunchItem,
    currentPunchItemUuid,
    showPunchForm,
    pinColor,
  } = useAppStore()

  const { r: pinR, g: pinG, b: pinB } = hexToRgb(pinColor)

  const [project,       setProject]       = useState(null)
  const [phases,        setPhases]        = useState([])
  const [floorPlans,    setFloorPlans]    = useState([])
  const [punchItems,    setPunchItems]    = useState([])
  const [totalPhotos,   setTotalPhotos]   = useState(0)
  const [activeTab,     setActiveTab]     = useState('floorplans') // floorplans (Phases & Drawings) | punchlist
  const [loading,       setLoading]       = useState(true)
  const [renamingFp,    setRenamingFp]    = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPhaseModal, setShowPhaseModal] = useState(false)
  const [editingPhase,  setEditingPhase]  = useState(null)
  const [expandedFpUuids, setExpandedFpUuids] = useState(new Set())
  const [searchQuery,   setSearchQuery]   = useState('')
  const [siteVisitSearchQuery, setSiteVisitSearchQuery] = useState('')
  const [overviewTab,   setOverviewTab]   = useState('sitevisits') // 'sitevisits' | 'keyplans' | 'punchitems' | 'images'
  const [galleryPhotos, setGalleryPhotos] = useState([])
  const [previewPhoto,  setPreviewPhoto]  = useState(null)
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(null)

  const toggleFpAccordion = (fpUuid) => {
    setExpandedFpUuids(prev => {
      const next = new Set(prev)
      if (next.has(fpUuid)) {
        next.delete(fpUuid)
      } else {
        next.add(fpUuid)
      }
      return next
    })
  }
  const [targetPhaseUuid, setTargetPhaseUuid] = useState(null)
  const [filter,        setFilter]        = useState('All')
  const [showFilter,    setShowFilter]    = useState(false)
  const [fabOpen,       setFabOpen]       = useState(false)
  const fabTimerRef = useRef(null)

  const handleFabMouseEnter = () => {
    if (fabTimerRef.current) clearTimeout(fabTimerRef.current)
    setFabOpen(true)
  }

  const handleFabMouseLeave = () => {
    fabTimerRef.current = setTimeout(() => {
      setFabOpen(false)
    }, 200)
  }

  const load = useCallback(async () => {
    if (!currentProjectUuid) return
    const [proj, phaseList, rawFps] = await Promise.all([
      getProject(currentProjectUuid),
      ensureProjectPhases(currentProjectUuid),
      getFloorPlans(currentProjectUuid),
    ])

    // Always maintain continuous sequence across drawings in drawing order
    const activePhaseObj = phaseList.find(p => p.uuid === currentPhaseUuid) || (phaseList.length > 0 ? phaseList[0] : null)
    if (activePhaseObj) {
      await resequenceReportPins(currentProjectUuid, activePhaseObj.uuid)
    }

    const [fps, rawItems] = await Promise.all([
      getFloorPlans(currentProjectUuid),
      getPunchItems(currentProjectUuid),
    ])

    // Auto-clean any abandoned blank observations (created without saved notes)
    const blankItems = rawItems.filter(i => {
      const hasNotes = i.notes && i.notes.trim().length > 0
      const isActivelyBeingCreated = showPunchForm && i.uuid === currentPunchItemUuid
      return !hasNotes && !isActivelyBeingCreated
    })

    let items = rawItems
    if (blankItems.length > 0) {
      for (const b of blankItems) {
        await db.photos.where('punchItemUuid').equals(b.uuid).delete()
        await db.punchItems.where('uuid').equals(b.uuid).delete()
      }
      if (activePhaseObj) {
        await resequenceReportPins(currentProjectUuid, activePhaseObj.uuid)
      } else {
        await resequenceReportPins({ projectUuid: currentProjectUuid })
      }
      items = await getPunchItems(currentProjectUuid)
    }

    setProject(proj)
    setPhases(phaseList)
    setFloorPlans(sortFloorPlans(fps))
    setPunchItems(items)

    const itemUuids = items.map(i => i.uuid)
    let photosList = []
    if (itemUuids.length > 0) {
      photosList = await db.photos.where('punchItemUuid').anyOf(itemUuids).toArray().catch(() => [])
      photosList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    }
    setGalleryPhotos(photosList)
    setTotalPhotos(photosList.length)
    // Update counts on project
    if (proj) {
      await saveProject({ ...proj, totalItems: items.length })
    }
    setLoading(false)
  }, [currentProjectUuid, currentPhaseUuid])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!showFloorPlanManager) load() }, [showFloorPlanManager])
  useEffect(() => { if (!showPunchForm) load() }, [showPunchForm, load])

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilter) return
    const handleClickOutside = (e) => {
      if (!e.target.closest('#report-filter-container')) {
        setShowFilter(false)
      }
    }
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [showFilter])

  // Filter & sort reports
  const filteredPhases = useMemo(() => {
    let list = [...phases]

    if (siteVisitSearchQuery.trim()) {
      const q = siteVisitSearchQuery.trim().toLowerCase()
      list = list.filter(phase => {
        const nameMatch = (phase.name || '').toLowerCase().includes(q)
        const dateMatch = (phase.visitDate || '').toLowerCase().includes(q)
        const weatherMatch = (phase.weather || '').toLowerCase().includes(q)
        const attendeesMatch = (phase.attendees || '').toLowerCase().includes(q)
        const notesMatch = (phase.notes || '').toLowerCase().includes(q)
        const authorMatch = (phase.author || phase.reportCreatedBy || '').toLowerCase().includes(q)
        return nameMatch || dateMatch || weatherMatch || attendeesMatch || notesMatch || authorMatch
      })
    }

    if (filter === 'Key Plans') {
      list = list.filter(phase => {
        const fps = floorPlans.filter(fp => fp.phaseUuid === phase.uuid || (!fp.phaseUuid && phase === phases[0]))
        return fps.length > 0
      })
    } else if (filter === 'List Only') {
      list = list.filter(phase => {
        const fps = floorPlans.filter(fp => fp.phaseUuid === phase.uuid || (!fp.phaseUuid && phase === phases[0]))
        return fps.length === 0
      })
    }

    if (filter === 'Date (Newest)') {
      list.sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''))
    } else if (filter === 'Date (Oldest)') {
      list.sort((a, b) => (a.visitDate || '').localeCompare(b.visitDate || ''))
    } else if (filter === 'Name (A-Z)') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    } else if (filter === 'Name (Z-A)') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    }

    return list
  }, [phases, floorPlans, filter, siteVisitSearchQuery])

  // Flattened array of all photos in current images gallery view for lightbox navigation
  const displayedGalleryPhotos = useMemo(() => {
    const list = []
    filteredPhases.forEach((phase) => {
      const phaseFps = floorPlans.filter(f => f.phaseUuid === phase.uuid || (!f.phaseUuid && phase === phases[0]))
      const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
      const phaseItemUuids = new Set(
        punchItems
          .filter(i => (i.phaseUuid === phase.uuid || phaseFpUuids.has(i.floorPlanUuid)))
          .map(i => i.uuid)
      )
      const phasePhotos = galleryPhotos.filter(ph => phaseItemUuids.has(ph.punchItemUuid))
      phasePhotos.forEach(photo => {
        const item = punchItems.find(i => i.uuid === photo.punchItemUuid)
        const fp = item ? floorPlans.find(f => f.uuid === item.floorPlanUuid) : null
        const imgSrc = photo.imageData || photo.dataUrl
        if (imgSrc) {
          list.push({ photo, item, phase, floorPlan: fp })
        }
      })
    })
    return list
  }, [filteredPhases, floorPlans, punchItems, galleryPhotos, phases])

  // Active photo in lightbox
  const activePreviewPhoto = useMemo(() => {
    if (previewPhotoIndex === null) return null
    if (previewPhotoIndex >= 0 && previewPhotoIndex < displayedGalleryPhotos.length) {
      return displayedGalleryPhotos[previewPhotoIndex]
    }
    return null
  }, [previewPhotoIndex, displayedGalleryPhotos])

  const handleNextPhoto = useCallback(() => {
    if (displayedGalleryPhotos.length <= 1) return
    setPreviewPhotoIndex(prev => {
      if (prev === null) return 0
      return (prev + 1) % displayedGalleryPhotos.length
    })
  }, [displayedGalleryPhotos.length])

  const handlePrevPhoto = useCallback(() => {
    if (displayedGalleryPhotos.length <= 1) return
    setPreviewPhotoIndex(prev => {
      if (prev === null) return 0
      return (prev - 1 + displayedGalleryPhotos.length) % displayedGalleryPhotos.length
    })
  }, [displayedGalleryPhotos.length])

  const openGalleryPhotoPreview = useCallback((photoToOpen) => {
    const targetUuid = photoToOpen.photo?.uuid || photoToOpen.photo?.id
    const idx = displayedGalleryPhotos.findIndex(p => {
      const pUuid = p.photo?.uuid || p.photo?.id
      return pUuid && pUuid === targetUuid
    })
    if (idx >= 0) {
      setPreviewPhotoIndex(idx)
    } else {
      setPreviewPhotoIndex(0)
    }
  }, [displayedGalleryPhotos])

  // Keyboard navigation for photo lightbox (Left/Right arrow, Esc)
  useEffect(() => {
    if (previewPhotoIndex === null) return
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextPhoto()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevPhoto()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setPreviewPhotoIndex(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewPhotoIndex, handleNextPhoto, handlePrevPhoto])

  // Mobile touch swipe gestures for lightbox
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchEndXRef = useRef(0)
  const touchEndYRef = useRef(0)

  const handleTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    touchEndXRef.current = e.touches[0].clientX
    touchEndYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e) => {
    if (!e.touches || e.touches.length === 0) return
    touchEndXRef.current = e.touches[0].clientX
    touchEndYRef.current = e.touches[0].clientY
  }

  const handleTouchEnd = () => {
    const diffX = touchEndXRef.current - touchStartXRef.current
    const diffY = touchEndYRef.current - touchStartYRef.current
    // Minimum 35px horizontal swipe, and horizontal swipe is dominant
    if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        handleNextPhoto() // Swiped left -> Next
      } else {
        handlePrevPhoto() // Swiped right -> Previous
      }
    }
  }

  const handleMoveFloorPlan = async (fpUuid, direction) => {
    const list = [...activePhaseFps]
    const idx = list.findIndex(f => f.uuid === fpUuid)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= list.length) return

    // Swap positions
    const temp = list[idx]
    list[idx] = list[targetIdx]
    list[targetIdx] = temp

    await reorderFloorPlans(list.map(f => f.uuid), currentProjectUuid, activePhase?.uuid)
    await load()
  }

  // ── Drag & Drop Reordering (Mouse and Touch / Finger) ──
  const [draggedFpUuid, setDraggedFpUuid] = useState(null)
  const [dragOverFpUuid, setDragOverFpUuid] = useState(null)
  const dragRef = useRef(null)

  const reorderList = async (sourceUuid, targetUuid) => {
    if (!sourceUuid || !targetUuid || sourceUuid === targetUuid) return
    const list = [...activePhaseFps]
    const fromIdx = list.findIndex(f => f.uuid === sourceUuid)
    const toIdx = list.findIndex(f => f.uuid === targetUuid)

    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const [movedItem] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, movedItem)

      await reorderFloorPlans(list.map(f => f.uuid), currentProjectUuid, activePhase?.uuid)
      await load()
    }
  }

  // HTML5 Drag (Desktop Mouse)
  const handleDragStart = (e, fpUuid) => {
    e.dataTransfer.setData('text/plain', fpUuid)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedFpUuid(fpUuid)
  }

  const handleDragOver = (e, fpUuid) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverFpUuid !== fpUuid) {
      setDragOverFpUuid(fpUuid)
    }
  }

  const handleDrop = async (e, targetUuid) => {
    e.preventDefault()
    const itemType = e.dataTransfer.getData('sitepunch/type')
    const sourceUuid = e.dataTransfer.getData('text/plain') || draggedFpUuid || draggedObsUuid
    setDraggedFpUuid(null)
    setDragOverFpUuid(null)

    // If an observation was dropped onto a key plan, attach it to that key plan
    if (itemType === 'punch-item' || (draggedObsUuid && sourceUuid === draggedObsUuid)) {
      setDraggedObsUuid(null)
      setDragOverObsUuid(null)
      await db.punchItems.where('uuid').equals(sourceUuid).modify({
        floorPlanUuid: targetUuid,
        updatedAt: Date.now()
      })
      await resequenceReportPins({ projectUuid: currentProjectUuid, phaseUuid: activePhase?.uuid, floorPlanUuid: targetUuid })
      await load()
      return
    }

    await reorderList(sourceUuid, targetUuid)
  }

  const handleDragEnd = () => {
    setDraggedFpUuid(null)
    setDragOverFpUuid(null)
  }

  // Pointer & Touch Events (Finger & Mouse Grip)
  const handleGripPointerDown = (e, fpUuid, index) => {
    if (e.button !== undefined && e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}

    dragRef.current = {
      pointerId: e.pointerId,
      uuid: fpUuid,
      startIndex: index,
      startY: e.clientY,
      hasMoved: false,
    }
  }

  const handleGripPointerMove = (e) => {
    if (!dragRef.current) return
    const dy = Math.abs(e.clientY - dragRef.current.startY)
    if (!dragRef.current.hasMoved && dy > 4) {
      dragRef.current.hasMoved = true
      setDraggedFpUuid(dragRef.current.uuid)
    }
    if (!dragRef.current.hasMoved) return

    const elem = document.elementFromPoint(e.clientX, e.clientY)
    const card = elem?.closest('[data-fp-uuid]')
    if (card) {
      const targetUuid = card.getAttribute('data-fp-uuid')
      if (targetUuid && targetUuid !== dragRef.current.uuid) {
        setDragOverFpUuid(targetUuid)
      }
    }
  }

  const handleGripPointerUp = async () => {
    if (!dragRef.current) return
    const { uuid, hasMoved } = dragRef.current
    const targetUuid = dragOverFpUuid

    setDraggedFpUuid(null)
    setDragOverFpUuid(null)
    dragRef.current = null

    if (hasMoved && targetUuid && targetUuid !== uuid) {
      await reorderList(uuid, targetUuid)
    }
  }

  // Touch Events (mobile/finger specific fallback)
  const handleGripTouchStart = (e, fpUuid, index) => {
    const touch = e.touches[0]
    dragRef.current = {
      uuid: fpUuid,
      startIndex: index,
      startY: touch.clientY,
      hasMoved: false,
    }
  }

  const handleGripTouchMove = (e) => {
    if (!dragRef.current) return
    const touch = e.touches[0]
    const dy = Math.abs(touch.clientY - dragRef.current.startY)
    if (!dragRef.current.hasMoved && dy > 4) {
      dragRef.current.hasMoved = true
      setDraggedFpUuid(dragRef.current.uuid)
    }
    if (!dragRef.current.hasMoved) return

    if (e.cancelable) e.preventDefault()

    const elem = document.elementFromPoint(touch.clientX, touch.clientY)
    const card = elem?.closest('[data-fp-uuid]')
    if (card) {
      const targetUuid = card.getAttribute('data-fp-uuid')
      if (targetUuid && targetUuid !== dragRef.current.uuid) {
        setDragOverFpUuid(targetUuid)
      }
    }
  }

  const handleGripTouchEnd = async () => {
    if (!dragRef.current) return
    const { uuid, hasMoved } = dragRef.current
    const targetUuid = dragOverFpUuid

    setDraggedFpUuid(null)
    setDragOverFpUuid(null)
    dragRef.current = null

    if (hasMoved && targetUuid && targetUuid !== uuid) {
      await reorderList(uuid, targetUuid)
    }
  }

  // ── Direct Observations Drag & Drop / Reordering ──
  const [draggedObsUuid, setDraggedObsUuid] = useState(null)
  const [dragOverObsUuid, setDragOverObsUuid] = useState(null)
  const dragObsRef = useRef(null)

  const reorderDirectObservations = async (sourceUuid, targetUuid) => {
    if (!sourceUuid || !targetUuid || sourceUuid === targetUuid) return
    const currentDirect = activePhaseItems
      .filter(i => !i.floorPlanUuid)
      .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0) || (a.createdAt || 0) - (b.createdAt || 0))

    const list = [...currentDirect]
    const fromIdx = list.findIndex(i => i.uuid === sourceUuid)
    const toIdx = list.findIndex(i => i.uuid === targetUuid)

    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const [movedItem] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, movedItem)

      // Start numbering directly after all floor plan pins in this report
      const floorPlanPinsCount = activePhaseItems.filter(i => !!i.floorPlanUuid).length
      const baseSeq = floorPlanPinsCount + 1

      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        const newNumber = baseSeq + i
        if (item.itemNumber !== newNumber) {
          await db.punchItems.where('uuid').equals(item.uuid).modify({
            itemNumber: newNumber,
            updatedAt: Date.now()
          })
        }
      }
      await load()
    }
  }

  const handleMoveDirectObservation = async (itemUuid, direction) => {
    const currentDirect = activePhaseItems
      .filter(i => !i.floorPlanUuid)
      .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0) || (a.createdAt || 0) - (b.createdAt || 0))

    const list = [...currentDirect]
    const idx = list.findIndex(i => i.uuid === itemUuid)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= list.length) return

    const [moved] = list.splice(idx, 1)
    list.splice(targetIdx, 0, moved)

    const floorPlanPinsCount = activePhaseItems.filter(i => !!i.floorPlanUuid).length
    const baseSeq = floorPlanPinsCount + 1

    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      const newNumber = baseSeq + i
      if (item.itemNumber !== newNumber) {
        await db.punchItems.where('uuid').equals(item.uuid).modify({
          itemNumber: newNumber,
          updatedAt: Date.now()
        })
      }
    }
    await load()
  }

  // Desktop Mouse Drag for Observations
  const handleObsDragStart = (e, itemUuid) => {
    e.dataTransfer.setData('text/plain', itemUuid)
    e.dataTransfer.setData('sitepunch/type', 'punch-item')
    e.dataTransfer.effectAllowed = 'move'
    setDraggedObsUuid(itemUuid)
  }

  const handleObsDragOver = (e, itemUuid) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverObsUuid !== itemUuid) {
      setDragOverObsUuid(itemUuid)
    }
  }

  const handleObsDrop = async (e, targetUuid) => {
    e.preventDefault()
    const sourceUuid = e.dataTransfer.getData('text/plain') || draggedObsUuid
    setDraggedObsUuid(null)
    setDragOverObsUuid(null)
    await reorderDirectObservations(sourceUuid, targetUuid)
  }

  const handleObsDragEnd = () => {
    setDraggedObsUuid(null)
    setDragOverObsUuid(null)
  }

  // Pointer & Touch Events (Finger & Mouse Grip) for Observations
  const handleObsGripPointerDown = (e, itemUuid, index) => {
    if (e.button !== undefined && e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}

    dragObsRef.current = {
      pointerId: e.pointerId,
      uuid: itemUuid,
      startIndex: index,
      startY: e.clientY,
      hasMoved: false,
    }
  }

  const handleObsGripPointerMove = (e) => {
    if (!dragObsRef.current) return
    const dy = Math.abs(e.clientY - dragObsRef.current.startY)
    if (!dragObsRef.current.hasMoved && dy > 4) {
      dragObsRef.current.hasMoved = true
      setDraggedObsUuid(dragObsRef.current.uuid)
    }
    if (!dragObsRef.current.hasMoved) return

    const elem = document.elementFromPoint(e.clientX, e.clientY)
    const card = elem?.closest('[data-item-uuid]')
    if (card) {
      const targetUuid = card.getAttribute('data-item-uuid')
      if (targetUuid && targetUuid !== dragObsRef.current.uuid) {
        setDragOverObsUuid(targetUuid)
      }
    }
  }

  const handleObsGripPointerUp = async () => {
    if (!dragObsRef.current) return
    const { uuid, hasMoved } = dragObsRef.current
    const targetUuid = dragOverObsUuid

    setDraggedObsUuid(null)
    setDragOverObsUuid(null)
    dragObsRef.current = null

    if (hasMoved && targetUuid && targetUuid !== uuid) {
      await reorderDirectObservations(uuid, targetUuid)
    }
  }

  // Touch Events (mobile/finger fallback) for Observations
  const handleObsGripTouchStart = (e, itemUuid, index) => {
    const touch = e.touches[0]
    dragObsRef.current = {
      uuid: itemUuid,
      startIndex: index,
      startY: touch.clientY,
      hasMoved: false,
    }
  }

  const handleObsGripTouchMove = (e) => {
    if (!dragObsRef.current) return
    const touch = e.touches[0]
    const dy = Math.abs(touch.clientY - dragObsRef.current.startY)
    if (!dragObsRef.current.hasMoved && dy > 4) {
      dragObsRef.current.hasMoved = true
      setDraggedObsUuid(dragObsRef.current.uuid)
    }
    if (!dragObsRef.current.hasMoved) return

    if (e.cancelable) e.preventDefault()

    const elem = document.elementFromPoint(touch.clientX, touch.clientY)
    const card = elem?.closest('[data-item-uuid]')
    if (card) {
      const targetUuid = card.getAttribute('data-item-uuid')
      if (targetUuid && targetUuid !== dragObsRef.current.uuid) {
        setDragOverObsUuid(targetUuid)
      }
    }
  }

  const handleObsGripTouchEnd = async () => {
    if (!dragObsRef.current) return
    const { uuid, hasMoved } = dragObsRef.current
    const targetUuid = dragOverObsUuid

    setDraggedObsUuid(null)
    setDragOverObsUuid(null)
    dragObsRef.current = null

    if (hasMoved && targetUuid && targetUuid !== uuid) {
      await reorderDirectObservations(uuid, targetUuid)
    }
  }

  const handleOpenAddFloorPlan = (phaseUuid = null) => {
    setTargetPhaseUuid(phaseUuid || currentPhaseUuid || phases[0]?.uuid || null)
    openFloorPlanManager()
  }

  const handleAddNewObservationForPhase = async () => {
    const targetPhase = activePhase || phases[0]
    if (!targetPhase) {
      setShowPhaseModal(true)
      return
    }
    const { savePunchItem, getNextItemNumber } = await import('../db/database')
    const { v4: uuidv4 } = await import('uuid')
    const nextNumber = await getNextItemNumber(currentProjectUuid, targetPhase.uuid)
    const newUuid = uuidv4()
    const newItem = {
      uuid: newUuid,
      projectUuid: currentProjectUuid,
      floorPlanUuid: null,
      phaseUuid: targetPhase.uuid,
      itemNumber: nextNumber,
      title: '',
      notes: '',
      trade: 'General',
      priority: 'Medium',
      status: 'Open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await savePunchItem(newItem)
    await load()
    setCurrentPunchItem(newUuid)
    openPunchForm()
  }

  const handleDeletePunchItem = async (uuid) => {
    const item = punchItems.find(i => i.uuid === uuid)
    const num = item ? `#${item.itemNumber}` : ''
    if (!window.confirm(`Delete observation ${num}?\n\nThis will permanently remove this item and all its attached photos.`)) return
    await deletePunchItem(uuid)
    await load()
  }

  const handleObservationStatusChange = async (targetItem, nextStatus) => {
    setPunchItems(prev => prev.map(p => (p.uuid === targetItem.uuid ? { ...p, status: nextStatus } : p)))
    await savePunchItem({ ...targetItem, status: nextStatus })
  }

  const handleDeleteFloorPlan = async (uuid, name) => {
    const itemsOnFp = punchItems.filter(i => i.floorPlanUuid === uuid)
    const confirmed = window.confirm(
      `Delete key plan "${name}"?\n\nThis will permanently delete this key plan and all ${itemsOnFp.length} punch item(s) on it.`
    )
    if (!confirmed) return
    await deleteFloorPlan(uuid)
    await load()
  }

  const handleDeletePhase = async (phase) => {
    const phaseFps = floorPlans.filter(f => f.phaseUuid === phase.uuid)
    const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
    const phaseItems = punchItems.filter(i => phaseFpUuids.has(i.floorPlanUuid))
    const confirmed = window.confirm(
      `Delete Site Visit "${phase.name}"?\n\nThis will permanently delete this site visit, along with its ${phaseFps.length} key plan(s) and ${phaseItems.length} observation(s).`
    )
    if (!confirmed) return
    if (currentPhaseUuid === phase.uuid) {
      setCurrentPhase(null)
    }
    await deletePhase(phase.uuid)
    await load()
  }

  if (loading) return <LoadingScreen />
  if (!project) return null

  const activePhase = phases.find(p => p.uuid === currentPhaseUuid) || null
  const activePhaseFps = activePhase
    ? sortFloorPlans(floorPlans.filter(fp => fp.phaseUuid === activePhase.uuid || (!fp.phaseUuid && activePhase === phases[0])))
    : []
  const activePhaseFpUuids = new Set(activePhaseFps.map(f => f.uuid))
  const activePhaseItems = punchItems.filter(i => (i.phaseUuid === activePhase?.uuid) || activePhaseFpUuids.has(i.floorPlanUuid))

  const displayedItems = activePhase ? activePhaseItems : punchItems

  const query = searchQuery.trim().toLowerCase()

  const matchesObservation = (item) => {
    if (!query) return true
    const itemNum = String(item.itemNumber || '').toLowerCase()
    const title = (item.title || '').toLowerCase()
    const desc = (item.description || '').toLowerCase()
    const cat = (item.category || '').toLowerCase()
    const room = (item.room || '').toLowerCase()
    const status = normalizeObservationStatus(item.status).toLowerCase()
    return itemNum.includes(query) ||
      `#${itemNum}`.includes(query) ||
      title.includes(query) ||
      desc.includes(query) ||
      cat.includes(query) ||
      room.includes(query) ||
      status.includes(query)
  }

  const matchesFloorPlan = (fp) => {
    if (!query) return true
    if ((fp.name || '').toLowerCase().includes(query)) return true
    const fpItems = punchItems.filter(i => i.floorPlanUuid === fp.uuid)
    return fpItems.some(matchesObservation)
  }

  const displayedActivePhaseFps = activePhaseFps.filter(matchesFloorPlan)

  const displayedDirectItems = activePhaseItems
    .filter(i => !i.floorPlanUuid)
    .filter(matchesObservation)
    .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0) || (a.createdAt || 0) - (b.createdAt || 0))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header
        className="sitepunch-header text-white shadow-lg flex-shrink-0 relative z-40"
        style={{
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
          paddingBottom: '12px',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center gap-2 min-h-[44px] max-w-4xl mx-auto w-full">
          <button
            onClick={activePhase ? () => { setCurrentPhase(null); setSearchQuery('') } : overviewTab !== 'sitevisits' ? () => setOverviewTab('sitevisits') : navigateToProjects}
            className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
            title={activePhase ? "Back to Site Visits" : overviewTab !== 'sitevisits' ? "Back to Site Visits" : "Back to Projects"}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {activePhase ? (
              <>
                <h1 className="font-extrabold text-base sm:text-lg leading-tight truncate text-white drop-shadow-xs">
                  Observations
                </h1>
                <p className="text-white/85 text-xs sm:text-sm leading-tight mt-0.5 truncate font-medium">
                  {activePhase.name}
                </p>
              </>
            ) : (
              <>
                <h1 className="font-extrabold text-base sm:text-lg leading-tight truncate text-white drop-shadow-xs">
                  {overviewTab === 'sitevisits' && 'Site Visits'}
                  {overviewTab === 'keyplans' && 'Key Plans'}
                  {overviewTab === 'punchitems' && 'Punch Items'}
                  {overviewTab === 'images' && 'Images Gallery'}
                </h1>
                <p className="text-white/85 text-xs sm:text-sm leading-tight mt-0.5 truncate font-medium">
                  {project.name}{project.number ? ` · #${project.number}` : ''}
                </p>
              </>
            )}
          </div>

          {activePhase ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Green Box: Search Bar */}
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-3 text-white/70 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search observations..."
                  className="liquid-glass-btn h-[40px] pl-8 pr-7 text-xs text-white placeholder-white/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-white/80 w-28 sm:w-44 md:w-56 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-white/70 hover:text-white p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Yellow Box: Generate Report Button with Report text below Generate for concise width */}
              <button
                onClick={openPDFPreview}
                className="liquid-glass-btn min-h-[40px] px-2.5 py-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-white flex-shrink-0 cursor-pointer active:scale-95"
                title="Generate Report"
              >
                <FileText size={16} className="flex-shrink-0" />
                <div className="flex flex-col text-left leading-[1.05]">
                  <span className="text-[11px] font-bold tracking-tight">Generate</span>
                  <span className="text-[11px] font-bold tracking-tight text-white/90">Report</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Site Visit Search Box */}
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-3 text-white/70 pointer-events-none" />
                <input
                  type="text"
                  value={siteVisitSearchQuery}
                  onChange={(e) => setSiteVisitSearchQuery(e.target.value)}
                  placeholder="Search site visits..."
                  className="liquid-glass-btn h-[40px] pl-8 pr-7 text-xs text-white placeholder-white/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-white/80 w-32 sm:w-48 md:w-56 transition-all"
                />
                {siteVisitSearchQuery && (
                  <button
                    onClick={() => setSiteVisitSearchQuery('')}
                    className="absolute right-2 text-white/70 hover:text-white p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filter button moved to top menu bar right end */}
              <div className="relative flex-shrink-0 z-50" id="report-filter-container">
                <button
                  type="button"
                  onClick={() => setShowFilter(f => !f)}
                  className={`liquid-glass-btn min-h-[40px] px-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 text-white text-xs font-bold flex-shrink-0 cursor-pointer ${
                    filter !== 'All' ? 'bg-white/30 ring-1 ring-white/50' : ''
                  }`}
                  title="Filter and sort site visits"
                >
                  <Filter size={14} className="text-white" />
                  <span>{filter === 'All' ? 'Filter' : (REPORT_FILTER_OPTIONS.find(o => o.id === filter)?.label || filter)}</span>
                </button>
                {showFilter && (
                  <div
                    className="bg-white/95 backdrop-blur-xl border border-gray-200/90 rounded-2xl p-1.5 shadow-2xl z-50"
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 100,
                      minWidth: 170,
                    }}
                  >
                    {REPORT_FILTER_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => { setFilter(opt.id); setShowFilter(false) }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between cursor-pointer transition-colors"
                        style={{
                          background: filter === opt.id ? 'var(--brand-50, #eff6ff)' : 'transparent',
                          color:      filter === opt.id ? 'var(--brand-color, #a40e26)' : '#374151',
                          fontWeight: filter === opt.id ? 700 : 500,
                        }}
                      >
                        <span>{opt.label}</span>
                        {filter === opt.id && <Check size={14} className="text-brand-600 ml-2" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main
        className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4"
        style={{
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto w-full space-y-4">
          {/* Statistics Banner: Interactive Category Switcher on All Site Visits page */}
          {!activePhase && (
          <>
            <div className="liquid-glass-surface rounded-2xl p-2.5 sm:p-3.5 shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {/* 1. Site Visits Tab Button */}
                <button
                  type="button"
                  onClick={() => setOverviewTab('sitevisits')}
                  className={`p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group ${
                    overviewTab === 'sitevisits'
                      ? 'bg-purple-50/90 border-purple-400 shadow-md ring-2 ring-purple-500/30'
                      : 'bg-white/60 backdrop-blur-md border-white/80 hover:bg-white/90 hover:border-purple-200 shadow-2xs hover:shadow-xs'
                  }`}
                  title="View all site visits"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600">
                    <ClipboardList size={14} className="text-purple-700 stroke-[2.2]" />
                    <span className={overviewTab === 'sitevisits' ? 'text-purple-900 font-bold' : ''}>Site Visits</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{phases.length}</p>
                  {overviewTab === 'sitevisits' && (
                    <div className="w-8 h-1 rounded-full bg-purple-600 mt-1 animate-fade-in" />
                  )}
                </button>

                {/* 2. Key Plans Tab Button */}
                <button
                  type="button"
                  onClick={() => setOverviewTab('keyplans')}
                  className={`p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group ${
                    overviewTab === 'keyplans'
                      ? 'shadow-md ring-2'
                      : 'bg-white/60 backdrop-blur-md border-white/80 hover:bg-white/90 shadow-2xs hover:shadow-xs'
                  }`}
                  style={
                    overviewTab === 'keyplans'
                      ? {
                          background: 'linear-gradient(135deg, rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.1) 0%, rgba(255, 255, 255, 0.95) 100%)',
                          borderColor: 'var(--punch-pin-color, #a40e26)',
                          boxShadow: '0 4px 14px -2px rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.25)',
                        }
                      : {}
                  }
                  title="View key plan drawings gallery"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600">
                    <FileImage size={14} className="stroke-[2.2]" style={{ color: 'var(--punch-pin-color, #a40e26)' }} />
                    <span style={overviewTab === 'keyplans' ? { color: 'var(--punch-pin-color, #a40e26)', fontWeight: 700 } : {}}>Key Plans</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{floorPlans.length}</p>
                  {overviewTab === 'keyplans' && (
                    <div className="w-8 h-1 rounded-full mt-1 animate-fade-in" style={{ background: 'var(--punch-pin-color, #a40e26)' }} />
                  )}
                </button>

                {/* 3. Punch Items Tab Button */}
                <button
                  type="button"
                  onClick={() => setOverviewTab('punchitems')}
                  className={`p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group ${
                    overviewTab === 'punchitems'
                      ? 'shadow-md ring-2'
                      : 'bg-white/60 backdrop-blur-md border-white/80 hover:bg-white/90 shadow-2xs hover:shadow-xs'
                  }`}
                  style={
                    overviewTab === 'punchitems'
                      ? {
                          background: 'linear-gradient(135deg, rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.1) 0%, rgba(255, 255, 255, 0.95) 100%)',
                          borderColor: 'var(--punch-pin-color, #a40e26)',
                          boxShadow: '0 4px 14px -2px rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.25)',
                        }
                      : {}
                  }
                  title="View all punch list items"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600">
                    <AlertCircle size={14} className="stroke-[2.2]" style={{ color: 'var(--punch-pin-color, #a40e26)' }} />
                    <span style={overviewTab === 'punchitems' ? { color: 'var(--punch-pin-color, #a40e26)', fontWeight: 700 } : {}}>Punch Items</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{punchItems.length}</p>
                  {overviewTab === 'punchitems' && (
                    <div className="w-8 h-1 rounded-full mt-1 animate-fade-in" style={{ background: 'var(--punch-pin-color, #a40e26)' }} />
                  )}
                </button>

                {/* 4. Images Tab Button */}
                <button
                  type="button"
                  onClick={() => setOverviewTab('images')}
                  className={`p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group ${
                    overviewTab === 'images'
                      ? 'bg-emerald-50/90 border-emerald-400 shadow-md ring-2 ring-emerald-500/30'
                      : 'bg-white/60 backdrop-blur-md border-white/80 hover:bg-white/90 hover:border-emerald-200 shadow-2xs hover:shadow-xs'
                  }`}
                  title="View all observation photos gallery"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600">
                    <Camera size={14} className="text-emerald-600 stroke-[2.2]" />
                    <span className={overviewTab === 'images' ? 'text-emerald-900 font-bold' : ''}>Images</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{totalPhotos}</p>
                  {overviewTab === 'images' && (
                    <div className="w-8 h-1 rounded-full bg-emerald-600 mt-1 animate-fade-in" />
                  )}
                </button>
              </div>
            </div>

            {/* Breadcrumb Navigation Path - All Site Visits */}
            <Breadcrumbs
              items={[
                { label: 'Dashboard', icon: <Home size={13} />, onClick: navigateToDashboard },
                { label: 'Projects', onClick: navigateToProjects },
                overviewTab === 'sitevisits'
                  ? { label: project.name || 'Project', active: true }
                  : { label: project.name || 'Project', onClick: () => setOverviewTab('sitevisits') },
                ...(overviewTab !== 'sitevisits' ? [
                  {
                    label: overviewTab === 'keyplans' ? 'Key Plans'
                      : overviewTab === 'punchitems' ? 'Punch Items'
                      : 'Images Gallery',
                    active: true
                  }
                ] : [])
              ]}
            />
          </>
        )}

      {activeTab === 'floorplans' && (
          activePhase ? (
            /* ── Single Report Opened View: See all floor plans in this report ── */
            <div className="space-y-4">
              {/* Site Visit Details Card */}
              <div className="liquid-glass-card rounded-2xl p-4 sm:p-5 transition-all">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs flex-1 min-w-0">
                    <div className="flex items-start gap-2.5 bg-white/70 backdrop-blur-md p-3 rounded-xl border border-white/90 shadow-2xs">
                      <Calendar size={16} className="text-brand-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Visit Time &amp; Weather</span>
                        <div className="text-gray-800 font-semibold block mt-0.5">
                          {(() => {
                            const dateTimeStr = formatVisitDateTime(activePhase.visitDate, activePhase.visitTime, null, false)
                            const weatherStr = activePhase.weather?.trim()
                            if (dateTimeStr && weatherStr) {
                              return (
                                <div className="flex flex-col gap-0.5 leading-snug">
                                  <span className="truncate">{dateTimeStr}</span>
                                  <span className="inline-flex items-center gap-1 text-gray-700 truncate">
                                    <CloudSun size={13} className="text-amber-500 inline flex-shrink-0" />
                                    <span>{weatherStr}</span>
                                  </span>
                                </div>
                              )
                            } else if (dateTimeStr) {
                              return <span className="truncate block">{dateTimeStr}</span>
                            } else if (weatherStr) {
                              return (
                                <span className="inline-flex items-center gap-1 text-gray-700 truncate">
                                  <CloudSun size={13} className="text-amber-500 inline flex-shrink-0" />
                                  <span>{weatherStr}</span>
                                </span>
                              )
                            }
                            return <span className="text-gray-400 font-normal italic">None specified</span>
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 bg-white/70 backdrop-blur-md p-3 rounded-xl border border-white/90 shadow-2xs">
                      <User size={16} className="text-brand-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Report created by</span>
                        <span className="text-gray-800 font-semibold truncate block mt-0.5" title={activePhase.createdBy || ''}>
                          {activePhase.createdBy?.trim() || <span className="text-gray-400 font-normal italic">None specified</span>}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 bg-white/70 backdrop-blur-md p-3 rounded-xl border border-white/90 shadow-2xs">
                      <Users size={16} className="text-brand-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Attendees</span>
                        <span
                          className="text-gray-800 font-semibold whitespace-pre-line block line-clamp-3 overflow-hidden text-ellipsis leading-snug mt-0.5"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={activePhase.attendees}
                        >
                          {formatAttendeesTruncated(activePhase.attendees, 3) || <span className="text-gray-400 font-normal italic">None recorded</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Edit button placed outside attendees section on the right side */}
                  <button
                    type="button"
                    onClick={() => setEditingPhase(activePhase)}
                    className="liquid-pill px-4 py-2.5 sm:py-0 text-slate-700 hover:text-slate-900 rounded-xl transition-all flex sm:flex-col items-center justify-center gap-1.5 flex-shrink-0 sm:self-stretch sm:min-w-[64px] cursor-pointer group shadow-2xs"
                    title="Edit Site Visit Details"
                  >
                    <Edit2 size={15} className="group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold">Edit</span>
                  </button>
                </div>
              </div>

              {/* Breadcrumb Navigation Path - Placed Below Site Visit Details Card */}
              <Breadcrumbs
                items={[
                  { label: 'Dashboard', icon: <Home size={13} />, onClick: navigateToDashboard },
                  { label: 'Projects', onClick: navigateToProjects },
                  { label: project.name || 'Project', onClick: () => setCurrentPhase(null) },
                  { label: activePhase.name || 'Site Visit', active: true },
                ]}
              />

              {/* Report Content: Key Plans & Direct Observations (Key Plan Image is Optional) */}
              {activePhaseFps.length === 0 ? (
                <div className="space-y-4">
                  <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-white shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3">
                      <Layers size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">Key Plans &amp; Observations</h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                      Key plan images are optional. You can upload drawings to place pinpoint markers, or add punch list items directly as a list.
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
                      <button
                        onClick={() => handleOpenAddFloorPlan(activePhase.uuid)}
                        className="sitepunch-btn-primary px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 cursor-pointer transition-all"
                        style={{ background: 'var(--brand-button, #a40e26)' }}
                      >
                        <FileImage size={15} />
                        <span>Upload Key Plan Image</span>
                      </button>
                      <button
                        onClick={handleAddNewObservationForPhase}
                        className="sitepunch-btn-primary px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 cursor-pointer transition-all"
                        style={{ background: 'var(--brand-button, #a40e26)' }}
                      >
                        <Plus size={15} />
                        <span>Add Observation (List Item)</span>
                      </button>
                    </div>
                  </div>

                  {activePhaseItems.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between pb-1 gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                            Observations in this Site Visit
                          </h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200/80">
                            {query ? activePhaseItems.filter(matchesObservation).length : activePhaseItems.length}
                          </span>
                        </div>
                        <button
                          onClick={handleAddNewObservationForPhase}
                          className="sitepunch-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                          style={{ background: 'var(--brand-button, #a40e26)' }}
                        >
                          <Plus size={13} />
                          <span>Add Observation</span>
                        </button>
                      </div>
                      {activePhaseItems
                        .filter(matchesObservation)
                        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
                        .map(item => (
                          <PunchItemRow
                            key={item.uuid}
                            item={item}
                            floorPlan={null}
                            phase={activePhase}
                            showPhase={false}
                            onStatusChange={(nextStatus) => handleObservationStatusChange(item, nextStatus)}
                            onClick={() => {
                              setCurrentPunchItem(item.uuid)
                              openPunchForm()
                            }}
                            onEdit={() => {
                              setCurrentPunchItem(item.uuid)
                              openPunchForm()
                            }}
                            onDelete={() => handleDeletePunchItem(item.uuid)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between pb-1 gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center shadow-2xs flex-shrink-0 border"
                          style={{
                            color: 'var(--punch-pin-color, #a40e26)',
                            borderColor: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.35)',
                            background: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.1)',
                          }}
                        >
                          <FileImage size={17} className="stroke-[2.2]" />
                        </div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                            Key Plans
                          </h3>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border"
                            style={{
                              color: 'var(--punch-pin-color, #a40e26)',
                              borderColor: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.35)',
                              background: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.1)',
                            }}
                          >
                            {query ? displayedActivePhaseFps.length : activePhaseFps.length}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleOpenAddFloorPlan(activePhase.uuid)}
                          className="sitepunch-btn-primary inline-flex items-center gap-1.5 text-xs font-bold bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                          style={{ background: 'var(--brand-button, #a40e26)' }}
                          title="Add Key Plan"
                        >
                          <Plus size={14} />
                          <span>Add Key Plan</span>
                        </button>
                      </div>
                    </div>
                    {displayedActivePhaseFps.map((fp, idx) => {
                      const fpPunchItems = punchItems
                        .filter(i => i.floorPlanUuid === fp.uuid)
                        .filter(matchesObservation)
                        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
                      const isExpanded = query ? true : expandedFpUuids.has(fp.uuid)

                      return (
                        <div key={fp.uuid} className="space-y-2">
                          <FloorPlanCard
                            fp={fp}
                            index={idx + 1}
                            punchItems={fpPunchItems}
                            isExpanded={isExpanded}
                            onToggleAccordion={() => toggleFpAccordion(fp.uuid)}
                            onClick={() => navigateToFloorPlan(currentProjectUuid, fp.uuid, fp.phaseUuid || activePhase?.uuid)}
                            onRename={() => setRenamingFp(fp)}
                            onDelete={handleDeleteFloorPlan}
                            onMoveUp={() => handleMoveFloorPlan(fp.uuid, 'up')}
                            onMoveDown={() => handleMoveFloorPlan(fp.uuid, 'down')}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < activePhaseFps.length - 1}
                            isDragging={draggedFpUuid === fp.uuid}
                            isDragOver={dragOverFpUuid === fp.uuid}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onPointerDownGrip={(e) => handleGripPointerDown(e, fp.uuid, idx)}
                            onPointerMoveGrip={handleGripPointerMove}
                            onPointerUpGrip={handleGripPointerUp}
                            onTouchStartGrip={(e) => handleGripTouchStart(e, fp.uuid, idx)}
                            onTouchMoveGrip={handleGripTouchMove}
                            onTouchEndGrip={handleGripTouchEnd}
                          />

                          {/* Collapsible Accordion: Observations pinned on this Key Plan */}
                          {isExpanded && (
                            <div
                              className="pl-3 sm:pl-7 pr-1 space-y-2 animate-fade-in border-l-2 ml-4 sm:ml-6 my-2"
                              style={{ borderColor: `rgba(${pinR}, ${pinG}, ${pinB}, 0.45)` }}
                            >
                              {fpPunchItems.length === 0 ? (
                                <div className="p-3 bg-white/70 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
                                  No observations pinned on this key plan yet.
                                </div>
                              ) : (
                                fpPunchItems.map(item => (
                                  <PunchItemRow
                                    key={item.uuid}
                                    item={item}
                                    floorPlan={fp}
                                    phase={activePhase}
                                    showPhase={false}
                                    onStatusChange={(nextStatus) => handleObservationStatusChange(item, nextStatus)}
                                    onClick={() => {
                                      setCurrentPunchItem(item.uuid)
                                      openPunchForm()
                                    }}
                                    onEdit={() => {
                                      setCurrentPunchItem(item.uuid)
                                      openPunchForm()
                                    }}
                                    onDelete={() => handleDeletePunchItem(item.uuid)}
                                  />
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Any direct list observations in this report */}
                  {(query ? displayedDirectItems.length > 0 : activePhaseItems.some(i => !i.floorPlanUuid)) && (
                    <div className="space-y-2 pt-2 border-t border-gray-150">
                      <div className="flex items-center justify-between pb-1 gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-2xs flex-shrink-0 border"
                            style={{
                              color: pinColor || 'var(--punch-pin-color, #a40e26)',
                              borderColor: `rgba(${pinR}, ${pinG}, ${pinB}, 0.35)`,
                              background: `rgba(${pinR}, ${pinG}, ${pinB}, 0.1)`,
                            }}
                          >
                            <ClipboardList size={17} className="stroke-[2.2]" />
                          </div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                              Direct List Observations
                            </h4>
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border"
                              style={{
                                color: pinColor || 'var(--punch-pin-color, #a40e26)',
                                borderColor: `rgba(${pinR}, ${pinG}, ${pinB}, 0.35)`,
                                background: `rgba(${pinR}, ${pinG}, ${pinB}, 0.1)`,
                              }}
                            >
                              {displayedDirectItems.length}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleAddNewObservationForPhase}
                          className="sitepunch-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                          style={{ background: 'var(--brand-button, #a40e26)' }}
                        >
                          <Plus size={13} />
                          <span>Add Observation</span>
                        </button>
                      </div>
                      {displayedDirectItems
                        .map((item, idx, arr) => (
                          <PunchItemRow
                            key={item.uuid}
                            item={item}
                            floorPlan={null}
                            phase={activePhase}
                            showPhase={false}
                            onStatusChange={(nextStatus) => handleObservationStatusChange(item, nextStatus)}
                            onClick={() => {
                              setCurrentPunchItem(item.uuid)
                              openPunchForm()
                            }}
                            onEdit={() => {
                              setCurrentPunchItem(item.uuid)
                              openPunchForm()
                            }}
                            onDelete={() => handleDeletePunchItem(item.uuid)}
                            draggable={true}
                            isDragging={draggedObsUuid === item.uuid}
                            isDragOver={dragOverObsUuid === item.uuid}
                            onMoveUp={() => handleMoveDirectObservation(item.uuid, 'up')}
                            onMoveDown={() => handleMoveDirectObservation(item.uuid, 'down')}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < arr.length - 1}
                            onDragStart={handleObsDragStart}
                            onDragOver={handleObsDragOver}
                            onDrop={handleObsDrop}
                            onDragEnd={handleObsDragEnd}
                            onPointerDownGrip={(e) => handleObsGripPointerDown(e, item.uuid, idx)}
                            onPointerMoveGrip={handleObsGripPointerMove}
                            onPointerUpGrip={handleObsGripPointerUp}
                            onTouchStartGrip={(e) => handleObsGripTouchStart(e, item.uuid, idx)}
                            onTouchMoveGrip={handleObsGripTouchMove}
                            onTouchEndGrip={handleObsGripTouchEnd}
                          />
                        ))}
                    </div>
                  )}

                  {/* Empty Search Results Message */}
                  {query && displayedActivePhaseFps.length === 0 && displayedDirectItems.length === 0 && (
                    <div className="p-8 text-center bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 shadow-2xs my-4">
                      <Search size={32} className="text-gray-300 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-gray-800">No observations match "{searchQuery}"</h4>
                      <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                        Try searching by pin number, title, category, room, or drawing name.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="mt-3 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                      >
                        Clear Search
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Generate Report Button at the end of this page */}
              <div className="pt-6 pb-10 flex justify-center">
                <button
                  type="button"
                  onClick={openPDFPreview}
                  className="sitepunch-btn-primary w-full sm:w-auto min-w-[260px] px-8 py-3.5 rounded-2xl text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 hover:opacity-95 transition-all cursor-pointer active:scale-[0.98]"
                  style={{ background: 'var(--brand-button, #a40e26)' }}
                >
                  <FileText size={18} />
                  <span>Generate Report</span>
                </button>
              </div>
            </div>
          ) : (
            /* ── All Reports View: Interactive Switcher Content (Site Visits, Key Plans, Punch Items, Images) ── */
            overviewTab === 'sitevisits' ? (
              <div className="space-y-3">
              {(filter !== 'All' || siteVisitSearchQuery) && (
                <div className="flex items-center justify-between px-1 text-xs text-gray-500">
                  <span>
                    {filter !== 'All' && <>Filtered: <strong className="text-gray-800">{REPORT_FILTER_OPTIONS.find(o => o.id === filter)?.label || filter}</strong> </>}
                    {siteVisitSearchQuery && <>Search: <strong className="text-gray-800">"{siteVisitSearchQuery}"</strong> </>}
                    ({filteredPhases.length})
                  </span>
                  <button
                    onClick={() => { setFilter('All'); setSiteVisitSearchQuery('') }}
                    className="text-brand-700 hover:underline font-semibold cursor-pointer"
                  >
                    Clear Filter
                  </button>
                </div>
              )}

              {/* Grid of Report Cards */}
              {filteredPhases.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 text-center liquid-glass-surface rounded-2xl p-6">
                  <ClipboardList size={44} className="text-gray-300 mb-2" />
                  <p className="text-gray-700 font-semibold text-sm">
                    {phases.length === 0
                      ? 'No Site Visits Created'
                      : siteVisitSearchQuery
                      ? `No site visits match "${siteVisitSearchQuery}"`
                      : `No site visits match "${filter}"`}
                  </p>
                  <p className="text-gray-400 text-xs mt-1 max-w-sm">
                    {phases.length === 0
                      ? 'Create a site visit to organize your key plans and observations.'
                      : siteVisitSearchQuery
                      ? 'Try searching with different keywords or clear the search.'
                      : 'Try clearing the filter to see all site visits.'}
                  </p>
                  {phases.length === 0 ? (
                    <button
                      onClick={() => setShowPhaseModal(true)}
                      className="sitepunch-btn-primary mt-4 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--brand-button, #a40e26)' }}
                    >
                      <Plus size={14} className="inline mr-1" /> Create First Site Visit
                    </button>
                  ) : (
                    <button
                      onClick={() => { setFilter('All'); setSiteVisitSearchQuery('') }}
                      className="text-xs text-brand-700 font-semibold mt-3 hover:underline cursor-pointer"
                    >
                      Show all site visits
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {filteredPhases.map(phase => {
                    const formattedDate = phase.visitDate ? formatDatePattern(phase.visitDate) : ''
                    const phaseFps = floorPlans.filter(fp => fp.phaseUuid === phase.uuid || (!fp.phaseUuid && phase === phases[0]))
                    const phaseFpUuids = new Set(phaseFps.map(fp => fp.uuid))
                    const phaseItems = punchItems.filter(i => (i.phaseUuid === phase.uuid || phaseFpUuids.has(i.floorPlanUuid)))

                    return (
                      <div
                        key={phase.uuid}
                        onClick={() => setCurrentPhase(phase.uuid)}
                        className="rounded-2xl p-3.5 sm:p-4.5 cursor-pointer active:scale-[0.99] transition-all duration-200 group relative border border-l-4 hover:-translate-y-0.5 overflow-hidden"
                        style={{
                          borderLeftColor: '#7e22ce',
                          borderColor: 'rgba(216, 180, 254, 0.55)',
                          background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, #ffffff 45%, rgba(243, 232, 255, 0.75) 100%)',
                          boxShadow: '0 4px 18px -2px rgba(126, 34, 206, 0.14), 0 2px 6px rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200/70 flex items-center justify-center text-purple-700 flex-shrink-0 shadow-2xs">
                                <ClipboardList size={15} className="stroke-[2.2]" />
                              </div>
                              <h3 className="font-semibold text-gray-900 text-base truncate group-hover:text-purple-900 transition-colors">
                                {phase.name}
                              </h3>
                            </div>

                            {(formattedDate || phase.weather) && (
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-gray-500">
                                {formattedDate && (
                                  <span className="flex items-center gap-1.5 flex-shrink-0">
                                    <Calendar size={13} className="text-gray-400 flex-shrink-0" />
                                    <span>{formattedDate}</span>
                                  </span>
                                )}
                                {formattedDate && phase.weather && (
                                  <span>•</span>
                                )}
                                {phase.weather && (
                                  <span className="flex items-center gap-1.5 text-gray-600 flex-shrink-0">
                                    <CloudSun size={14} className="text-gray-400 flex-shrink-0" />
                                    <span>{phase.weather}</span>
                                  </span>
                                )}
                              </div>
                            )}

                            {phase.attendees && (
                              <div
                                className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400 min-w-0"
                                title={phase.attendees}
                              >
                                <Users size={13} className="text-gray-400 flex-shrink-0" />
                                <span className="truncate min-w-0 flex-1">
                                  {formatAttendeesSummary(phase.attendees, 2)}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingPhase(phase)
                              }}
                              className="liquid-pill p-1.5 rounded-xl text-gray-500 hover:text-purple-700 flex items-center justify-center cursor-pointer transition-colors"
                              aria-label="Edit site visit"
                              title="Edit site visit details"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePhase(phase)
                              }}
                              className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center cursor-pointer transition-colors"
                              aria-label="Delete site visit"
                              title="Delete site visit"
                            >
                              <Trash2 size={15} />
                            </button>
                            <ChevronRight size={18} className="text-gray-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all ml-1" />
                          </div>
                        </div>

                        {/* Key Plans & Observations counter */}
                        <div className="flex items-center gap-2 mt-3 pt-0.5 min-w-0">
                          <div className="inline-flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-1 rounded-xl bg-white/70 backdrop-blur-md border border-white/80 shadow-2xs text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-900">{phaseFps.length}</span>
                              <span className="text-[11px] text-gray-500 font-medium">Key Plans</span>
                            </div>
                            <div className="w-px h-3.5 bg-gray-200/80" />
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-900">{phaseItems.length}</span>
                              <span className="text-[11px] text-gray-500 font-medium">Observations</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            ) : overviewTab === 'keyplans' ? (
              /* ── Key Plans Thumbnail Gallery View ── */
              <div className="space-y-4">
                {floorPlans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-56 text-center liquid-glass-surface rounded-2xl p-6">
                    <FileImage size={44} className="text-gray-300 mb-2" />
                    <p className="text-gray-700 font-semibold text-sm">No Key Plans Uploaded</p>
                    <p className="text-gray-400 text-xs mt-1 max-w-sm">
                      Upload architectural drawings, blueprints, or sketches to pin site observations.
                    </p>
                    <button
                      onClick={() => handleOpenAddFloorPlan()}
                      className="sitepunch-btn-primary mt-4 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-sm"
                      style={{ background: 'var(--brand-button, #a40e26)' }}
                    >
                      <Plus size={14} /> Add First Key Plan
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredPhases.map((phase, pIdx) => {
                      const phaseFps = floorPlans.filter(fp => fp.phaseUuid === phase.uuid || (!fp.phaseUuid && phase === phases[0]))
                      if (phaseFps.length === 0) return null

                      return (
                        <div
                          key={phase.uuid}
                          className={`space-y-3 ${pIdx > 0 ? 'mt-6 pt-5 border-t border-gray-200/90' : ''}`}
                        >
                          <div className="flex items-center justify-between px-1 pb-1">
                            <div className="flex items-center gap-2">
                              <ClipboardList size={15} className="text-purple-700 flex-shrink-0" />
                              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                {phase.name} ({phaseFps.length})
                              </h4>
                            </div>
                            <button
                              onClick={() => setCurrentPhase(phase.uuid)}
                              className="text-xs text-purple-700 hover:text-purple-900 font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              Open Visit <ChevronRight size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {phaseFps.map((fp) => {
                              const fpPins = punchItems.filter(i => i.floorPlanUuid === fp.uuid)

                              return (
                                <div
                                  key={fp.uuid}
                                  onClick={() => navigateToFloorPlan(currentProjectUuid, fp.uuid, fp.phaseUuid || phase.uuid)}
                                  className="liquid-glass-card rounded-2xl overflow-hidden cursor-pointer group transition-all duration-200 hover:-translate-y-1 hover:shadow-lg border border-l-4 flex flex-col"
                                  style={{
                                    borderLeftColor: pinColor || 'var(--punch-pin-color, #a40e26)',
                                    borderColor: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.3)',
                                    background: 'linear-gradient(135deg, rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.04) 0%, #ffffff 40%, rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.08) 100%)',
                                    boxShadow: '0 4px 18px -2px rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
                                  }}
                                >
                                  {/* Thumbnail Area */}
                                  <div className="relative w-full h-44 bg-slate-900/5 overflow-hidden flex items-center justify-center border-b border-gray-100">
                                    {fp.imageData || fp.imageUrl ? (
                                      <img
                                        src={fp.imageData || fp.imageUrl}
                                        alt={fp.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      />
                                    ) : (
                                      <div className="flex flex-col items-center justify-center text-gray-400">
                                        <FileImage size={40} className="mb-1 opacity-60" />
                                        <span className="text-[11px] font-medium text-gray-400">Blueprint Drawing</span>
                                      </div>
                                    )}

                                    {/* Pins Count Badge Overlay */}
                                    <div
                                      className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-xs font-black text-white shadow-md flex items-center gap-1 backdrop-blur-xs"
                                      style={{ background: pinColor || 'var(--punch-pin-color, #a40e26)' }}
                                    >
                                      <span>{fpPins.length}</span>
                                      <span className="text-[10px] font-bold opacity-90">{fpPins.length === 1 ? 'PIN' : 'PINS'}</span>
                                    </div>
                                  </div>

                                  {/* Card Content & Meta */}
                                  <div className="p-3.5 flex items-center justify-between gap-2 flex-1">
                                    <div className="min-w-0 flex-1">
                                      <h3 className="font-bold text-gray-900 text-sm truncate group-hover:text-brand-700 transition-colors">
                                        {fp.name}
                                      </h3>
                                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        {fpPins.length} observation{fpPins.length !== 1 ? 's' : ''}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setRenamingFp(fp)
                                        }}
                                        className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-gray-700 transition-colors"
                                        title="Rename key plan"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteFloorPlan(fp.uuid, fp.name)
                                        }}
                                        className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-red-500 transition-colors"
                                        title="Delete key plan"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                      <ChevronRight size={18} className="text-gray-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all ml-1" />
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : overviewTab === 'punchitems' ? (
              /* ── All Punch Items View ── */
              <div className="space-y-4">
                {punchItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-56 text-center liquid-glass-surface rounded-2xl p-6">
                    <AlertCircle size={44} className="text-gray-300 mb-2" />
                    <p className="text-gray-700 font-semibold text-sm">No Punch Items Recorded</p>
                    <p className="text-gray-400 text-xs mt-1 max-w-sm">
                      Record punch list items with photos, categories, and notes.
                    </p>
                    <button
                      onClick={handleAddNewObservationForPhase}
                      className="sitepunch-btn-primary mt-4 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-sm"
                      style={{ background: 'var(--brand-button, #a40e26)' }}
                    >
                      <Plus size={14} /> Add First Observation
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {filteredPhases.map((phase, pIdx) => {
                      const phaseFps = floorPlans.filter(f => f.phaseUuid === phase.uuid || (!f.phaseUuid && phase === phases[0]))
                      const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
                      const phaseItems = punchItems
                        .filter(i => (i.phaseUuid === phase.uuid || phaseFpUuids.has(i.floorPlanUuid)))
                        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))

                      if (phaseItems.length === 0) return null

                      return (
                        <div
                          key={phase.uuid}
                          className={`space-y-2.5 ${pIdx > 0 ? 'mt-6 pt-5 border-t border-gray-200/90' : ''}`}
                        >
                          <div className="flex items-center justify-between px-1 pb-1">
                            <div className="flex items-center gap-2">
                              <ClipboardList size={15} className="text-purple-700 flex-shrink-0" />
                              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                {phase.name} ({phaseItems.length})
                              </h4>
                            </div>
                            <button
                              onClick={() => setCurrentPhase(phase.uuid)}
                              className="text-xs text-purple-700 hover:text-purple-900 font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              Open Visit <ChevronRight size={13} />
                            </button>
                          </div>
                          <div className="space-y-2">
                            {phaseItems.map(item => {
                              const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
                              return (
                                <PunchItemRow
                                  key={item.uuid}
                                  item={item}
                                  floorPlan={fp}
                                  phase={phase}
                                  showPhase={true}
                                  onStatusChange={(nextStatus) => handleObservationStatusChange(item, nextStatus)}
                                  onClick={() => { setCurrentPunchItem(item.uuid); openPunchForm() }}
                                  onDelete={() => handleDeletePunchItem(item.uuid)}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── Images Gallery View ── */
              <div className="space-y-4">
                {galleryPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-56 text-center liquid-glass-surface rounded-2xl p-6">
                    <Camera size={44} className="text-gray-300 mb-2" />
                    <p className="text-gray-700 font-semibold text-sm">No Images Captured</p>
                    <p className="text-gray-400 text-xs mt-1 max-w-sm">
                      Photos added to observations across all site visits will appear in this unified gallery.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredPhases.map((phase, pIdx) => {
                      const phaseFps = floorPlans.filter(f => f.phaseUuid === phase.uuid || (!f.phaseUuid && phase === phases[0]))
                      const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
                      const phaseItemUuids = new Set(
                        punchItems
                          .filter(i => (i.phaseUuid === phase.uuid || phaseFpUuids.has(i.floorPlanUuid)))
                          .map(i => i.uuid)
                      )
                      const phasePhotos = galleryPhotos.filter(ph => phaseItemUuids.has(ph.punchItemUuid))

                      if (phasePhotos.length === 0) return null

                      return (
                        <div
                          key={phase.uuid}
                          className={`space-y-3 ${pIdx > 0 ? 'mt-6 pt-5 border-t border-gray-200/90' : ''}`}
                        >
                          <div className="flex items-center justify-between px-1 pb-1">
                            <div className="flex items-center gap-2">
                              <ClipboardList size={15} className="text-purple-700 flex-shrink-0" />
                              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                {phase.name} ({phasePhotos.length})
                              </h4>
                            </div>
                            <button
                              onClick={() => setCurrentPhase(phase.uuid)}
                              className="text-xs text-purple-700 hover:text-purple-900 font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              Open Visit <ChevronRight size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {phasePhotos.map((photo) => {
                              const item = punchItems.find(i => i.uuid === photo.punchItemUuid)
                              const fp = item ? floorPlans.find(f => f.uuid === item.floorPlanUuid) : null
                              const imgSrc = photo.imageData || photo.dataUrl

                              if (!imgSrc) return null

                              return (
                                <div
                                  key={photo.uuid || photo.id}
                                  onClick={() => openGalleryPhotoPreview({ photo, item, phase, floorPlan: fp })}
                                  className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group bg-slate-900/5 border border-white/80 shadow-2xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                                >
                                  <img
                                    src={imgSrc}
                                    alt={item?.title || 'Observation photo'}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    loading="lazy"
                                  />

                                  {/* Top pin number badge */}
                                  {item?.itemNumber && (
                                    <div
                                      className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-black text-white shadow-md flex items-center gap-0.5"
                                      style={{ background: pinColor || 'var(--punch-pin-color, #a40e26)' }}
                                    >
                                      <span>#{item.itemNumber}</span>
                                    </div>
                                  )}

                                  {/* Bottom hover details */}
                                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end">
                                    <p className="text-[11px] font-bold truncate">
                                      {item?.title || item?.notes || `Item #${item?.itemNumber || ''}`}
                                    </p>
                                    {fp && (
                                      <p className="text-[10px] text-white/80 truncate mt-0.5">
                                        {fp.name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          )
        )}
        </div>
      </main>

      {/* FAB */}
      <div
        className="fixed z-20"
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'max(1.5rem, calc((100vw - 56rem) / 2 + 1.5rem + env(safe-area-inset-right, 0px)))',
        }}
      >
        {!activePhase ? (
          overviewTab === 'keyplans' ? (
            <button
              onClick={() => handleOpenAddFloorPlan()}
              className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-xl transition-all font-semibold text-sm cursor-pointer"
              style={{ background: 'var(--brand-button, #a40e26)' }}
              title="Add Key Plan"
            >
              <Plus size={20} />
              Add Key Plan
            </button>
          ) : overviewTab === 'punchitems' ? (
            <button
              onClick={handleAddNewObservationForPhase}
              className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-xl transition-all font-semibold text-sm cursor-pointer"
              style={{ background: 'var(--brand-button, #a40e26)' }}
              title="Add Observation"
            >
              <Plus size={20} />
              Add Observation
            </button>
          ) : (
            <button
              onClick={() => { setEditingPhase(null); setShowPhaseModal(true) }}
              className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-xl transition-all font-semibold text-sm cursor-pointer"
              style={{ background: 'var(--brand-button, #a40e26)' }}
              title="Create a new site visit"
            >
              <Plus size={20} />
              New Site Visit
            </button>
          )
        ) : (
          <div
            className="relative flex flex-col items-end"
            onMouseEnter={handleFabMouseEnter}
            onMouseLeave={handleFabMouseLeave}
          >
            {/* Popover options menu (shows on hover or click) */}
            <div
              className={`absolute bottom-full right-0 mb-3 flex flex-col items-end gap-2.5 transition-all duration-200 ${
                fabOpen
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              {/* Option 1: Add Key Plan */}
              <button
                type="button"
                onClick={() => {
                  setFabOpen(false)
                  handleOpenAddFloorPlan(activePhase.uuid)
                }}
                className="liquid-glass-surface flex items-center gap-2.5 px-4 py-2.5 rounded-full text-slate-800 text-xs font-bold transition-all hover:scale-105 whitespace-nowrap cursor-pointer shadow-xl hover:bg-white"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ color: 'var(--punch-pin-color, #a40e26)', background: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.15)' }}
                >
                  <FileImage size={14} />
                </div>
                <span>Add Key Plan</span>
              </button>

              {/* Option 2: Add Observation */}
              <button
                type="button"
                onClick={() => {
                  setFabOpen(false)
                  handleAddNewObservationForPhase()
                }}
                className="liquid-glass-surface flex items-center gap-2.5 px-4 py-2.5 rounded-full text-slate-800 text-xs font-bold transition-all hover:scale-105 whitespace-nowrap cursor-pointer shadow-xl hover:bg-white"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ color: 'var(--punch-pin-color, #a40e26)', background: 'rgba(var(--punch-pin-color-rgb, 164, 14, 38), 0.15)' }}
                >
                  <Plus size={14} />
                </div>
                <span>Add Observation</span>
              </button>
            </div>

            {/* Main Single FAB Button */}
            <button
              type="button"
              onClick={() => setFabOpen(o => !o)}
              className="sitepunch-fab flex items-center gap-2 text-white px-5 py-3.5 rounded-full shadow-2xl transition-all font-semibold text-sm cursor-pointer"
              style={{ background: 'var(--brand-button, #a40e26)' }}
              title="Add Key Plan or Observation"
            >
              <Plus
                size={20}
                className={`transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`}
              />
              <span>Add</span>
            </button>
          </div>
        )}
      </div>

      {showFloorPlanManager && (
        <FloorPlanManagerModal
          projectUuid={currentProjectUuid}
          defaultPhaseUuid={targetPhaseUuid}
          onClose={() => { setTargetPhaseUuid(null); closeFloorPlanManager() }}
          onSaved={load}
        />
      )}
      {showPhaseModal && (
        <PhaseModal
          projectUuid={currentProjectUuid}
          phase={null}
          onClose={() => setShowPhaseModal(false)}
          onSaved={load}
        />
      )}
      {editingPhase && (
        <PhaseModal
          projectUuid={currentProjectUuid}
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSaved={load}
        />
      )}
      {renamingFp && <RenameFloorPlanModal floorPlan={renamingFp} onClose={() => setRenamingFp(null)} onSaved={load} />}
      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setProject(updated)
            load()
          }}
        />
      )}

      {/* ── Photo Preview Lightbox Modal ── */}
      {activePreviewPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between overflow-hidden animate-fade-in select-none"
          style={{
            paddingTop: 'max(14px, env(safe-area-inset-top, 16px))',
            paddingBottom: 'max(14px, env(safe-area-inset-bottom, 16px))',
            paddingLeft: 'max(14px, env(safe-area-inset-left, 16px))',
            paddingRight: 'max(14px, env(safe-area-inset-right, 16px))',
          }}
          onClick={() => setPreviewPhotoIndex(null)}
        >
          {/* Top Header */}
          <div
            className="flex items-center justify-between max-w-5xl mx-auto w-full text-white px-2 py-2 flex-shrink-0 z-30 gap-2"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {activePreviewPhoto.item?.itemNumber && (
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 shadow-md text-white"
                  style={{ background: pinColor || 'var(--punch-pin-color, #a40e26)' }}
                >
                  #{activePreviewPhoto.item.itemNumber}
                </span>
              )}
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-base truncate">
                  {activePreviewPhoto.item?.title || activePreviewPhoto.item?.notes || 'Photo Preview'}
                </h3>
                <p className="text-[11px] text-white/70 truncate mt-0.5">
                  {activePreviewPhoto.phase?.name ? `${activePreviewPhoto.phase.name} ` : ''}
                  {activePreviewPhoto.floorPlan?.name ? `• ${activePreviewPhoto.floorPlan.name}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {displayedGalleryPhotos.length > 1 && (
                <span className="text-xs font-mono font-bold text-white/80 bg-white/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                  {previewPhotoIndex + 1} / {displayedGalleryPhotos.length}
                </span>
              )}
              {activePreviewPhoto.item && (
                <button
                  type="button"
                  onClick={() => {
                    const itemUuid = activePreviewPhoto.item.uuid
                    setPreviewPhotoIndex(null)
                    setCurrentPunchItem(itemUuid)
                    openPunchForm()
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Edit2 size={13} /> <span className="hidden sm:inline">Edit Item</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreviewPhotoIndex(null)}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
                aria-label="Close photo preview"
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Center Image Container with Desktop Arrows & Mobile Swipe */}
          <div
            className="flex-1 min-h-0 relative w-full flex items-center justify-center p-2 overflow-hidden"
            onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Desktop Previous Button */}
            {displayedGalleryPhotos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePrevPhoto()
                }}
                className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 active:scale-95 text-white backdrop-blur-md items-center justify-center transition-all shadow-xl hover:scale-105 z-20 cursor-pointer border border-white/20"
                title="Previous photo (Left arrow)"
                aria-label="Previous photo"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* Main Observation Photo */}
            <img
              key={activePreviewPhoto.photo.uuid || activePreviewPhoto.photo.id || previewPhotoIndex}
              src={activePreviewPhoto.photo.imageData || activePreviewPhoto.photo.dataUrl}
              alt={activePreviewPhoto.item?.title || 'Observation photo'}
              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl select-none"
              draggable={false}
            />

            {/* Desktop Next Button */}
            {displayedGalleryPhotos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNextPhoto()
                }}
                className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 active:scale-95 text-white backdrop-blur-md items-center justify-center transition-all shadow-xl hover:scale-105 z-20 cursor-pointer border border-white/20"
                title="Next photo (Right arrow)"
                aria-label="Next photo"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>

          {/* Bottom Caption / Notes & Mobile Touch Navigation */}
          <div
            className="max-w-2xl mx-auto w-full text-center text-white/90 text-xs sm:text-sm bg-black/60 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex-shrink-0 z-20 space-y-2"
            onClick={e => e.stopPropagation()}
          >
            {activePreviewPhoto.item?.notes && (
              <p className="line-clamp-2 leading-relaxed">{activePreviewPhoto.item.notes}</p>
            )}
            {displayedGalleryPhotos.length > 1 && (
              <div className="flex items-center justify-between sm:hidden pt-1 border-t border-white/10 text-xs text-white/90">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePrevPhoto()
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 flex items-center gap-1 font-bold cursor-pointer"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="font-mono text-[11px] text-white/60">Swipe left/right</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleNextPhoto()
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 flex items-center gap-1 font-bold cursor-pointer"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="text-center min-w-[38px]">
      <p className={`text-lg font-bold leading-none ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 font-medium mt-0.5 whitespace-nowrap">{label}</p>
    </div>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div className="flex-1 text-center">
      <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
      <p className="text-xs text-brand-300 mt-0.5">{label}</p>
    </div>
  )
}
function TabBtn({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold border-b-2 transition-colors ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'
      }`}
      style={active ? { borderColor: 'var(--brand-color, #a40e26)', color: 'var(--brand-button, #a40e26)' } : {}}
    >
      {icon}{label}
    </button>
  )
}
function FloorPlanCard({
  fp, index, punchItems, onClick, onRename, onDelete,
  onMoveUp, onMoveDown, canMoveUp, canMoveDown,
  isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onGripPointerDown, onGripPointerMove, onGripPointerUp,
  onGripTouchStart, onGripTouchMove, onGripTouchEnd,
  isExpanded = false, onToggleAccordion,
}) {
  const pinColor = useAppStore(s => s.pinColor)
  const { r, g, b } = hexToRgb(pinColor)
  const sorted = [...punchItems].sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
  const minNum = sorted.length > 0 ? sorted[0].itemNumber : null
  const maxNum = sorted.length > 0 ? sorted[sorted.length - 1].itemNumber : null

  return (
    <div
      data-fp-uuid={fp.uuid}
      draggable={true}
      onDragStart={(e) => onDragStart(e, fp.uuid)}
      onDragOver={(e) => onDragOver(e, fp.uuid)}
      onDrop={(e) => onDrop(e, fp.uuid)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`liquid-glass-card rounded-2xl p-3.5 cursor-pointer flex gap-3 items-center group transition-all select-none border border-l-4 ${
        isDragging
          ? 'opacity-40 border-dashed border-brand-400 scale-[0.98]'
          : isDragOver
            ? 'ring-2 ring-brand-400 scale-[1.01]'
            : 'hover:shadow-md'
      }`}
      style={{
        borderLeftColor: pinColor || 'var(--punch-pin-color, #a40e26)',
        borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
        background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.05) 0%, #ffffff 50%, rgba(${r}, ${g}, ${b}, 0.09) 100%)`,
        boxShadow: `0 4px 18px -2px rgba(${r}, ${g}, ${b}, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)`,
      }}
    >
      {/* Drag Grip Handle for Mouse and Touch / Finger */}
      <div
        className="flex items-center justify-center p-1.5 -ml-1 text-gray-400 hover:text-brand-600 active:text-brand-700 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none rounded-lg hover:bg-white/60 transition-colors"
        title="Drag with mouse or finger to reorder key plan sequence"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => onGripPointerDown(e, fp.uuid, index - 1)}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onTouchStart={(e) => onGripTouchStart(e, fp.uuid, index - 1)}
        onTouchMove={onGripTouchMove}
        onTouchEnd={onGripTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={20} className="block pointer-events-none" />
      </div>

      {/* Pin count accordion toggle button: height matches the h-14 image preview next to it */}
      <div className="flex flex-col items-center justify-center flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleAccordion?.()
          }}
          className={`h-14 min-w-[62px] px-2.5 rounded-xl flex flex-col items-center justify-center text-white shadow-xs transition-all cursor-pointer active:scale-95 group/pinbtn ${
            isExpanded
              ? 'ring-2 ring-offset-2 ring-emerald-500 scale-[1.02]'
              : 'hover:opacity-95 hover:scale-[1.03]'
          }`}
          style={{ background: pinColor || 'var(--punch-pin-color, #a40e26)' }}
          title={isExpanded ? 'Collapse observations' : `Show ${sorted.length} observation${sorted.length === 1 ? '' : 's'} (accordion)`}
        >
          <span className="text-xs uppercase font-black text-white leading-tight tracking-wider flex items-center gap-0.5">
            {sorted.length === 1 ? 'Pin' : 'Pins'}
            {isExpanded ? (
              <ChevronUp size={11} className="text-white" />
            ) : (
              <ChevronDown size={11} className="text-white/80 group-hover/pinbtn:text-white" />
            )}
          </span>
          <span className="text-xs font-black text-white leading-tight whitespace-nowrap mt-0.5">
            {sorted.length > 0
              ? (sorted.length === 1 ? `#${minNum}` : `#${minNum}–#${maxNum}`)
              : '0'}
          </span>
        </button>
      </div>

      {/* Image Preview with distinct border */}
      <div className="w-14 h-14 bg-white rounded-xl overflow-hidden flex-shrink-0 border-2 border-gray-300 shadow-xs">
        {fp.imageData
          ? <img src={fp.imageData} alt={fp.name} className="w-full h-full object-cover pointer-events-none" />
          : <FileImage size={24} className="m-auto mt-3.5 text-gray-400" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{fp.name}</h3>
        <p className="text-xs text-gray-500 font-medium mt-0.5">
          {sorted.length} observation{sorted.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Action buttons: Move Up / Down, Rename, Delete */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onMoveUp && onMoveDown && (
          <div className="flex flex-col mr-1 border-r border-gray-200 pr-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp() }}
              disabled={!canMoveUp}
              className={`p-1 rounded transition-colors cursor-pointer ${canMoveUp ? 'text-gray-500 hover:text-brand-600 hover:bg-white/60' : 'text-gray-200 cursor-not-allowed'}`}
              title="Move key plan up (updates pin sequence)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown() }}
              disabled={!canMoveDown}
              className={`p-1 rounded transition-colors cursor-pointer ${canMoveDown ? 'text-gray-500 hover:text-brand-600 hover:bg-white/60' : 'text-gray-200 cursor-not-allowed'}`}
              title="Move key plan down (updates pin sequence)"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRename(fp)
          }}
          className="liquid-pill p-1.5 rounded-xl text-gray-500 hover:text-brand-600 flex items-center justify-center cursor-pointer"
          title="Edit key plan"
        >
          <Edit2 size={15} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(fp.uuid, fp.name)
          }}
          className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-red-600 flex items-center justify-center cursor-pointer"
          title="Delete key plan"
        >
          <Trash2 size={15} />
        </button>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all ml-0.5" />
      </div>
    </div>
  )
}
function PunchItemRow({
  item,
  floorPlan,
  phase,
  showPhase = true,
  onStatusChange,
  onClick,
  onEdit,
  onDelete,
  draggable = false,
  isDragging = false,
  isDragOver = false,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPointerDownGrip,
  onPointerMoveGrip,
  onPointerUpGrip,
  onTouchStartGrip,
  onTouchMoveGrip,
  onTouchEndGrip,
}) {
  const pinColor = useAppStore(s => s.pinColor)
  const { r, g, b } = hexToRgb(pinColor)
  return (
    <div
      data-item-uuid={item.uuid}
      draggable={draggable}
      onDragStart={(e) => onDragStart && onDragStart(e, item.uuid)}
      onDragOver={(e) => onDragOver && onDragOver(e, item.uuid)}
      onDrop={(e) => onDrop && onDrop(e, item.uuid)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`liquid-glass-card rounded-2xl p-3.5 flex gap-3 items-center cursor-pointer group transition-all select-none border border-l-4 ${
        isDragging
          ? 'opacity-40 border-dashed border-brand-400 scale-[0.98]'
          : isDragOver
            ? 'ring-2 ring-brand-400 scale-[1.01]'
            : 'active:scale-[0.99] hover:shadow-md'
      }`}
      style={{
        borderLeftColor: pinColor || 'var(--punch-pin-color, #a40e26)',
        borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
        background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.05) 0%, #ffffff 50%, rgba(${r}, ${g}, ${b}, 0.09) 100%)`,
        boxShadow: `0 4px 18px -2px rgba(${r}, ${g}, ${b}, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)`,
      }}
    >
      {/* Drag Grip Handle for Mouse and Touch / Finger */}
      {draggable && (
        <div
          className="flex items-center justify-center p-1.5 -ml-1 text-gray-400 hover:text-brand-600 active:text-brand-700 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none rounded-lg hover:bg-white/60 transition-colors"
          title="Drag with mouse or finger to reorder observation sequence"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDownGrip}
          onPointerMove={onPointerMoveGrip}
          onPointerUp={onPointerUpGrip}
          onTouchStart={onTouchStartGrip}
          onTouchMove={onTouchMoveGrip}
          onTouchEnd={onTouchEndGrip}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={20} className="block pointer-events-none" />
        </div>
      )}

      {/* Observation Pin Number */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 shadow-sm text-white"
        style={{ background: pinColor || 'var(--punch-pin-color, #a40e26)' }}
      >
        {item.itemNumber}
      </div>

      {/* Observation Title & Details */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-gray-900 text-sm truncate max-w-[280px] sm:max-w-[360px] md:max-w-[480px]"
          title={item.title || item.notes || `Item #${item.itemNumber}`}
        >
          {truncateObservationTitle(item.title || item.notes || `Item #${item.itemNumber}`, 53)}
        </p>
        <div className="flex gap-2 mt-0.5 flex-wrap items-center">
          <ObservationStatusSelect status={item.status} onChange={onStatusChange} size="sm" />
          {item.priority && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold shadow-2xs ${PRIORITY_BADGES[item.priority] || 'bg-gray-100 text-gray-600'}`}>
              {item.priority}
            </span>
          )}
          {item.trade && <span className="text-xs text-gray-500 font-semibold">{item.trade}</span>}
          {floorPlan && (
            <span className="text-xs text-gray-400 flex items-center gap-1 font-medium">
              • {showPhase && phase ? `${phase.name} › ` : ''}{floorPlan.name}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons: Move Up / Down, Edit, Delete */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onMoveUp && onMoveDown && (
          <div className="flex flex-col mr-1 border-r border-gray-200 pr-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp() }}
              disabled={!canMoveUp}
              className={`p-1 rounded transition-colors cursor-pointer ${canMoveUp ? 'text-gray-500 hover:text-brand-600 hover:bg-white/60' : 'text-gray-200 cursor-not-allowed'}`}
              title="Move observation up (updates sequence)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown() }}
              disabled={!canMoveDown}
              className={`p-1 rounded transition-colors cursor-pointer ${canMoveDown ? 'text-gray-500 hover:text-brand-600 hover:bg-white/60' : 'text-gray-200 cursor-not-allowed'}`}
              title="Move observation down (updates sequence)"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onEdit) onEdit()
            else if (onClick) onClick()
          }}
          className="liquid-pill p-1.5 rounded-xl text-gray-500 hover:text-brand-600 flex items-center justify-center cursor-pointer transition-colors"
          title="Edit observation"
        >
          <Edit2 size={15} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center cursor-pointer transition-colors"
          title="Delete punch item"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
function PunchListEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-56 text-center">
      <AlertCircle size={48} className="text-gray-200 mb-3" />
      <p className="text-gray-500 font-semibold">No Punch Items Yet</p>
      <p className="text-gray-400 text-sm mt-1">Go to a key plan and tap to add observations.</p>
    </div>
  )
}
function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
