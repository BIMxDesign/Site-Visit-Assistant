import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  ArrowLeft, ZoomIn, ZoomOut, Maximize2, Filter,
  Trash2, Plus, ChevronDown, ChevronUp, GripVertical, Check, FileImage, Edit2, Camera, ClipboardList, FileText,
  Layers, ListOrdered, AlertCircle, Calendar, User, Home
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  db,
  getFloorPlan,
  getFloorPlans,
  deleteFloorPlan,
  getPunchItemsByFloorPlan,
  getPunchItem,
  getNextItemNumber,
  savePunchItem,
  deletePunchItem,
  resequenceReportPins,
  getPrimaryPhotos,
  getPhases,
  getProject,
} from '../db/database'
import { v4 as uuidv4 } from 'uuid'
import RenameFloorPlanModal from '../components/RenameFloorPlanModal'
import Breadcrumbs from '../components/Breadcrumbs'
import ObservationStatusSelect from '../components/ObservationStatusSelect'
import { truncateObservationTitle, formatDatePattern, normalizeObservationStatus } from '../utils/formatters'
import { hexToRgb } from '../utils/theme'

const PIN_SIZE = 28

const PRIORITY_BADGES = {
  Low: 'bg-blue-100 text-blue-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
}

export default function FloorPlanView() {
  const {
    currentProjectUuid,
    currentPhaseUuid,
    currentFloorPlanUuid,
    navigateToDashboard,
    navigateToProjects,
    navigateToProject,
    navigateToFloorPlan,
    openPunchForm,
    setCurrentPunchItem,
    currentPunchItemUuid,
    showPunchForm,
    openPDFPreview,
    pinColor,
    pendingPinInstanceObs,
    setPendingPinInstanceObs,
    clearPendingPinInstanceObs,
  } = useAppStore()

  const { r: pinR, g: pinG, b: pinB } = hexToRgb(pinColor)

  const containerRef = useRef(null)

  const [project,        setProject]        = useState(null)
  const [floorPlan,      setFloorPlan]      = useState(null)
  const [allFloorPlans,  setAllFloorPlans]  = useState([])
  const [phases,         setPhases]         = useState([])
  const [punchItems,     setPunchItems]     = useState([])
  const [pinPhotos,      setPinPhotos]      = useState({})
  const [viewMode,       setViewMode]       = useState('drawing') // 'drawing' | 'list'
  const [showPhotoPreviews, setShowPhotoPreviews] = useState(() => {
    const saved = localStorage.getItem('sitepunch_show_pin_photos')
    return saved !== null ? saved === 'true' : true
  })
  const [loading,        setLoading]        = useState(true)
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 })
  const [imgLoaded,      setImgLoaded]      = useState(false)

  const togglePhotoPreviews = () => {
    setShowPhotoPreviews(prev => {
      const next = !prev
      localStorage.setItem('sitepunch_show_pin_photos', String(next))
      return next
    })
  }

  // Modals & Dropdowns
  const [showFpMenu,      setShowFpMenu]      = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)

  // Pin Dragging state
  const [draggingPinId,  setDraggingPinId]  = useState(null)
  const activePinDrag = useRef(null)

  // Pin Context Menu (Right Click on Desktop / Long Press on Phone & iPad)
  const [pinContextMenu, setPinContextMenu] = useState(null)
  const longPressTimer = useRef(null)
  const longPressTriggered = useRef(false)
  const touchStartPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (pinContextMenu) setPinContextMenu(null)
        if (pendingPinInstanceObs) clearPendingPinInstanceObs()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pinContextMenu, pendingPinInstanceObs, clearPendingPinInstanceObs])

  // Viewport transform
  const [scale,  setScale]  = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const scaleRef  = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  useEffect(() => { scaleRef.current  = scale  }, [scale])
  useEffect(() => { offsetRef.current = offset }, [offset])

  // Canvas Panning / Pinch interaction refs
  const isCanvasDragging = useRef(false)
  const dragStartClient  = useRef(null)
  const dragStartOffset  = useRef(null)
  const hasCanvasMoved   = useRef(false)
  const pinchStartDist   = useRef(null)
  const pinchStartScale  = useRef(null)

  // ── Data loading ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!currentFloorPlanUuid) return
    const [fp, fps, phaseList, proj] = await Promise.all([
      getFloorPlan(currentFloorPlanUuid),
      getFloorPlans(currentProjectUuid),
      getPhases(currentProjectUuid),
      getProject(currentProjectUuid),
    ])

    // Always maintain continuous sequence across drawings in drawing order
    await resequenceReportPins({
      projectUuid: currentProjectUuid,
      phaseUuid: fp?.phaseUuid,
      floorPlanUuid: currentFloorPlanUuid,
    })
    const items = await getPunchItemsByFloorPlan(currentFloorPlanUuid)

    setFloorPlan(fp)
    setAllFloorPlans(fps)
    setPhases(phaseList)
    setProject(proj)
    setPunchItems(items)

    if (items.length > 0) {
      const photoMap = await getPrimaryPhotos(items.map(i => i.uuid))
      setPinPhotos(photoMap)
    } else {
      setPinPhotos({})
    }
    setLoading(false)
  }, [currentFloorPlanUuid, currentProjectUuid])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!showPunchForm) load() }, [showPunchForm])

  // ── Image loaded → fit to screen ──────────────────────────────────────────
  function onImageLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.target
    setImgNaturalSize({ w, h })
    setImgLoaded(true)
    fitImage(w, h)
  }

  function fitImage(w, h) {
    const container = containerRef.current
    if (!container) return
    const cw = container.offsetWidth
    const ch = container.offsetHeight
    const s  = Math.min((cw - 40) / w, (ch - 40) / h, 1)
    const nx = Math.round((cw - w * s) / 2)
    const ny = Math.round((ch - h * s) / 2)
    setScale(s)
    setOffset({ x: nx, y: ny })
    scaleRef.current  = s
    offsetRef.current = { x: nx, y: ny }
  }

  function fitToScreen() {
    if (imgNaturalSize.w) fitImage(imgNaturalSize.w, imgNaturalSize.h)
  }

  // ── Delete Floor Plan ──────────────────────────────────────────────────────
  async function handleDeleteFloorPlan() {
    if (!floorPlan) return
    const count = punchItems.length
    const confirmed = window.confirm(
      `Delete key plan "${floorPlan.name}"?\n\nThis will permanently delete this key plan and all ${count} observation pin(s) on it.`
    )
    if (!confirmed) return

    await deleteFloorPlan(floorPlan.uuid)
    const remaining = allFloorPlans.filter(f => f.uuid !== floorPlan.uuid)
    if (remaining.length > 0) {
      navigateToFloorPlan(currentProjectUuid, remaining[0].uuid, floorPlan.phaseUuid || currentPhaseUuid)
    } else {
      const reportUuid = floorPlan?.phaseUuid || currentPhaseUuid || (phases.length > 0 ? phases[0].uuid : null)
      navigateToProject(currentProjectUuid, reportUuid)
    }
  }

  // ── Canvas Pointer Event Handlers ──────────────────────────────────────────
  function clientXY(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }

  function onCanvasPointerDown(e) {
    // If interacting with a pin or any UI button/control, DO NOT drag canvas or drop pin!
    if (
      activePinDrag.current ||
      (e.target && e.target.closest && (
        e.target.closest('[data-pin]') ||
        e.target.closest('button') ||
        e.target.closest('[data-no-canvas-click]')
      ))
    ) {
      isCanvasDragging.current = false
      dragStartClient.current  = null
      return
    }

    setShowFpMenu(false)

    // Two-finger pinch
    if (e.touches && e.touches.length === 2) {
      const [t1, t2] = e.touches
      pinchStartDist.current  = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      pinchStartScale.current = scaleRef.current
      isCanvasDragging.current = false
      return
    }

    hasCanvasMoved.current = false
    const { x, y } = clientXY(e)
    dragStartClient.current  = { x, y }
    dragStartOffset.current  = { ...offsetRef.current }
    isCanvasDragging.current = true
  }

  function onCanvasPointerMove(e) {
    // Pin dragging in progress -> canvas must stay completely still
    if (activePinDrag.current) {
      isCanvasDragging.current = false
      return
    }

    if (e.touches && e.touches.length === 2 && pinchStartDist.current) {
      const [t1, t2] = e.touches
      const d     = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const ratio = d / pinchStartDist.current
      const s     = Math.min(Math.max(pinchStartScale.current * ratio, 0.1), 8)
      setScale(s)
      scaleRef.current = s
      return
    }

    if (!isCanvasDragging.current || !dragStartClient.current) return
    const { x, y } = clientXY(e)
    const dx = x - dragStartClient.current.x
    const dy = y - dragStartClient.current.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasCanvasMoved.current = true
    const newOffset = {
      x: dragStartOffset.current.x + dx,
      y: dragStartOffset.current.y + dy,
    }
    setOffset(newOffset)
    offsetRef.current = newOffset
  }

  async function onCanvasPointerUp(e) {
    if (activePinDrag.current) {
      isCanvasDragging.current = false
      return
    }

    const wasDragging = isCanvasDragging.current
    isCanvasDragging.current = false
    if (pinchStartDist.current) { pinchStartDist.current = null; return }
    if (!wasDragging) return
    if (hasCanvasMoved.current) return

    // It's a clean tap on canvas -> drop new pin
    if (!floorPlan?.imageData || !imgLoaded) return
    if (
      e.target && e.target.closest && (
        e.target.closest('[data-pin]') ||
        e.target.closest('button') ||
        e.target.closest('[data-no-canvas-click]')
      )
    ) {
      return
    }

    const rect   = containerRef.current.getBoundingClientRect()
    const cx     = e.changedTouches ? e.changedTouches[0].clientX : e.clientX
    const cy     = e.changedTouches ? e.changedTouches[0].clientY : e.clientY
    const worldX = (cx - rect.left - offsetRef.current.x) / scaleRef.current
    const worldY = (cy - rect.top  - offsetRef.current.y) / scaleRef.current

    if (worldX < 0 || worldY < 0 || worldX > imgNaturalSize.w || worldY > imgNaturalSize.h) return

    // If in "add extra pin instance" mode for an existing observation
    if (pendingPinInstanceObs) {
      const targetObsUuid = pendingPinInstanceObs.obsUuid
      const obsItem = await getPunchItem(targetObsUuid)
      if (obsItem) {
        const extraPins = Array.isArray(obsItem.extraPins) ? [...obsItem.extraPins] : []
        extraPins.push({
          id: uuidv4(),
          pinX: worldX,
          pinY: worldY,
          floorPlanUuid: currentFloorPlanUuid,
        })
        const updatedObs = { ...obsItem, extraPins }
        await savePunchItem(updatedObs)
        // Immediately update state so the new pin is rendered, remaining in placement mode to place more instances!
        setPunchItems(prev => prev.map(p => (p.uuid === updatedObs.uuid ? updatedObs : p)))
        return
      } else {
        clearPendingPinInstanceObs()
      }
    }

    dropPin(worldX, worldY)
  }

  function onWheel(e) {
    e.preventDefault()
    const rect   = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const s = Math.min(Math.max(scaleRef.current * factor, 0.1), 8)
    const newOffset = {
      x: mouseX - (mouseX - offsetRef.current.x) * (s / scaleRef.current),
      y: mouseY - (mouseY - offsetRef.current.y) * (s / scaleRef.current),
    }
    setScale(s)
    setOffset(newOffset)
    scaleRef.current  = s
    offsetRef.current = newOffset
  }

  // ── Pin Drag-and-Drop & Context Menu Handlers ─────────────────────────────
  function handlePinPointerDown(e, pinObj) {
    if (e.button === 2) return // Right click handled by onContextMenu
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()

    isCanvasDragging.current = false
    dragStartClient.current  = null
    setShowFpMenu(false)

    // Long-press detection for Phone & iPad (500ms)
    longPressTriggered.current = false
    touchStartPos.current = { x: e.clientX, y: e.clientY }
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      activePinDrag.current = null
      setDraggingPinId(null)
      try {
        if (e.target?.releasePointerCapture) {
          e.target.releasePointerCapture(e.pointerId)
        }
      } catch (_) {}
      openPinContextMenu(e, pinObj)
    }, 500)

    try {
      e.target.setPointerCapture(e.pointerId)
    } catch (_) {}

    activePinDrag.current = {
      uuid:        pinObj.item.uuid,
      dragKey:     pinObj.key,
      isExtra:     pinObj.isExtra,
      extraPinId:  pinObj.extraPinId,
      startX:      e.clientX,
      startY:      e.clientY,
      initialPinX: pinObj.pinX,
      initialPinY: pinObj.pinY,
      lastPinX:    pinObj.pinX,
      lastPinY:    pinObj.pinY,
      hasMoved:    false,
    }
    setDraggingPinId(pinObj.key)
  }

  function handlePinPointerMove(e, pinObj) {
    if (!activePinDrag.current || activePinDrag.current.dragKey !== pinObj.key) return
    e.stopPropagation()
    isCanvasDragging.current = false

    const dx = e.clientX - activePinDrag.current.startX
    const dy = e.clientY - activePinDrag.current.startY

    // If moved > 6px, cancel long-press so drag is active
    if (Math.hypot(dx, dy) > 6) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      activePinDrag.current.hasMoved = true
    }

    if (longPressTriggered.current) return
    if (!activePinDrag.current.hasMoved) return

    // Convert screen displacement to natural image world coordinates
    const deltaWorldX = dx / scaleRef.current
    const deltaWorldY = dy / scaleRef.current

    const newX = Math.max(0, Math.min(imgNaturalSize.w, activePinDrag.current.initialPinX + deltaWorldX))
    const newY = Math.max(0, Math.min(imgNaturalSize.h, activePinDrag.current.initialPinY + deltaWorldY))

    activePinDrag.current.lastPinX = newX
    activePinDrag.current.lastPinY = newY

    // Live update visual position
    setPunchItems(prev => prev.map(p => {
      if (p.uuid !== pinObj.item.uuid) return p
      if (!pinObj.isExtra) {
        return { ...p, pinX: newX, pinY: newY }
      } else {
        const extraPins = (p.extraPins || []).map(ep =>
          ep.id === pinObj.extraPinId ? { ...ep, pinX: newX, pinY: newY } : ep
        )
        return { ...p, extraPins }
      }
    }))
  }

  async function handlePinPointerUp(e, pinObj) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }

    if (longPressTriggered.current) {
      longPressTriggered.current = false
      activePinDrag.current = null
      setDraggingPinId(null)
      return
    }

    if (!activePinDrag.current || activePinDrag.current.dragKey !== pinObj.key) return
    e.stopPropagation()
    isCanvasDragging.current = false

    try {
      e.target.releasePointerCapture(e.pointerId)
    } catch (_) {}

    const { hasMoved, lastPinX, lastPinY } = activePinDrag.current
    activePinDrag.current = null
    setDraggingPinId(null)

    if (hasMoved) {
      // Repositioned -> Save to database
      const currentItem = await getPunchItem(pinObj.item.uuid)
      if (currentItem) {
        if (!pinObj.isExtra) {
          await savePunchItem({ ...currentItem, pinX: lastPinX, pinY: lastPinY })
        } else {
          const extraPins = (currentItem.extraPins || []).map(ep =>
            ep.id === pinObj.extraPinId ? { ...ep, pinX: lastPinX, pinY: lastPinY } : ep
          )
          await savePunchItem({ ...currentItem, extraPins })
        }
      }
    } else {
      // Tap without dragging -> Open Punch Item Form
      setCurrentPunchItem(pinObj.item.uuid)
      openPunchForm()
    }
  }

  function openPinContextMenu(e, pinObj) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    const cx = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2)
    const cy = e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2)

    const menuW = 210
    const menuH = 130
    const x = Math.max(12, Math.min(window.innerWidth - menuW - 12, cx - 15))
    const y = Math.max(12, Math.min(window.innerHeight - menuH - 12, cy - 15))

    setPinContextMenu({
      pinObj,
      x,
      y,
    })
  }

  async function handleDeletePinInstance(pinObj) {
    if (!pinObj?.item) return
    const currentItem = await getPunchItem(pinObj.item.uuid)
    if (!currentItem) return

    const totalInstances = 1 + (currentItem.extraPins?.length || 0)
    const num = currentItem.itemNumber ? `#${currentItem.itemNumber}` : ''

    if (totalInstances > 1) {
      const confirmed = window.confirm(
        `Delete this pin instance from the key plan?\n\nObservation ${num} currently has ${totalInstances} pin instances on the drawing.\n\nDeleting this instance will remove it from the drawing, leaving ${totalInstances - 1} remaining pin instance(s).\n\n(Observation notes and photos will remain intact.)`
      )
      if (!confirmed) return

      if (pinObj.isExtra) {
        const remaining = (currentItem.extraPins || []).filter(ep => ep.id !== pinObj.extraPinId)
        await savePunchItem({ ...currentItem, extraPins: remaining })
      } else {
        const extras = currentItem.extraPins || []
        if (extras.length > 0) {
          const [newPrimary, ...remainingExtras] = extras
          await savePunchItem({
            ...currentItem,
            pinX: newPrimary.pinX,
            pinY: newPrimary.pinY,
            floorPlanUuid: newPrimary.floorPlanUuid || currentItem.floorPlanUuid,
            extraPins: remainingExtras
          })
        }
      }
      await load()
    } else {
      // Last instance
      const confirmed = window.confirm(
        `Delete Observation ${num}?\n\n⚠️ Warning: This is the LAST remaining pin instance for Observation ${num}.\n\nDeleting this pin will permanently remove this observation, all notes, and attached photos from the project, and automatically resequence remaining pins.`
      )
      if (!confirmed) return
      await deletePunchItem(currentItem.uuid)
      await load()
    }
  }

  // ── Drop a new pin ─────────────────────────────────────────────────────────
  async function dropPin(x, y) {
    const itemNumber = await getNextItemNumber(currentProjectUuid, floorPlan?.phaseUuid, currentFloorPlanUuid)
    const uuid = uuidv4()
    const newItem = {
      uuid,
      projectUuid:   currentProjectUuid,
      floorPlanUuid: currentFloorPlanUuid,
      phaseUuid:     floorPlan?.phaseUuid || null,
      itemNumber,
      pinX:      x,
      pinY:      y,
      title:      '',
      notes:      '',
      trade:      '',
      priority:   'Medium',
      status:     'Open',
      assignedTo: '',
      dueDate:    '',
    }
    await savePunchItem(newItem)
    // Resequence across drawings in drawing order so all subsequent drawing pins shift continuously
    await resequenceReportPins({
      projectUuid: currentProjectUuid,
      phaseUuid: floorPlan?.phaseUuid,
      floorPlanUuid: currentFloorPlanUuid,
    })
    setCurrentPunchItem(uuid)
    openPunchForm()
    await load()
  }

  async function handleAddObservationFromList() {
    const cx = imgNaturalSize.w > 0 ? Math.round(imgNaturalSize.w / 2) : 100
    const cy = imgNaturalSize.h > 0 ? Math.round(imgNaturalSize.h / 2) : 100
    await dropPin(cx, cy)
  }

  async function handleDeleteItem(item) {
    const num = item.itemNumber ? `#${item.itemNumber}` : 'this observation'
    const totalInstances = 1 + (item.extraPins?.length || 0)
    let confirmed = false
    if (totalInstances > 1) {
      confirmed = window.confirm(
        `Delete observation ${num}?\n\nThis observation currently has ${totalInstances} pin instances across key plans. Deleting this observation will permanently remove all ${totalInstances} pin instances, notes, and attached photos, and automatically resequence remaining pins.`
      )
    } else {
      confirmed = window.confirm(
        `Delete observation ${num}?\n\n⚠️ Warning: This is the LAST remaining pin instance for Observation ${num}.\n\nDeleting it will permanently remove this observation, all notes, and attached photos from the project, and automatically resequence remaining pins.`
      )
    }
    if (!confirmed) return
    await deletePunchItem(item.uuid)
    await load()
  }

  // ── Observation Filter & Sorting Controls ──
  const [obsFilter,     setObsFilter]     = useState('All')
  const [showObsFilter, setShowObsFilter] = useState(false)

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showObsFilter) return
    const handleOutsideClick = (e) => {
      if (!e.target.closest('#obs-filter-container')) {
        setShowObsFilter(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [showObsFilter])

  // Collect distinct trades dynamically from punch items
  const availableTrades = useMemo(() => {
    const set = new Set()
    punchItems.forEach(i => {
      if (i.trade) set.add(i.trade.trim())
    })
    if (set.size === 0) set.add('General')
    return Array.from(set).sort()
  }, [punchItems])

  // Filter groups for dropdown
  const filterGroups = useMemo(() => {
    return [
      {
        title: 'Sequence & Pin #',
        items: [
          { id: 'All',           label: 'All Observations' },
          { id: 'Number (1→9)',  label: 'Pin # (Ascending 1→9)' },
          { id: 'Number (9→1)',  label: 'Pin # (Descending 9→1)' },
        ]
      },
      {
        title: 'Status',
        items: [
          { id: 'Status: Open',     label: 'Status: Open' },
          { id: 'Status: On-Going', label: 'Status: On-Going' },
          { id: 'Status: Closed',   label: 'Status: Closed' },
        ]
      },
      {
        title: 'Priority',
        items: [
          { id: 'Priority: Critical', label: 'Critical Priority' },
          { id: 'Priority: High',     label: 'High Priority' },
          { id: 'Priority: Medium',   label: 'Medium Priority' },
          { id: 'Priority: Low',      label: 'Low Priority' },
        ]
      },
      {
        title: 'Due Date',
        items: [
          { id: 'Due Date (Earliest)', label: 'Due Date (Earliest)' },
          { id: 'Due Date (Latest)',   label: 'Due Date (Latest)' },
          { id: 'Has Due Date',        label: 'With Due Date' },
          { id: 'No Due Date',         label: 'No Due Date' },
        ]
      },
      {
        title: 'Category',
        items: availableTrades.map(t => ({
          id: `Category: ${t}`,
          label: `Category: ${t}`
        }))
      }
    ]
  }, [availableTrades])

  // Filtered & sorted observations list
  const filteredItems = useMemo(() => {
    // Only observations with saved notes (or actively being created in open modal) form pins on key plan
    let list = punchItems.filter(i => (i.notes && i.notes.trim().length > 0) || (showPunchForm && i.uuid === currentPunchItemUuid))

    if (obsFilter === 'All' || obsFilter === 'Number (1→9)') {
      return list.sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
    }
    if (obsFilter === 'Number (9→1)') {
      return list.sort((a, b) => (b.itemNumber || 0) - (a.itemNumber || 0))
    }

    if (obsFilter.startsWith('Status: ')) {
      const s = obsFilter.replace('Status: ', '').trim()
      return list
        .filter(i => normalizeObservationStatus(i.status) === s)
        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
    }

    if (obsFilter.startsWith('Priority: ')) {
      const p = obsFilter.replace('Priority: ', '').trim().toLowerCase()
      return list
        .filter(i => (i.priority || '').toLowerCase() === p)
        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
    }

    if (obsFilter.startsWith('Category: ') || obsFilter.startsWith('Trade: ')) {
      const t = obsFilter.replace(/^(Category|Trade):\s*/, '').trim().toLowerCase()
      return list
        .filter(i => (i.trade || 'General').toLowerCase() === t)
        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
    }

    if (obsFilter === 'Due Date (Earliest)') {
      return list
        .filter(i => !!i.dueDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    }
    if (obsFilter === 'Due Date (Latest)') {
      return list
        .filter(i => !!i.dueDate)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    }
    if (obsFilter === 'Has Due Date') {
      return list
        .filter(i => !!i.dueDate)
        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
    }
    if (obsFilter === 'No Due Date') {
      return list
        .filter(i => !i.dueDate)
        .sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
    }

    return list.sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0))
  }, [punchItems, obsFilter])

  // All pin instances (primary pin + any extra pin instances) on this floor plan drawing
  const allPinsToRender = useMemo(() => {
    if (!imgLoaded) return []
    const list = []
    filteredItems.forEach(item => {
      // Primary pin
      const showPrimary = (item.floorPlanUuid === currentFloorPlanUuid || (!item.floorPlanUuid && item.pinX != null)) && item.pinX != null && item.pinY != null
      if (showPrimary) {
        list.push({
          key: `primary-${item.uuid}`,
          item,
          pinX: item.pinX,
          pinY: item.pinY,
          isExtra: false,
          extraPinId: null,
        })
      }
      // Extra pin instances
      if (Array.isArray(item.extraPins)) {
        item.extraPins.forEach((ep, idx) => {
          const showExtra = (ep.floorPlanUuid === currentFloorPlanUuid || (!ep.floorPlanUuid && item.floorPlanUuid === currentFloorPlanUuid)) && ep.pinX != null && ep.pinY != null
          if (showExtra) {
            list.push({
              key: `extra-${item.uuid}-${ep.id || idx}`,
              item,
              pinX: ep.pinX,
              pinY: ep.pinY,
              isExtra: true,
              extraPinId: ep.id,
            })
          }
        })
      }
    })
    return list
  }, [imgLoaded, filteredItems, currentFloorPlanUuid])

  const sortedItems = filteredItems

  // Update an observation's status directly from the list
  const handleObservationStatusChange = async (targetItem, nextStatus) => {
    setPunchItems(prev => prev.map(p => (p.uuid === targetItem.uuid ? { ...p, status: nextStatus } : p)))
    await savePunchItem({ ...targetItem, status: nextStatus })
  }

  // ── Drag & Drop Observation Reordering ──
  const [draggedObsUuid, setDraggedObsUuid] = useState(null)
  const [dragOverObsUuid, setDragOverObsUuid] = useState(null)
  const dragObsRef = useRef(null)

  const reorderObservations = async (sourceUuid, targetUuid) => {
    if (!sourceUuid || !targetUuid || sourceUuid === targetUuid) return
    const currentList = [...sortedItems]
    const fromIdx = currentList.findIndex(i => i.uuid === sourceUuid)
    const toIdx = currentList.findIndex(i => i.uuid === targetUuid)

    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const [movedItem] = currentList.splice(fromIdx, 1)
      currentList.splice(toIdx, 0, movedItem)

      const minSeq = Math.min(...sortedItems.map(i => i.itemNumber || 1))

      for (let i = 0; i < currentList.length; i++) {
        const item = currentList[i]
        const newNumber = minSeq + i
        if (item.itemNumber !== newNumber) {
          await db.punchItems.where('uuid').equals(item.uuid).modify({
            itemNumber: newNumber,
            updatedAt: Date.now()
          })
        }
      }

      await resequenceReportPins({
        projectUuid: currentProjectUuid,
        phaseUuid: floorPlan?.phaseUuid,
        floorPlanUuid: currentFloorPlanUuid,
      })
      await load()
    }
  }

  const handleMoveObservation = async (itemUuid, direction) => {
    const currentList = [...sortedItems]
    const idx = currentList.findIndex(i => i.uuid === itemUuid)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= currentList.length) return

    const [moved] = currentList.splice(idx, 1)
    currentList.splice(targetIdx, 0, moved)

    const minSeq = Math.min(...sortedItems.map(i => i.itemNumber || 1))

    for (let i = 0; i < currentList.length; i++) {
      const item = currentList[i]
      const newNumber = minSeq + i
      if (item.itemNumber !== newNumber) {
        await db.punchItems.where('uuid').equals(item.uuid).modify({
          itemNumber: newNumber,
          updatedAt: Date.now()
        })
      }
    }

    await resequenceReportPins({
      projectUuid: currentProjectUuid,
      phaseUuid: floorPlan?.phaseUuid,
      floorPlanUuid: currentFloorPlanUuid,
    })
    await load()
  }

  // Desktop Mouse Drag
  const handleObsDragStart = (e, itemUuid) => {
    e.dataTransfer.setData('text/plain', itemUuid)
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
    await reorderObservations(sourceUuid, targetUuid)
  }

  const handleObsDragEnd = () => {
    setDraggedObsUuid(null)
    setDragOverObsUuid(null)
  }

  // Pointer & Touch Events (Finger & Mouse Grip)
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
      await reorderObservations(uuid, targetUuid)
    }
  }

  // Touch Events (mobile/finger fallback)
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
      await reorderObservations(uuid, targetUuid)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-gray-900">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const currentPhase = phases.find(p => p.uuid === floorPlan?.phaseUuid) || (phases.length > 0 ? phases[0] : null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111827' }}>

      {/* ── Header ── */}
      <header className="sitepunch-header text-white flex-shrink-0 shadow-lg z-30" style={{
        paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
        paddingBottom: '10px',
        paddingLeft: 'calc(14px + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(14px + env(safe-area-inset-right, 0px))',
      }}>
        <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
          <button
            onClick={() => {
              const reportUuid = floorPlan?.phaseUuid || currentPhaseUuid || (phases.length > 0 ? phases[0].uuid : null)
              navigateToProject(currentProjectUuid, reportUuid)
            }}
            className="liquid-glass-btn p-2 rounded-xl text-white flex items-center justify-center cursor-pointer transition-all"
          title="Back to site visit"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Floor plan switcher dropdown */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <button
            onClick={() => setShowFpMenu(m => !m)}
            className="liquid-pill px-3 py-1.5 rounded-xl text-white flex items-center gap-2 cursor-pointer w-full text-left"
            style={{ background: 'rgba(255, 255, 255, 0.22)' }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="truncate">{floorPlan?.name || 'Key Plan'}</span>
                <ChevronDown size={14} className="flex-shrink-0 opacity-80" />
              </div>
            </div>
          </button>

          {showFpMenu && (() => {
            const currentPhase = phases.find(p => p.uuid === floorPlan?.phaseUuid) || (phases.length > 0 ? phases[0] : null)
            const currentPhaseFps = allFloorPlans.filter(f => {
              if (currentPhase) {
                return f.phaseUuid === currentPhase.uuid || (!f.phaseUuid && currentPhase.uuid === phases[0]?.uuid)
              }
              return true
            })

            return (
              <>
                {/* Click-outside backdrop to dismiss dropdown */}
                <div
                  className="fixed inset-0 z-50 cursor-default"
                  onClick={() => setShowFpMenu(false)}
                />

                <div
                  className="bg-white rounded-2xl p-2 shadow-2xl z-60 border border-gray-200 animate-fade-in"
                  style={{
                    position: 'absolute', left: 0, top: '115%',
                    minWidth: 260, maxWidth: 340,
                    background: '#ffffff',
                    boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.4), 0 10px 15px -5px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  <div style={{ padding: '6px 10px 8px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Switch Key Plan
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }} className="space-y-1">
                    {currentPhaseFps.map(f => (
                      <button
                        key={f.uuid}
                        onClick={() => {
                          navigateToFloorPlan(currentProjectUuid, f.uuid, f.phaseUuid || currentPhaseUuid)
                          setShowFpMenu(false)
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200"
                        style={{
                          background: f.uuid === currentFloorPlanUuid ? 'var(--brand-50, #eff6ff)' : 'transparent',
                          color:      f.uuid === currentFloorPlanUuid ? 'var(--brand-color, #1d4ed8)' : '#0f172a',
                          fontWeight: f.uuid === currentFloorPlanUuid ? 700 : 600,
                        }}
                      >
                        <span className="truncate">{f.name}</span>
                        {f.uuid === currentFloorPlanUuid && <Check size={14} className="text-brand-600 flex-shrink-0 ml-2" />}
                      </button>
                    ))}
                    {currentPhaseFps.length === 0 && (
                      <div style={{ padding: '12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                        No other key plans in this site visit
                      </div>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </div>

        {/* ── Single button to swap between Drawing and List view ── */}
        <button
          type="button"
          onClick={() => setViewMode(m => m === 'drawing' ? 'list' : 'drawing')}
          className="liquid-glass-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all text-white flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          title={viewMode === 'drawing' ? 'Switch to List View' : 'Switch to Key Plan View'}
        >
          {viewMode === 'drawing' ? (
            <>
              <ListOrdered size={14} />
              <span>List ({punchItems.length})</span>
            </>
          ) : (
            <>
              <Layers size={14} />
              <span>Key Plan</span>
            </>
          )}
        </button>

        {/* Export Key Plan Report Button */}
        <button
          onClick={openPDFPreview}
          className="liquid-glass-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all text-white flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          title="Export report for this key plan"
        >
          <FileText size={14} />
          <span className="hidden sm:inline">Export</span>
        </button>
        </div>
      </header>

      {/* ── Breadcrumb Navigation Path ── */}
      <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/80 flex-shrink-0 z-20">
        <div className="max-w-4xl mx-auto w-full">
          <Breadcrumbs
            dark
            items={[
              { label: 'Dashboard', icon: <Home size={13} />, onClick: navigateToDashboard },
              { label: 'Projects', onClick: navigateToProjects },
              {
                label: project?.name || 'Project',
                onClick: () => navigateToProject(currentProjectUuid, null)
              },
              {
                label: currentPhase?.name || 'Site Visit',
                onClick: () => navigateToProject(currentProjectUuid, currentPhase?.uuid || floorPlan?.phaseUuid)
              },
              {
                label: floorPlan?.name || 'Key Plan',
                active: true
              }
            ]}
          />
        </div>
      </div>

      {/* ── Main View: Interactive Drawing Canvas OR Structured Observations List ── */}
      {viewMode === 'drawing' ? (
        <div
          ref={containerRef}
          onMouseDown={onCanvasPointerDown}
          onMouseMove={onCanvasPointerMove}
          onMouseUp={onCanvasPointerUp}
          onTouchStart={onCanvasPointerDown}
          onTouchMove={onCanvasPointerMove}
          onTouchEnd={onCanvasPointerUp}
          onWheel={onWheel}
          style={{
            flex: 1, position: 'relative', overflow: 'hidden',
            background: '#1f2937',
            cursor: 'crosshair',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {floorPlan?.imageData ? (
            <>
              {/* ── Floor plan image ── */}
              <img
                src={floorPlan.imageData}
                alt={floorPlan.name}
                onLoad={onImageLoad}
                draggable={false}
                style={{
                  position:        'absolute',
                  top:             0,
                  left:            0,
                  transformOrigin: '0 0',
                  transform:       `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  display:         'block',
                  maxWidth:        'none',
                  pointerEvents:   'none',
                }}
              />

              {/* ── Draggable Pins ── */}
              {imgLoaded && allPinsToRender.map(pinObj => {
                const { item, pinX, pinY, key, isExtra } = pinObj
                const sx = offset.x + pinX * scale
                const sy = offset.y + pinY * scale
                const isDragging = draggingPinId === key
                const photoData = showPhotoPreviews ? pinPhotos[item.uuid] : null

                if (photoData) {
                  // Pin with Image Preview Bubble
                  return (
                    <button
                      key={key}
                      data-pin="true"
                      onPointerDown={(e) => handlePinPointerDown(e, pinObj)}
                      onPointerMove={(e) => handlePinPointerMove(e, pinObj)}
                      onPointerUp={(e) => handlePinPointerUp(e, pinObj)}
                      onPointerCancel={() => {
                        if (longPressTimer.current) {
                          clearTimeout(longPressTimer.current)
                          longPressTimer.current = null
                        }
                        activePinDrag.current = null
                        setDraggingPinId(null)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openPinContextMenu(e, pinObj)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      style={{
                        position:        'absolute',
                        left:            sx,
                        top:             sy,
                        transform:       `translate(-50%, -100%) ${isDragging ? 'scale(1.15)' : 'scale(1)'}`,
                        transformOrigin: 'bottom center',
                        background:      'none',
                        border:          'none',
                        padding:         0,
                        cursor:          isDragging ? 'grabbing' : 'grab',
                        zIndex:          isDragging ? 50 : 15,
                        touchAction:     'none',
                        transition:      isDragging ? 'none' : 'transform 0.15s ease',
                        outline:         'none',
                      }}
                      title={`Pin #${item.itemNumber}${isExtra ? ' (Instance)' : ''} (Tap to edit, Right-click or long-press for options)`}
                    >
                      <div style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        filter: isDragging ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.65))' : 'drop-shadow(0 3px 8px rgba(0,0,0,0.45))',
                      }}>
                        {/* Photo Thumbnail Container */}
                        <div style={{
                          width: 50,
                          height: 50,
                          borderRadius: 10,
                          border: isDragging ? '3px solid #3b82f6' : `2.5px solid ${pinColor || '#a40e26'}`,
                          background: '#1e293b',
                          overflow: 'hidden',
                          position: 'relative',
                        }}>
                          <img
                            src={photoData}
                            alt={`Pin #${item.itemNumber}`}
                            draggable={false}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                              pointerEvents: 'none',
                            }}
                          />
                          {/* Pin Number Badge */}
                          <div style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            background: pinColor || '#a40e26',
                            color: 'white',
                            fontWeight: 800,
                            fontSize: item.itemNumber > 99 ? 8 : 10,
                            padding: '1px 5px',
                            borderRadius: 6,
                            lineHeight: 1.2,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                          }}>
                            #{item.itemNumber}
                          </div>
                        </div>

                        {/* Downward Pointer Triangle pointing to exact (x, y) */}
                        <div style={{
                          width: 0,
                          height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: isDragging ? '7px solid #3b82f6' : `7px solid ${pinColor || '#a40e26'}`,
                          marginTop: -1,
                        }} />
                      </div>
                    </button>
                  )
                }

                // Standard Numbered Circle Pin
                return (
                  <button
                    key={key}
                    data-pin="true"
                    onPointerDown={(e) => handlePinPointerDown(e, pinObj)}
                    onPointerMove={(e) => handlePinPointerMove(e, pinObj)}
                    onPointerUp={(e) => handlePinPointerUp(e, pinObj)}
                    onPointerCancel={() => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current)
                        longPressTimer.current = null
                      }
                      activePinDrag.current = null
                      setDraggingPinId(null)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openPinContextMenu(e, pinObj)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    style={{
                      position:     'absolute',
                      left:         sx,
                      top:          sy,
                      transform:    `translate(-50%, -50%) ${isDragging ? 'scale(1.35)' : 'scale(1)'}`,
                      width:        PIN_SIZE,
                      height:       PIN_SIZE,
                      borderRadius: '50%',
                      background:   pinColor || '#a40e26',
                      border:       isDragging ? '3px solid #3b82f6' : '2.5px solid white',
                      display:      'flex',
                      alignItems:   'center',
                      justifyContent: 'center',
                      fontSize:     item.itemNumber > 99 ? 8 : item.itemNumber > 9 ? 10 : 12,
                      fontWeight:   700,
                      color:        'white',
                      boxShadow:    isDragging ? '0 12px 28px rgba(0,0,0,0.65)' : '0 2px 8px rgba(0,0,0,0.5)',
                      cursor:       isDragging ? 'grabbing' : 'grab',
                      zIndex:       isDragging ? 50 : 10,
                      padding:      0,
                      lineHeight:   1,
                      touchAction:  'none',
                      transition:   isDragging ? 'none' : 'transform 0.15s ease',
                    }}
                    title={`Pin #${item.itemNumber}${isExtra ? ' (Instance)' : ''} (Tap to edit, Right-click or long-press for options)`}
                  >
                    {item.itemNumber}
                  </button>
                )
              })}
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: 12 }}>
              <FileImage size={48} className="text-gray-500" />
              <p style={{ fontSize: 14 }}>No key plan image loaded</p>
              <button
                onClick={() => setShowAddFpModal(true)}
                className="sitepunch-btn-primary"
                style={{
                  background: 'var(--brand-button, #1d4ed8)', color: 'white', padding: '8px 16px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}
              >
                Upload Key Plan
              </button>
            </div>
          )}

          {/* Floating Instruction Banner for Adding Pin Instance */}
          {pendingPinInstanceObs && (() => {
            const currentObs = punchItems.find(p => p.uuid === pendingPinInstanceObs.obsUuid)
            const count = currentObs ? 1 + (currentObs.extraPins?.length || 0) : 1
            return (
              <div
                data-no-canvas-click="true"
                className="absolute top-4 left-1/2 -translate-x-1/2 z-40 text-white px-3.5 py-2 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-2.5 sm:gap-3 animate-fade-in max-w-[94vw]"
                style={{ background: 'var(--brand-header, #1e40af)' }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0 shadow-sm"
                  style={{ background: pinColor || '#a40e26', border: '1.5px solid white' }}
                >
                  #{pendingPinInstanceObs.itemNumber}
                </div>
                <span className="text-xs font-bold leading-tight truncate sm:whitespace-nowrap min-w-0">
                  Tap anywhere to place duplicate
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold bg-white/20 px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap">
                  {count} on plan
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearPendingPinInstanceObs()
                  }}
                  className="px-3 py-1.5 bg-white/25 hover:bg-white/35 active:scale-95 rounded-xl text-xs font-bold cursor-pointer text-white flex items-center gap-1 shadow-xs transition-all flex-shrink-0"
                  title="Done placing pin instances (or press Escape)"
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Done</span>
                </button>
              </div>
            )
          })()}

          {/* ── Zoom controls ── */}
          <div
            data-no-canvas-click="true"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
              right: 'calc(1rem + env(safe-area-inset-right, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              zIndex: 20
            }}
          >
            <ZoomBtn label="+" title="Zoom in"    onClick={() => { const s = Math.min(scaleRef.current * 1.3, 8); setScale(s); scaleRef.current = s }} />
            <ZoomBtn label="−" title="Zoom out"   onClick={() => { const s = Math.max(scaleRef.current / 1.3, 0.1); setScale(s); scaleRef.current = s }} />
            <ZoomBtn label="⤢" title="Fit to screen" onClick={fitToScreen} style={{ fontSize: 14 }} />
          </div>

          {/* ── Pin count & Photo Preview toggle button (replaces drag badge) ── */}
          <div
            data-no-canvas-click="true"
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
              left: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              zIndex: 20,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999 }}>
              {allPinsToRender.length} pin{allPinsToRender.length !== 1 ? 's' : ''}
            </div>
            <button
              type="button"
              data-no-canvas-click="true"
              onClick={(e) => {
                e.stopPropagation()
                togglePhotoPreviews()
              }}
              className="transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md"
              style={{
                background: showPhotoPreviews ? 'var(--brand-header, #1e40af)' : 'rgba(0,0,0,0.65)',
                color: 'white',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 999,
                border: showPhotoPreviews ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
              title={showPhotoPreviews ? 'Pin Photo Previews: ON (Click to hide photos on pins)' : 'Pin Photo Previews: OFF (Click to show photos on pins)'}
            >
              <Camera size={13} className={showPhotoPreviews ? 'text-white' : 'text-gray-300'} />
              <span>{showPhotoPreviews ? 'Photos: ON' : 'Photos: OFF'}</span>
            </button>
          </div>

          {/* ── Scale indicator ── */}
          <div style={{
            position: 'absolute',
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
            left: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 999,
            zIndex: 10
          }}>
            {Math.round(scale * 100)}%
          </div>
        </div>
      ) : (
        /* ── Punch items structured list view for this drawing ── */
        <div className="flex-1 bg-gray-50 overflow-y-auto flex flex-col">
          {/* Subheader bar with stats, Add Observation, and Filter */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-xs">
            <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3">
              <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 truncate">
                <span className="truncate">{floorPlan?.name || 'Key Plan'} Observations</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-bold text-white shadow-xs flex-shrink-0"
                  style={{ background: pinColor || '#a40e26' }}
                >
                  {filteredItems.length} {filteredItems.length === 1 ? 'Item' : 'Items'}
                </span>
                {obsFilter !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setObsFilter('All')}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-full transition-colors cursor-pointer flex-shrink-0"
                    title="Reset to all observations"
                  >
                    Clear Filter
                  </button>
                )}
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleAddObservationFromList}
                className="flex items-center gap-1.5 text-xs font-bold text-white px-3.5 py-2 rounded-lg shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                style={{ background: 'var(--brand-button, #1d4ed8)' }}
                title="Add observation to this key plan"
              >
                <Plus size={14} />
                <span>Add Observation</span>
              </button>

              {/* Filter Dropdown Button */}
              <div className="relative flex-shrink-0" id="obs-filter-container">
                <button
                  type="button"
                  onClick={() => setShowObsFilter(f => !f)}
                  className={`liquid-pill px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer border ${
                    obsFilter !== 'All'
                      ? 'bg-blue-50/70 border-brand-300 text-brand-700 font-bold'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Filter and sort observations"
                >
                  <Filter size={14} className={obsFilter !== 'All' ? 'text-brand-600' : 'text-gray-500'} />
                  <span>{obsFilter === 'All' ? 'Filter' : obsFilter}</span>
                  <ChevronDown size={12} className={obsFilter !== 'All' ? 'text-brand-600' : 'text-gray-400'} />
                </button>

                {showObsFilter && (
                  <div
                    className="liquid-glass-surface rounded-2xl p-1.5 shadow-2xl z-30 max-h-[380px] overflow-y-auto"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '120%',
                      zIndex: 60,
                      minWidth: 210,
                    }}
                  >
                    {filterGroups.map((grp, gIdx) => (
                      <div key={grp.title} className={gIdx > 0 ? 'mt-1 pt-1 border-t border-gray-100' : ''}>
                        <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {grp.title}
                        </div>
                        {grp.items.map(opt => {
                          const isSelected = obsFilter === opt.id
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setObsFilter(opt.id)
                                setShowObsFilter(false)
                              }}
                              className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between cursor-pointer transition-colors hover:bg-gray-50"
                              style={{
                                background: isSelected ? 'var(--brand-50, #eff6ff)' : undefined,
                                color: isSelected ? 'var(--brand-color, #1d4ed8)' : '#374151',
                                fontWeight: isSelected ? 700 : 500,
                              }}
                            >
                              <span className="truncate">{opt.label}</span>
                              {isSelected && <Check size={14} className="text-brand-600 ml-2 flex-shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>

          {/* Observation Items List */}
          <div className="flex-1 p-4 max-w-4xl w-full mx-auto space-y-2.5">
            {punchItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-200 p-8 shadow-xs">
                <AlertCircle size={44} className="text-gray-300 mb-3" />
                <h3 className="text-base font-bold text-gray-800">No Observations Recorded</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  There are no punch list items on "{floorPlan?.name || 'this key plan'}". Tap below to add one or switch to Key Plan view.
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={handleAddObservationFromList}
                    className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg shadow-sm hover:opacity-95 transition-all cursor-pointer"
                    style={{ background: 'var(--brand-button, #1d4ed8)' }}
                  >
                    <Plus size={14} /> Add First Observation
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('drawing')}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-all cursor-pointer"
                  >
                    <Layers size={14} /> Switch to Key Plan View
                  </button>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-200 p-8 shadow-xs">
                <AlertCircle size={44} className="text-gray-300 mb-3" />
                <h3 className="text-base font-bold text-gray-800">No Observations Match Filter</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  No observations on "{floorPlan?.name || 'this key plan'}" match the filter "{obsFilter}".
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setObsFilter('All')}
                    className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg shadow-sm hover:opacity-95 transition-all cursor-pointer"
                    style={{ background: 'var(--brand-button, #1d4ed8)' }}
                  >
                    Clear Filter
                  </button>
                </div>
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const photo = pinPhotos[item.uuid]
                return (
                  <div
                    key={item.uuid}
                    data-item-uuid={item.uuid}
                    draggable={obsFilter === 'All'}
                    onDragStart={(e) => handleObsDragStart(e, item.uuid)}
                    onDragOver={(e) => handleObsDragOver(e, item.uuid)}
                    onDrop={(e) => handleObsDrop(e, item.uuid)}
                    onDragEnd={handleObsDragEnd}
                    onClick={() => {
                      setCurrentPunchItem(item.uuid)
                      openPunchForm()
                    }}
                    className={`liquid-glass-card rounded-2xl p-3.5 flex flex-col gap-2 cursor-pointer group transition-all select-none border border-l-4 ${
                      draggedObsUuid === item.uuid
                        ? 'opacity-40 border-dashed border-brand-400 scale-[0.98]'
                        : dragOverObsUuid === item.uuid
                          ? 'ring-2 ring-brand-400 scale-[1.01]'
                          : 'active:scale-[0.99] hover:shadow-md'
                    }`}
                    style={{
                      borderLeftColor: pinColor || 'var(--punch-pin-color, #a40e26)',
                      borderColor: `rgba(${pinR}, ${pinG}, ${pinB}, 0.35)`,
                      background: `linear-gradient(135deg, rgba(${pinR}, ${pinG}, ${pinB}, 0.05) 0%, #ffffff 50%, rgba(${pinR}, ${pinG}, ${pinB}, 0.09) 100%)`,
                      boxShadow: `0 4px 18px -2px rgba(${pinR}, ${pinG}, ${pinB}, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)`,
                    }}
                  >
                    {/* Top Section: Grip, Pin #, Title & Core Details, Photo, Desktop Actions */}
                    <div className="flex items-center gap-2.5 sm:gap-3.5 w-full">
                      {/* Drag Grip Handle for Mouse and Touch / Finger */}
                      <div
                        className={`flex items-center justify-center p-1 sm:p-1.5 -ml-1 text-gray-400 transition-colors ${
                          obsFilter === 'All'
                            ? 'hover:text-brand-600 active:text-brand-700 cursor-grab active:cursor-grabbing hover:bg-white/60'
                            : 'cursor-not-allowed opacity-40'
                        } flex-shrink-0 touch-none rounded-lg`}
                        title={obsFilter === 'All' ? 'Drag with mouse or finger to reorder sequence' : 'Clear filter to reorder sequence'}
                        style={{ touchAction: 'none' }}
                        onPointerDown={(e) => obsFilter === 'All' && handleObsGripPointerDown(e, item.uuid, idx)}
                        onPointerMove={obsFilter === 'All' ? handleObsGripPointerMove : undefined}
                        onPointerUp={obsFilter === 'All' ? handleObsGripPointerUp : undefined}
                        onTouchStart={(e) => obsFilter === 'All' && handleObsGripTouchStart(e, item.uuid, idx)}
                        onTouchMove={obsFilter === 'All' ? handleObsGripTouchMove : undefined}
                        onTouchEnd={obsFilter === 'All' ? handleObsGripTouchEnd : undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical size={20} className="block pointer-events-none" />
                      </div>

                      {/* Pin Number Badge */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 shadow-sm text-white"
                        style={{ background: pinColor || 'var(--punch-pin-color, #a40e26)' }}
                      >
                        {item.itemNumber}
                      </div>

                      {/* Content (Title, Badges, Trade, Due Date) */}
                      <div className="flex-1 min-w-0">
                        {/* Observation Title - prominent full width row, highly visible on phone views */}
                        <h4
                          className="font-bold text-sm text-gray-900 leading-snug line-clamp-2 sm:line-clamp-1 block"
                          title={item.title || item.notes || `Observation #${item.itemNumber}`}
                        >
                          {truncateObservationTitle(item.title || item.notes || `Observation #${item.itemNumber}`, 80)}
                        </h4>

                        {/* Badges Row: Status dropdown, Priority, Extra Pins */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <ObservationStatusSelect
                            status={item.status}
                            size="xs"
                            onChange={(nextStatus) => handleObservationStatusChange(item, nextStatus)}
                          />
                          {item.priority && (
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${PRIORITY_BADGES[item.priority] || 'bg-gray-100 text-gray-600'}`}>
                              {item.priority}
                            </span>
                          )}
                          {item.extraPins?.length > 0 && (
                            <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {item.extraPins.length + 1} pins
                            </span>
                          )}
                        </div>

                        {/* Secondary Details: Category, Due Date, Assignee */}
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 flex-wrap">
                          <span className="font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1.5 flex-wrap text-[11px]">
                            <span>Category: {item.trade || 'General'}</span>
                            <span className="text-gray-400">•</span>
                            <span className="flex items-center gap-1 text-gray-500">
                              <Calendar size={11} className="text-gray-400" />
                              <span>{item.dueDate ? `Due: ${formatDatePattern(item.dueDate)}` : 'No Due Date'}</span>
                            </span>
                          </span>
                          {item.assignedTo && (
                            <span className="flex items-center gap-1 text-gray-500 font-medium text-[11px]">
                              <User size={11} /> {item.assignedTo}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Photo Thumbnail on right side */}
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-xl overflow-hidden flex-shrink-0 border-2 border-gray-300 shadow-xs flex items-center justify-center self-center">
                        {photo ? (
                          <img src={photo} alt={`Pin #${item.itemNumber}`} className="w-full h-full object-cover pointer-events-none" />
                        ) : (
                          <Camera size={20} className="text-gray-300" />
                        )}
                      </div>

                      {/* Desktop Action Buttons: Move Up / Down, Edit, Delete (hidden on mobile, shown on sm+) */}
                      <div className="hidden sm:flex items-center gap-1 flex-shrink-0 self-center">
                        <div className="flex flex-col mr-1 border-r border-gray-200 pr-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMoveObservation(item.uuid, 'up')
                            }}
                            disabled={idx === 0 || obsFilter !== 'All'}
                            className={`p-1 rounded transition-colors cursor-pointer ${idx > 0 && obsFilter === 'All' ? 'text-gray-500 hover:text-brand-600 hover:bg-white/60' : 'text-gray-200 cursor-not-allowed'}`}
                            title={obsFilter === 'All' ? 'Move observation up (updates sequence)' : 'Clear filter to reorder'}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMoveObservation(item.uuid, 'down')
                            }}
                            disabled={idx === sortedItems.length - 1 || obsFilter !== 'All'}
                            className={`p-1 rounded transition-colors cursor-pointer ${idx < sortedItems.length - 1 && obsFilter === 'All' ? 'text-gray-500 hover:text-brand-600 hover:bg-white/60' : 'text-gray-200 cursor-not-allowed'}`}
                            title={obsFilter === 'All' ? 'Move observation down (updates sequence)' : 'Clear filter to reorder'}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCurrentPunchItem(item.uuid)
                            openPunchForm()
                          }}
                          className="liquid-pill p-1.5 rounded-xl text-gray-500 hover:text-brand-600 flex items-center justify-center cursor-pointer transition-colors"
                          title="Edit observation"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteItem(item)
                          }}
                          className="liquid-pill p-1.5 rounded-xl text-gray-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
                          title="Delete observation (auto-resequences pins)"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Mobile Action Footer Bar: Touch-friendly Up/Down, Edit, Delete (strictly on phones < sm) */}
                    <div className="flex sm:hidden items-center justify-between pt-2 border-t border-gray-150/80 mt-1 pl-10 pr-0.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMoveObservation(item.uuid, 'up')
                          }}
                          disabled={idx === 0 || obsFilter !== 'All'}
                          className={`p-1 px-2 rounded-lg border border-gray-250 bg-white transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold ${idx > 0 && obsFilter === 'All' ? 'text-gray-700 hover:text-brand-600 active:bg-gray-100' : 'text-gray-300 cursor-not-allowed opacity-50'}`}
                          title={obsFilter === 'All' ? 'Move observation up' : 'Clear filter to reorder'}
                        >
                          <ChevronUp size={13} />
                          <span>Up</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMoveObservation(item.uuid, 'down')
                          }}
                          disabled={idx === sortedItems.length - 1 || obsFilter !== 'All'}
                          className={`p-1 px-2 rounded-lg border border-gray-250 bg-white transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold ${idx < sortedItems.length - 1 && obsFilter === 'All' ? 'text-gray-700 hover:text-brand-600 active:bg-gray-100' : 'text-gray-300 cursor-not-allowed opacity-50'}`}
                          title={obsFilter === 'All' ? 'Move observation down' : 'Clear filter to reorder'}
                        >
                          <ChevronDown size={13} />
                          <span>Down</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCurrentPunchItem(item.uuid)
                            openPunchForm()
                          }}
                          className="p-1 px-2.5 rounded-lg border border-gray-250 bg-white text-gray-700 hover:text-brand-700 flex items-center gap-1 text-[11px] font-semibold cursor-pointer active:bg-gray-100 shadow-2xs"
                          title="Edit observation"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteItem(item)
                          }}
                          className="p-1 px-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center gap-1 text-[11px] font-semibold cursor-pointer active:bg-red-100 shadow-2xs"
                          title="Delete observation"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Modal to edit drawing sheet & select image ── */}
      {showRenameModal && floorPlan && (
        <RenameFloorPlanModal
          floorPlan={floorPlan}
          onClose={() => setShowRenameModal(false)}
          onSaved={(newName, newImageData) => {
            setFloorPlan(prev => ({
              ...prev,
              name: newName,
              imageData: newImageData || prev.imageData,
            }))
            load()
          }}
        />
      )}

      {/* ── Pin Context Menu (Right Click on Desktop, Long Press on Phone/iPad) ── */}
      {pinContextMenu && (
        <div
          className="fixed inset-0 z-[100] select-none"
          onClick={() => setPinContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setPinContextMenu(null)
          }}
          onTouchMove={() => setPinContextMenu(null)}
        >
          <div
            className="fixed bg-white rounded-2xl shadow-2xl border border-gray-200 p-1.5 min-w-[210px] animate-fade-in"
            style={{
              left: pinContextMenu.x,
              top: pinContextMenu.y,
              boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.4), 0 10px 15px -5px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: pinColor || '#a40e26' }}
                >
                  #{pinContextMenu.pinObj.item.itemNumber}
                </span>
                <span className="text-xs font-bold text-gray-800 truncate">
                  Pin #{pinContextMenu.pinObj.item.itemNumber}
                </span>
              </div>
              {(pinContextMenu.pinObj.item.extraPins?.length || 0) > 0 ? (
                <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  {(pinContextMenu.pinObj.item.extraPins.length || 0) + 1} pins
                </span>
              ) : (
                <span className="text-[10px] font-medium text-gray-400 flex-shrink-0">
                  Single Pin
                </span>
              )}
            </div>

            <div className="p-1 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  const targetUuid = pinContextMenu.pinObj.item.uuid
                  setPinContextMenu(null)
                  setCurrentPunchItem(targetUuid)
                  openPunchForm()
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer text-left"
              >
                <Edit2 size={15} className="text-brand-600 flex-shrink-0" />
                <span>Edit Observation</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const item = pinContextMenu.pinObj.item
                  setPinContextMenu(null)
                  setPendingPinInstanceObs({
                    obsUuid: item.uuid,
                    itemNumber: item.itemNumber,
                    floorPlanUuid: item.floorPlanUuid || currentFloorPlanUuid,
                  })
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer text-left"
              >
                <Plus size={15} className="text-brand-600 flex-shrink-0" />
                <span>Duplicate Pin</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetPinObj = pinContextMenu.pinObj
                  setPinContextMenu(null)
                  handleDeletePinInstance(targetPinObj)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
              >
                <Trash2 size={15} className="text-red-500 flex-shrink-0" />
                <span>Delete Pin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ZoomBtn({ label, onClick, title }) {
  return (
    <button
      type="button"
      data-no-canvas-click="true"
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      title={title}
      className="liquid-glass-surface flex items-center justify-center rounded-full hover:scale-105 active:scale-95 text-slate-800 transition-transform cursor-pointer"
      style={{
        width: 44, height: 44,
        fontSize: 20, fontWeight: 300,
        flexShrink: 0,
        touchAction: 'none',
      }}
    >
      {label}
    </button>
  )
}
