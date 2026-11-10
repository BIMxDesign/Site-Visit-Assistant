import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft, Plus, FileImage, Trash2, ChevronRight,
  FileText, AlertCircle, CheckCircle, Clock, MoreVertical,
  Download, Share2, Edit2, Filter, Check, ClipboardList,
  ChevronDown, ChevronUp, MapPin, Calendar, CloudSun, Users,
  GripVertical, Layers, ListOrdered, FolderOpen, Camera, User
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
import { formatVisitDateTime, formatAttendeesTruncated, formatAttendeesSummary, truncateObservationTitle, formatDatePattern } from '../utils/formatters'

const REPORT_FILTER_OPTIONS = [
  { id: 'All',           label: 'All Reports' },
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
    navigateToDashboard, navigateToFloorPlan,
    openFloorPlanManager, showFloorPlanManager, closeFloorPlanManager,
    openPDFPreview, openPunchForm, setCurrentPunchItem,
    showPunchForm,
  } = useAppStore()

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

    const [fps, items] = await Promise.all([
      getFloorPlans(currentProjectUuid),
      getPunchItems(currentProjectUuid),
    ])

    setProject(proj)
    setPhases(phaseList)
    setFloorPlans(sortFloorPlans(fps))
    setPunchItems(items)

    const itemUuids = items.map(i => i.uuid)
    const photoCount = itemUuids.length > 0
      ? await db.photos.where('punchItemUuid').anyOf(itemUuids).count().catch(() => 0)
      : 0
    setTotalPhotos(photoCount)
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
  }, [phases, floorPlans, filter])

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
    if (!activePhase) return
    const { savePunchItem, getNextItemNumber } = await import('../db/database')
    const { v4: uuidv4 } = await import('uuid')
    const nextNumber = await getNextItemNumber(currentProjectUuid, activePhase.uuid)
    const newUuid = uuidv4()
    const newItem = {
      uuid: newUuid,
      projectUuid: currentProjectUuid,
      floorPlanUuid: null,
      phaseUuid: activePhase.uuid,
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
      `Delete Report "${phase.name}"?\n\nThis will permanently delete this report, along with its ${phaseFps.length} key plan(s) and ${phaseItems.length} observation(s).`
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
        <div className="flex items-center gap-2 min-h-[44px]">
          <button
            onClick={activePhase ? () => setCurrentPhase(null) : navigateToDashboard}
            className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
            title={activePhase ? "Back to Reports" : "Back to Projects"}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {activePhase ? (
              <>
                <h1 className="font-extrabold text-base sm:text-lg leading-tight truncate text-white drop-shadow-xs">
                  {activePhase.name}
                </h1>
                <p className="text-white/85 text-xs sm:text-sm leading-tight mt-0.5 truncate font-medium">
                  {project.name}{project.number ? ` · #${project.number}` : ''}
                </p>
              </>
            ) : (
              <>
                <h1 className="font-extrabold text-base sm:text-lg leading-tight truncate text-white drop-shadow-xs">
                  Reports
                </h1>
                <p className="text-white/85 text-xs sm:text-sm leading-tight mt-0.5 truncate font-medium">
                  {project.name}{project.number ? ` · #${project.number}` : ''}
                </p>
              </>
            )}
          </div>

          {activePhase ? (
            <button
              onClick={openPDFPreview}
              className="liquid-glass-btn min-h-[40px] px-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 text-white text-xs font-bold flex-shrink-0 cursor-pointer"
              title="Export report"
            >
              <FileText size={15} />
              <span>Export</span>
            </button>
          ) : (
            /* Filter button moved to top menu bar right end */
            <div className="relative flex-shrink-0 z-50" id="report-filter-container">
              <button
                type="button"
                onClick={() => setShowFilter(f => !f)}
                className={`liquid-glass-btn min-h-[40px] px-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 text-white text-xs font-bold flex-shrink-0 cursor-pointer ${
                  filter !== 'All' ? 'bg-white/30 ring-1 ring-white/50' : ''
                }`}
                title="Filter and sort reports"
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
                        color:      filter === opt.id ? 'var(--brand-color, #1d4ed8)' : '#374151',
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
        {/* Statistics Banner: Only shown on All Reports page */}
        {!activePhase && (
          <div className="liquid-glass-surface rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                  <ClipboardList size={14} className="text-blue-600" />
                  <span>Reports</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{phases.length}</p>
              </div>

              <div className="p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                  <FileImage size={14} className="text-indigo-600" />
                  <span>Key Plans</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{floorPlans.length}</p>
              </div>

              <div className="p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                  <AlertCircle size={14} className="text-red-500" />
                  <span>Punch Items</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{punchItems.length}</p>
              </div>

              <div className="p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                  <Camera size={14} className="text-emerald-600" />
                  <span>Images</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{totalPhotos}</p>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'floorplans' && (
          activePhase ? (
            /* ── Single Report Opened View: See all floor plans in this report ── */
            <div className="space-y-4">
              {/* Site Visit Details Card */}
              <div
                className="liquid-glass-card rounded-2xl p-4 sm:p-5 transition-all"
                style={{ borderLeft: '4px solid var(--brand-button, #1d4ed8)' }}
              >
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
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Report Created By</span>
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
                        className="sitepunch-btn-primary px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2"
                        style={{ background: 'var(--brand-button, #1d4ed8)' }}
                      >
                        <FileImage size={15} />
                        <span>Upload Key Plan Image</span>
                      </button>
                      <button
                        onClick={handleAddNewObservationForPhase}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-gray-50 text-gray-800 transition-colors flex items-center gap-2 border border-gray-300 shadow-2xs"
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
                            Observations in this Report
                          </h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200/80">
                            {activePhaseItems.length}
                          </span>
                        </div>
                        <button
                          onClick={handleAddNewObservationForPhase}
                          className="sitepunch-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                          style={{ background: 'var(--brand-button, #1d4ed8)' }}
                        >
                          <Plus size={13} />
                          <span>Add Observation</span>
                        </button>
                      </div>
                      {activePhaseItems
                        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
                        .map(item => (
                          <PunchItemRow
                            key={item.uuid}
                            item={item}
                            floorPlan={null}
                            phase={activePhase}
                            showPhase={false}
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
                        <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-200/80 flex items-center justify-center text-brand-700 shadow-2xs flex-shrink-0">
                          <FileImage size={17} className="stroke-[2.2]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                              Key Plans
                            </h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200/80">
                              {activePhaseFps.length}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Drag ⋮⋮ with mouse or finger to reorder sequence
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleOpenAddFloorPlan(activePhase.uuid)}
                          className="sitepunch-btn-primary inline-flex items-center gap-1.5 text-xs font-bold bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                          style={{ background: 'var(--brand-button, #1d4ed8)' }}
                          title="Add Key Plan"
                        >
                          <Plus size={14} />
                          <span>Add Key Plan</span>
                        </button>
                      </div>
                    </div>
                    {activePhaseFps.map((fp, idx) => {
                      const fpPunchItems = punchItems
                        .filter(i => i.floorPlanUuid === fp.uuid)
                        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
                      const isExpanded = expandedFpUuids.has(fp.uuid)

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
                            <div className="pl-3 sm:pl-7 pr-1 space-y-2 animate-fade-in border-l-2 border-brand-300 ml-4 sm:ml-6 my-2">
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
                  {activePhaseItems.some(i => !i.floorPlanUuid) && (
                    <div className="space-y-2 pt-2 border-t border-gray-150">
                      <div className="flex items-center justify-between pb-1 gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                              Direct List Observations
                            </h4>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200/80">
                              {activePhaseItems.filter(i => !i.floorPlanUuid).length}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Drag ⋮⋮ with mouse or finger to reorder sequence
                          </p>
                        </div>
                        <button
                          onClick={handleAddNewObservationForPhase}
                          className="sitepunch-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                          style={{ background: 'var(--brand-button, #1d4ed8)' }}
                        >
                          <Plus size={13} />
                          <span>Add Observation</span>
                        </button>
                      </div>
                      {activePhaseItems
                        .filter(i => !i.floorPlanUuid)
                        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0) || (a.createdAt || 0) - (b.createdAt || 0))
                        .map((item, idx, arr) => (
                          <PunchItemRow
                            key={item.uuid}
                            item={item}
                            floorPlan={null}
                            phase={activePhase}
                            showPhase={false}
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
                </div>
              )}
            </div>
          ) : (
            /* ── All Reports View: Click to open and see all floor plans ── */
            <div className="space-y-3">
              {filter !== 'All' && (
                <div className="flex items-center justify-between px-1 text-xs text-gray-500">
                  <span>Filtered: <strong className="text-gray-800">{REPORT_FILTER_OPTIONS.find(o => o.id === filter)?.label || filter}</strong> ({filteredPhases.length})</span>
                  <button
                    onClick={() => setFilter('All')}
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
                    {phases.length === 0 ? 'No Reports Created' : `No reports match "${filter}"`}
                  </p>
                  <p className="text-gray-400 text-xs mt-1 max-w-sm">
                    {phases.length === 0
                      ? 'Create a report to organize your key plans and observations.'
                      : 'Try clearing the filter to see all reports.'}
                  </p>
                  {phases.length === 0 ? (
                    <button
                      onClick={() => setShowPhaseModal(true)}
                      className="sitepunch-btn-primary mt-4 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{ background: 'var(--brand-button, #1d4ed8)' }}
                    >
                      <Plus size={14} className="inline mr-1" /> Create First Report
                    </button>
                  ) : (
                    <button
                      onClick={() => setFilter('All')}
                      className="text-xs text-brand-700 font-semibold mt-3 hover:underline cursor-pointer"
                    >
                      Show all reports
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {filteredPhases.map(phase => {
                    const formattedDate = phase.visitDate ? formatDatePattern(phase.visitDate) : ''

                    return (
                      <div
                        key={phase.uuid}
                        onClick={() => setCurrentPhase(phase.uuid)}
                        className="rounded-2xl p-4 sm:p-4.5 cursor-pointer active:scale-[0.99] transition-all duration-200 group relative border border-l-4 hover:-translate-y-0.5"
                        style={{
                          borderLeftColor: 'var(--brand-button, #1d4ed8)',
                          borderColor: 'var(--brand-200, #bfdbfe)',
                          background: 'linear-gradient(135deg, var(--brand-50, #eff6ff) 0%, #ffffff 45%, var(--brand-50, #eff6ff) 100%)',
                          boxShadow: '0 4px 18px -2px rgba(var(--brand-button-rgb, 29, 78, 216), 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-base truncate">{phase.name}</h3>

                            {(formattedDate || phase.weather) && (
                              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
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
                              className="liquid-pill p-1.5 rounded-xl text-gray-500 hover:text-brand-600 flex items-center justify-center cursor-pointer transition-colors"
                              aria-label="Edit report"
                              title="Edit report details"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePhase(phase)
                              }}
                              className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center cursor-pointer transition-colors"
                              aria-label="Delete report"
                              title="Delete report"
                            >
                              <Trash2 size={15} />
                            </button>
                            <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all ml-1" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        )}

        {activeTab === 'punchlist' && (
          <div className="space-y-3">
            {activePhase && (
              <div className="pb-1">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Observations ({activePhaseItems.length})
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Field observations recorded in this report
                </p>
              </div>
            )}

            {displayedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-xl border border-gray-100 p-6">
                <AlertCircle size={36} className="text-gray-300 mb-2" />
                <p className="text-gray-600 font-semibold text-sm">
                  {activePhase ? `No observations in ${activePhase.name}` : 'No observations yet'}
                </p>
                <p className="text-gray-400 text-xs mt-1 max-w-sm mx-auto">
                  {activePhase
                    ? 'Key plans are optional. Tap "Add Observation" to record punch list items with photos, category, and notes.'
                    : 'Open a report to record punch items.'}
                </p>
                {activePhase && (
                  <button
                    onClick={handleAddNewObservationForPhase}
                    className="sitepunch-btn-primary mt-4 bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-brand-800 shadow-sm flex items-center gap-1.5"
                    style={{ background: 'var(--brand-button, #1d4ed8)' }}
                  >
                    <Plus size={14} />
                    <span>Add First Observation</span>
                  </button>
                )}
              </div>
            ) : (
              (activePhase ? [activePhase] : phases).map((phase, pIdx) => {
                const phaseFps = floorPlans.filter(f => f.phaseUuid === phase.uuid || (!f.phaseUuid && phase === phases[0]))
                const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
                const phaseItems = punchItems
                  .filter(i => (i.phaseUuid === phase.uuid || phaseFpUuids.has(i.floorPlanUuid)))
                  .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))

                if (phaseItems.length === 0) return null

                return (
                  <div
                    key={phase.uuid}
                    className={`space-y-2.5 ${!activePhase && pIdx > 0 ? 'mt-8 pt-5 border-t border-gray-200/90' : 'pt-1'}`}
                  >
                    {!activePhase && (
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <ClipboardList size={15} className="text-brand-600 flex-shrink-0" />
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          {phase.name} ({phaseItems.length})
                        </h4>
                      </div>
                    )}
                    {phaseItems.map(item => {
                      const fp = floorPlans.find(f => f.uuid === item.floorPlanUuid)
                      return (
                        <PunchItemRow
                          key={item.uuid}
                          item={item}
                          floorPlan={fp}
                          phase={phase}
                          showPhase={!activePhase}
                          onClick={() => { setCurrentPunchItem(item.uuid); openPunchForm() }}
                          onDelete={() => handleDeletePunchItem(item.uuid)}
                        />
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        )}
      </main>

      {/* FAB */}
      <div
        className="fixed z-20"
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
        }}
      >
        {!activePhase ? (
          <button
            onClick={() => { setEditingPhase(null); setShowPhaseModal(true) }}
            className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-xl transition-all font-semibold text-sm"
            style={{ background: 'var(--brand-button, #1d4ed8)' }}
            title="Create a new report"
          >
            <Plus size={20} />
            New Report
          </button>
        ) : activeTab === 'punchlist' ? (
          <button
            onClick={handleAddNewObservationForPhase}
            className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-xl transition-all font-semibold text-sm"
            style={{ background: 'var(--brand-button, #1d4ed8)' }}
            title="Add Observation"
          >
            <Plus size={20} />
            Add Observation
          </button>
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
                <div className="w-6 h-6 rounded-full bg-blue-500/15 text-brand-700 flex items-center justify-center flex-shrink-0">
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
                <div className="w-6 h-6 rounded-full bg-blue-500/15 text-brand-700 flex items-center justify-center flex-shrink-0">
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
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
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
      style={active ? { borderColor: 'var(--brand-color, #1d4ed8)', color: 'var(--brand-button, #1d4ed8)' } : {}}
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
      className={`liquid-glass-card rounded-2xl p-3.5 cursor-pointer flex gap-3 items-center group transition-all select-none ${
        isDragging
          ? 'opacity-40 border-dashed border-brand-400 scale-[0.98]'
          : isDragOver
            ? 'ring-2 ring-brand-400 scale-[1.01]'
            : 'hover:shadow-md'
      }`}
      style={{ borderLeft: '4px solid var(--brand-button, #1d4ed8)' }}
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
          style={{ background: pinColor || '#10b981' }}
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
  return (
    <div
      data-item-uuid={item.uuid}
      draggable={draggable}
      onDragStart={(e) => onDragStart && onDragStart(e, item.uuid)}
      onDragOver={(e) => onDragOver && onDragOver(e, item.uuid)}
      onDrop={(e) => onDrop && onDrop(e, item.uuid)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`liquid-glass-card rounded-2xl p-3.5 flex gap-3 items-center cursor-pointer group transition-all select-none ${
        isDragging
          ? 'opacity-40 border-dashed border-brand-400 scale-[0.98]'
          : isDragOver
            ? 'ring-2 ring-brand-400 scale-[1.01]'
            : 'active:scale-[0.99] hover:shadow-md'
      }`}
      style={{ borderLeft: '4px solid var(--brand-button, #1d4ed8)' }}
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
        style={{ background: pinColor || '#ef4444' }}
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
