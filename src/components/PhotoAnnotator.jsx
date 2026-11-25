import React, { useEffect, useRef, useState, useCallback } from 'react'
import { getAnnotatorExportOptions, getStoredPhotoQuality } from '../utils/media'
import {
  X, ArrowRight, Pen, Hand, Crop, MousePointer, Type, Eraser,
  Undo2, Redo2, Trash2, Check,
  ZoomIn, ZoomOut, Maximize2, ChevronDown
} from 'lucide-react'

// Custom icons for Rectangle and Circle shapes
function RectangleIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLineCap="round"
      strokeLineJoin="round"
      className={className}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  )
}

function CircleIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLineCap="round"
      strokeLineJoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

// Construction / Architectural Revision Cloud Icon
function ConstructionCloudIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLineCap="round"
      strokeLineJoin="round"
      className={className}
    >
      <path d="M5.5 7.5 Q8.5 4.5 12 7 Q15.5 4.5 18.5 7.5 Q21.5 10.5 19 13.5 Q21.5 16.5 18.5 18.5 Q15 20.5 12 18 Q9 20.5 5.5 18.5 Q2.5 16.5 5 13.5 Q2.5 10.5 5.5 7.5 Z" />
    </svg>
  )
}

// Architectural Dimension Line Icon
function DimensionLineIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLineCap="round"
      strokeLineJoin="round"
      className={className}
    >
      <line x1="3" y1="5" x2="3" y2="19" />
      <line x1="21" y1="5" x2="21" y2="19" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M7 9 L3 12 L7 15" />
      <path d="M17 9 L21 12 L17 15" />
    </svg>
  )
}

// Straight Line Icon
function StraightLineIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLineCap="round"
      strokeLineJoin="round"
      className={className}
    >
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  )
}

// Exactly 3 primary markup colors
const THREE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6']

// Proportional dash array for dashed lines matching architectural drafting standards
function getDashArray(strokeWidth = 3) {
  const w = Number(strokeWidth) || 3
  return [Math.max(10, Math.round(w * 2.5)), Math.max(6, Math.round(w * 1.6))]
}

const SELECT_TOOLS = [
  { id: 'select', label: 'Select', icon: <MousePointer size={15} /> },
  { id: 'pan',    label: 'Pan',    icon: <Hand size={15} /> },
  { id: 'crop',   label: 'Crop',   icon: <Crop size={15} /> },
]

const SHAPES = [
  { id: 'rectangle', label: 'Rectangle',      icon: <RectangleIcon size={16} /> },
  { id: 'circle',    label: 'Circle',         icon: <CircleIcon size={16} /> },
  { id: 'cloud',     label: 'Cloud',          icon: <ConstructionCloudIcon size={17} /> },
  { id: 'arrow',     label: 'Arrow',          icon: <ArrowRight size={15} /> },
  { id: 'dimension', label: 'Dimension Line', icon: <DimensionLineIcon size={16} /> },
  { id: 'line',      label: 'Line',           icon: <StraightLineIcon size={16} /> },
]

const OTHER_TOOLS = [
  { id: 'pen',  label: 'Pen',  icon: <Pen size={15} /> },
  { id: 'text', label: 'Text', icon: <Type size={15} /> },
]

export default function PhotoAnnotator({ imageDataUrl, photoQuality, saveButtonLabel = 'Save Photo', onSave, onCancel }) {
  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const imageMetaRef = useRef({ naturalWidth: 0, naturalHeight: 0, canvasWidth: 0, canvasHeight: 0 })

  const [activeImageSrc, setActiveImageSrc] = useState(imageDataUrl)
  const [imageHistory,   setImageHistory]   = useState([])

  const [tool,               setTool]               = useState('cloud')
  const [selectedShape,      setSelectedShape]      = useState('cloud')
  const [selectMode,         setSelectMode]         = useState('select')
  const [showShapesMenu,     setShowShapesMenu]     = useState(false)
  const [showSelectMenu,     setShowSelectMenu]     = useState(false)
  const shapesMenuRef = useRef(null)
  const selectMenuRef = useRef(null)

  const [color,       setColor]       = useState('#ef4444')
  const [strokeW,     setStrokeW]     = useState(3)
  const [lineType,    setLineType]    = useState('solid') // 'solid' | 'dash'
  const [canUndo,     setCanUndo]     = useState(false)
  const [canRedo,     setCanRedo]     = useState(false)
  const [selectedObj, setSelectedObj] = useState(null)

  // Line weight pop-up state
  const [showStrokePopup, setShowStrokePopup] = useState(false)
  const strokePopupRef = useRef(null)
  const [popupStyle, setPopupStyle] = useState({
    left: '50%',
    transform: 'translateX(-50%)',
    width: '210px',
    maxWidth: 'calc(100vw - 20px)',
  })

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef = useRef({ x: 0, y: 0 })
  const viewportContainerRef = useRef(null)
  const canvasWrapperRef = useRef(null)
  const panStart = useRef({ x: 0, y: 0 })
  const panStartOffset = useRef({ x: 0, y: 0 })
  const pinchDistRef = useRef(null)
  const pinchStartZoomRef = useRef(1)

  // Crop mode state
  const [isCropping, setIsCropping] = useState(false)
  const [cropRect, setCropRect]     = useState({ x: 20, y: 20, width: 200, height: 200 })
  const cropDragRef = useRef(null)

  // Refs for stable event handlers
  const toolRef      = useRef('cloud')
  const colorRef     = useRef('#ef4444')
  const strokeWRef   = useRef(3)
  const lineTypeRef  = useRef('solid')
  const fabricRef    = useRef(null)
  const FabricLibRef = useRef(null)

  const isDrawing = useRef(false)
  const isPanning = useRef(false)
  const lastPanPt = useRef({ x: 0, y: 0 })
  const startPt   = useRef(null)
  const activeObj = useRef(null)

  const undoStack = useRef([])
  const redoStack = useRef([])

  useEffect(() => { toolRef.current     = tool     }, [tool])
  useEffect(() => { colorRef.current    = color    }, [color])
  useEffect(() => { strokeWRef.current  = strokeW  }, [strokeW])
  useEffect(() => { lineTypeRef.current = lineType }, [lineType])

  useEffect(() => {
    panOffsetRef.current = panOffset
    if (fabricRef.current) {
      fabricRef.current.calcOffset()
    }
  }, [zoomLevel, panOffset])

  // Accessibility & UX: Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (isCropping) {
          setIsCropping(false)
          setSelectMode('select')
          setTool('select')
          toolRef.current = 'select'
          return
        }
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel, isCropping])

  // Keyboard Delete key to remove selected annotation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const fab = fabricRef.current
        const active = fab?.getActiveObject()
        if (active && !active.isEditing) {
          e.preventDefault()
          handleDeleteSelected()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close line weight popup, shapes menu, and select menu on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (strokePopupRef.current && !strokePopupRef.current.contains(e.target)) {
        setShowStrokePopup(false)
      }
      if (shapesMenuRef.current && !shapesMenuRef.current.contains(e.target)) {
        setShowShapesMenu(false)
      }
      if (selectMenuRef.current && !selectMenuRef.current.contains(e.target)) {
        setShowSelectMenu(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [])

  // Calculate & dynamically clamp line weight popup so it never overflows screen on phone view
  useEffect(() => {
    if (!showStrokePopup) return
    const updatePopupPosition = () => {
      if (!strokePopupRef.current) return
      const rect = strokePopupRef.current.getBoundingClientRect()
      const popupWidth = 210
      const margin = 12
      const screenWidth = window.innerWidth

      const triggerCenter = rect.left + rect.width / 2
      let leftInViewport = triggerCenter - popupWidth / 2

      if (leftInViewport < margin) {
        leftInViewport = margin
      } else if (leftInViewport + popupWidth > screenWidth - margin) {
        leftInViewport = Math.max(margin, screenWidth - margin - popupWidth)
      }

      const localLeft = leftInViewport - rect.left

      setPopupStyle({
        left: `${localLeft}px`,
        transform: 'none',
        width: `${Math.min(popupWidth, screenWidth - margin * 2)}px`,
        maxWidth: `calc(100vw - ${margin * 2}px)`,
      })
    }

    updatePopupPosition()
    window.addEventListener('resize', updatePopupPosition)
    window.addEventListener('scroll', updatePopupPosition, true)
    return () => {
      window.removeEventListener('resize', updatePopupPosition)
      window.removeEventListener('scroll', updatePopupPosition, true)
    }
  }, [showStrokePopup])

  // ── Initialize Fabric Canvas ──────────────────────────────────────────────
  useEffect(() => {
    let disposed = false

    async function init() {
      const mod = await import('fabric')
      const Fabric = mod.fabric || mod.default?.fabric || mod.default
      if (disposed) return
      FabricLibRef.current = Fabric

      const canvas = canvasRef.current
      if (!canvas) return

      if (fabricRef.current) {
        try {
          fabricRef.current.dispose()
        } catch {}
        fabricRef.current = null
      }

      const wrap = overlayRef.current
      const maxW = (wrap ? wrap.clientWidth : window.innerWidth) - 16
      const maxH = (wrap ? wrap.clientHeight : window.innerHeight) - 108

      const img = new window.Image()
      img.onload = () => {
        if (disposed) return
        const scale = Math.min(maxW / img.width, maxH / img.height)
        const cw = Math.round(img.width * scale)
        const ch = Math.round(img.height * scale)
        imageMetaRef.current = {
          naturalWidth: img.naturalWidth || img.width,
          naturalHeight: img.naturalHeight || img.height,
          canvasWidth: cw,
          canvasHeight: ch,
        }

        // Set default crop box
        setCropRect({
          x: Math.round(cw * 0.1),
          y: Math.round(ch * 0.1),
          width: Math.round(cw * 0.8),
          height: Math.round(ch * 0.8),
        })

        const fab = new Fabric.Canvas(canvas, {
          width: cw,
          height: ch,
          isDrawingMode: toolRef.current === 'pen',
          selection: toolRef.current === 'select',
          defaultCursor: toolRef.current === 'select' ? 'default' : toolRef.current === 'pan' ? 'grab' : 'crosshair',
        })
        fabricRef.current = fab
        setZoomLevel(1)
        setPanOffset({ x: 0, y: 0 })
        panOffsetRef.current = { x: 0, y: 0 }

        if (toolRef.current === 'pen' && fab.freeDrawingBrush) {
          fab.freeDrawingBrush.color = colorRef.current
          fab.freeDrawingBrush.width = strokeWRef.current
          fab.freeDrawingBrush.strokeDashArray = lineTypeRef.current === 'dash' ? getDashArray(strokeWRef.current) : null
        }

        // Set background image
        Fabric.Image.fromURL(
          activeImageSrc,
          (fImg) => {
            if (disposed || !fImg) return
            fImg.scaleX = cw / img.width
            fImg.scaleY = ch / img.height
            fab.setBackgroundImage(fImg, () => {
              if (!disposed) fab.renderAll()
            })
          },
          { crossOrigin: 'anonymous' }
        )

        // Mouse Wheel Zoom
        fab.on('mouse:wheel', (opt) => {
          opt.e.preventDefault()
          opt.e.stopPropagation()
          const delta = opt.e.deltaY
          const factor = delta < 0 ? 1.15 : 1 / 1.15
          setZoomLevel(prev => {
            const next = Math.min(5, Math.max(0.5, +(prev * factor).toFixed(2)))
            if (Math.abs(next - 1) < 0.05) {
              setPanOffset({ x: 0, y: 0 })
              panOffsetRef.current = { x: 0, y: 0 }
              return 1
            }
            return next
          })
        })

        // Selection listeners: detect object stroke / dash properties
        const handleSelection = (e) => {
          const obj = e.selected ? e.selected[0] : null
          setSelectedObj(obj)
          if (obj) {
            let dash = obj.strokeDashArray
            if (!dash && obj.type === 'group' && obj.getObjects) {
              dash = obj.getObjects()[0]?.strokeDashArray
            }
            if (dash && Array.isArray(dash) && dash.length > 0) {
              setLineType('dash')
              lineTypeRef.current = 'dash'
            } else if (obj.stroke || obj.type === 'path' || obj.type === 'group' || obj.type === 'rect' || obj.type === 'ellipse') {
              setLineType('solid')
              lineTypeRef.current = 'solid'
            }
          }
        }
        fab.on('selection:created', handleSelection)
        fab.on('selection:updated', handleSelection)
        fab.on('selection:cleared', () => setSelectedObj(null))

        // Drawing & interaction listeners
        fab.on('mouse:down', onMouseDown)
        fab.on('mouse:move', onMouseMove)
        fab.on('mouse:up',   onMouseUp)
        fab.on('path:created', onPathCreated)
      }
      img.src = activeImageSrc
    }

    init()

    return () => {
      disposed = true
      if (fabricRef.current) {
        try {
          fabricRef.current.dispose()
        } catch {}
        fabricRef.current = null
      }
    }
  }, [activeImageSrc])

  // Update free drawing mode / cursor / selection whenever tool/color/stroke/lineType changes
  useEffect(() => {
    const fab = fabricRef.current
    if (!fab) return

    if (tool === 'select') {
      fab.isDrawingMode = false
      fab.selection = true
      fab.defaultCursor = 'default'
      fab.forEachObject(obj => {
        obj.selectable = true
        obj.evented = true
        obj.cornerColor = '#3b82f6'
        obj.cornerSize = 8
        obj.transparentCorners = false
      })
    } else if (tool === 'pen') {
      fab.isDrawingMode = true
      fab.selection = false
      fab.discardActiveObject()
      setSelectedObj(null)
      fab.defaultCursor = 'crosshair'
      fab.forEachObject(obj => {
        obj.selectable = false
        obj.evented = false
      })
      if (fab.freeDrawingBrush) {
        fab.freeDrawingBrush.color = color
        fab.freeDrawingBrush.width = strokeW
        fab.freeDrawingBrush.strokeDashArray = lineType === 'dash' ? getDashArray(strokeW) : null
      }
    } else if (tool === 'pan') {
      fab.isDrawingMode = false
      fab.selection = false
      fab.discardActiveObject()
      setSelectedObj(null)
      fab.defaultCursor = 'grab'
      fab.forEachObject(obj => {
        obj.selectable = false
        obj.evented = false
      })
    } else if (tool === 'text') {
      fab.isDrawingMode = false
      fab.selection = false
      fab.discardActiveObject()
      setSelectedObj(null)
      fab.defaultCursor = 'text'
      fab.forEachObject(obj => {
        obj.selectable = false
        obj.evented = false
      })
    } else {
      // cloud, arrow, crop
      fab.isDrawingMode = false
      fab.selection = false
      fab.discardActiveObject()
      setSelectedObj(null)
      fab.defaultCursor = 'crosshair'
      fab.forEachObject(obj => {
        obj.selectable = false
        obj.evented = false
      })
    }
    fab.renderAll()
  }, [tool, color, strokeW, lineType])

  // ── Drawing, Selection & Panning Events ───────────────────────────────────
  function getPointer(e) {
    const fab = fabricRef.current
    return fab ? fab.getPointer(e.e || e) : { x: 0, y: 0 }
  }

  function onMouseDown(e) {
    const fab = fabricRef.current
    if (!fab) return

    // In select mode, let Fabric handle object selection and dragging
    if (toolRef.current === 'select') {
      return
    }

    if (toolRef.current === 'pan') {
      isPanning.current = true
      lastPanPt.current = { x: e.e.clientX, y: e.e.clientY }
      fab.defaultCursor = 'grabbing'
      return
    }

    // Add Text Annotation on Click
    if (toolRef.current === 'text') {
      const Fabric = FabricLibRef.current
      if (!Fabric) return
      const pt = getPointer(e)
      const fontSize = Math.max(16, strokeWRef.current * 3 + 12)
      const iText = new Fabric.IText('Text note', {
        left: pt.x,
        top: pt.y,
        fill: colorRef.current,
        fontSize: fontSize,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 'bold',
        selectable: true,
        padding: 4,
        cornerColor: '#3b82f6',
        cornerSize: 8,
        transparentCorners: false,
      })
      fab.add(iText)
      fab.setActiveObject(iText)
      iText.enterEditing()
      iText.selectAll()
      fab.renderAll()

      undoStack.current.push(iText)
      redoStack.current = []
      setCanUndo(true)
      setCanRedo(false)
      setSelectedObj(iText)
      setTool('select')
      toolRef.current = 'select'
      return
    }

    if (toolRef.current === 'pen') return

    isDrawing.current = true
    startPt.current   = getPointer(e)
    activeObj.current = null
  }

  function onMouseMove(e) {
    const fab = fabricRef.current
    if (!fab) return

    // Pan handling
    if (isPanning.current && toolRef.current === 'pan') {
      const dx = e.e.clientX - lastPanPt.current.x
      const dy = e.e.clientY - lastPanPt.current.y
      lastPanPt.current = { x: e.e.clientX, y: e.e.clientY }
      setPanOffset(prev => {
        const next = { x: prev.x + dx, y: prev.y + dy }
        panOffsetRef.current = next
        return next
      })
      return
    }

    if (!isDrawing.current || toolRef.current === 'pen' || !startPt.current) return
    const Fabric = FabricLibRef.current
    if (!Fabric) return

    const { x, y }         = getPointer(e)
    const { x: ox, y: oy } = startPt.current

    if (activeObj.current) {
      fab.remove(activeObj.current)
      activeObj.current = null
    }

    const currentTool = toolRef.current
    const strokeColor = colorRef.current
    const strokeWidth = strokeWRef.current

    let obj = null

    const isDash = lineTypeRef.current === 'dash'
    const dash = isDash ? getDashArray(strokeWidth) : null

    if (currentTool === 'rectangle') {
      const left   = Math.min(ox, x)
      const top    = Math.min(oy, y)
      const width  = Math.abs(x - ox)
      const height = Math.abs(y - oy)
      if (width > 3 && height > 3) {
        obj = new Fabric.Rect({
          left,
          top,
          width,
          height,
          originX: 'left',
          originY: 'top',
          stroke: strokeColor,
          strokeWidth,
          strokeDashArray: dash,
          fill: 'transparent',
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: false,
          cornerColor: '#3b82f6',
          cornerSize: 8,
          transparentCorners: false,
        })
      }
    } else if (currentTool === 'circle') {
      const left   = Math.min(ox, x)
      const top    = Math.min(oy, y)
      const width  = Math.abs(x - ox)
      const height = Math.abs(y - oy)
      const rx     = width / 2
      const ry     = height / 2
      if (rx > 2 && ry > 2) {
        obj = new Fabric.Ellipse({
          left,
          top,
          rx,
          ry,
          originX: 'left',
          originY: 'top',
          stroke: strokeColor,
          strokeWidth,
          strokeDashArray: dash,
          fill: 'transparent',
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: false,
          cornerColor: '#3b82f6',
          cornerSize: 8,
          transparentCorners: false,
        })
      }
    } else if (currentTool === 'cloud') {
      obj = drawCloud(Fabric, ox, oy, x, y, strokeColor, strokeWidth, dash)
    } else if (currentTool === 'arrow') {
      const dx  = x - ox
      const dy  = y - oy
      const len = Math.hypot(dx, dy)
      if (len > 4) {
        const angle      = Math.atan2(dy, dx)
        const aLen       = Math.min(24, Math.max(12, len * 0.22))
        const arrowAngle = Math.PI / 6 // 30 deg
        const x1 = x - aLen * Math.cos(angle - arrowAngle)
        const y1 = y - aLen * Math.sin(angle - arrowAngle)
        const x2 = x - aLen * Math.cos(angle + arrowAngle)
        const y2 = y - aLen * Math.sin(angle + arrowAngle)
        if (isDash) {
          const shaft = new Fabric.Path(`M ${ox} ${oy} L ${x} ${y}`, {
            stroke: strokeColor,
            strokeWidth,
            strokeDashArray: dash,
            fill: '',
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
          })
          const head = new Fabric.Path(`M ${x1} ${y1} L ${x} ${y} L ${x2} ${y2}`, {
            stroke: strokeColor,
            strokeWidth,
            strokeDashArray: null,
            fill: '',
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
          })
          obj = new Fabric.Group([shaft, head], {
            selectable: false,
            cornerColor: '#3b82f6',
            cornerSize: 8,
            transparentCorners: false,
          })
        } else {
          const pathData = `M ${ox} ${oy} L ${x} ${y} M ${x1} ${y1} L ${x} ${y} L ${x2} ${y2}`
          obj = new Fabric.Path(pathData, {
            stroke: strokeColor,
            strokeWidth,
            strokeDashArray: null,
            fill: '',
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            selectable: false,
            cornerColor: '#3b82f6',
            cornerSize: 8,
            transparentCorners: false,
          })
        }
      }
    } else if (currentTool === 'dimension') {
      const dx  = x - ox
      const dy  = y - oy
      const len = Math.hypot(dx, dy)
      if (len > 4) {
        const angle      = Math.atan2(dy, dx)
        const perpAngle  = angle + Math.PI / 2
        const aLen       = Math.min(22, Math.max(10, len * 0.2))
        const arrowAngle = Math.PI / 6 // 30 deg

        // End arrowhead (pointing towards x, y)
        const ex1 = x - aLen * Math.cos(angle - arrowAngle)
        const ey1 = y - aLen * Math.sin(angle - arrowAngle)
        const ex2 = x - aLen * Math.cos(angle + arrowAngle)
        const ey2 = y - aLen * Math.sin(angle + arrowAngle)

        // Start arrowhead (pointing towards ox, oy)
        const sx1 = ox + aLen * Math.cos(angle - arrowAngle)
        const sy1 = oy + aLen * Math.sin(angle - arrowAngle)
        const sx2 = ox + aLen * Math.cos(angle + arrowAngle)
        const sy2 = oy + aLen * Math.sin(angle + arrowAngle)

        // Perpendicular witness / tick lines at endpoints
        const tickLen  = Math.min(22, Math.max(12, strokeWidth * 3.5))
        const halfTick = tickLen / 2
        const stX1 = ox + halfTick * Math.cos(perpAngle)
        const stY1 = oy + halfTick * Math.sin(perpAngle)
        const stX2 = ox - halfTick * Math.cos(perpAngle)
        const stY2 = oy - halfTick * Math.sin(perpAngle)

        const enX1 = x + halfTick * Math.cos(perpAngle)
        const enY1 = y + halfTick * Math.sin(perpAngle)
        const enX2 = x - halfTick * Math.cos(perpAngle)
        const enY2 = y - halfTick * Math.sin(perpAngle)

        if (isDash) {
          const shaft = new Fabric.Path(`M ${ox} ${oy} L ${x} ${y}`, {
            stroke: strokeColor,
            strokeWidth,
            strokeDashArray: dash,
            fill: '',
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
          })
          const markers = new Fabric.Path(
            `M ${stX1} ${stY1} L ${stX2} ${stY2} M ${enX1} ${enY1} L ${enX2} ${enY2} M ${ex1} ${ey1} L ${x} ${y} L ${ex2} ${ey2} M ${sx1} ${sy1} L ${ox} ${oy} L ${sx2} ${sy2}`,
            {
              stroke: strokeColor,
              strokeWidth,
              strokeDashArray: null,
              fill: '',
              strokeLineCap: 'round',
              strokeLineJoin: 'round',
            }
          )
          obj = new Fabric.Group([shaft, markers], {
            selectable: false,
            cornerColor: '#3b82f6',
            cornerSize: 8,
            transparentCorners: false,
          })
        } else {
          const pathData = `M ${ox} ${oy} L ${x} ${y} M ${stX1} ${stY1} L ${stX2} ${stY2} M ${enX1} ${enY1} L ${enX2} ${enY2} M ${ex1} ${ey1} L ${x} ${y} L ${ex2} ${ey2} M ${sx1} ${sy1} L ${ox} ${oy} L ${sx2} ${sy2}`
          obj = new Fabric.Path(pathData, {
            stroke: strokeColor,
            strokeWidth,
            strokeDashArray: null,
            fill: '',
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            selectable: false,
            cornerColor: '#3b82f6',
            cornerSize: 8,
            transparentCorners: false,
          })
        }
      }
    } else if (currentTool === 'line') {
      const dx  = x - ox
      const dy  = y - oy
      const len = Math.hypot(dx, dy)
      if (len > 3) {
        obj = new Fabric.Line([ox, oy, x, y], {
          stroke: strokeColor,
          strokeWidth,
          strokeDashArray: dash,
          fill: '',
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: false,
          cornerColor: '#3b82f6',
          cornerSize: 8,
          transparentCorners: false,
        })
      }
    } else if (currentTool === 'cloud') {
      obj = drawCloud(Fabric, ox, oy, x, y, strokeColor, strokeWidth, dash)
    }

    if (obj) {
      fab.add(obj)
      activeObj.current = obj
      fab.renderAll()
    }
  }

  function onMouseUp() {
    if (isPanning.current) {
      isPanning.current = false
      const fab = fabricRef.current
      if (fab) fab.defaultCursor = 'grab'
      return
    }

    if (!isDrawing.current) return
    isDrawing.current = false
    startPt.current   = null

    if (activeObj.current) {
      undoStack.current.push(activeObj.current)
      redoStack.current = []
      setCanUndo(true)
      setCanRedo(false)
      activeObj.current = null
    }
  }

  function onPathCreated(e) {
    if (e && e.path) {
      const dash = lineTypeRef.current === 'dash' ? getDashArray(strokeWRef.current) : null
      if (dash) {
        e.path.set('strokeDashArray', dash)
      }
      e.path.set({
        selectable: toolRef.current === 'select',
        evented: toolRef.current === 'select',
        cornerColor: '#3b82f6',
        cornerSize: 8,
        transparentCorners: false,
      })
      undoStack.current.push(e.path)
      redoStack.current = []
      setCanUndo(true)
      setCanRedo(false)
    }
  }

  // ── History & Delete Controls ─────────────────────────────────────────────
  function undo() {
    const fab = fabricRef.current
    if (!fab || undoStack.current.length === 0) return
    const last = undoStack.current.pop()
    fab.remove(last)
    fab.discardActiveObject()
    setSelectedObj(null)
    fab.renderAll()
    redoStack.current.push(last)
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(true)
  }

  function redo() {
    const fab = fabricRef.current
    if (!fab || redoStack.current.length === 0) return
    const next = redoStack.current.pop()
    fab.add(next)
    fab.renderAll()
    undoStack.current.push(next)
    setCanUndo(true)
    setCanRedo(redoStack.current.length > 0)
  }

  // Clear all annotations (Eraser icon)
  function clearAllAnnotations() {
    const fab = fabricRef.current
    if (!fab) return
    if (!confirm('Clear all annotations on this photo?')) return
    const objects = fab.getObjects()
    objects.forEach(obj => fab.remove(obj))
    fab.discardActiveObject()
    setSelectedObj(null)
    fab.renderAll()
    undoStack.current = []
    redoStack.current = []
    setCanUndo(false)
    setCanRedo(false)
  }

  // Delete only the currently selected annotation
  function handleDeleteSelected() {
    const fab = fabricRef.current
    if (!fab) return
    const active = fab.getActiveObject()
    if (active) {
      fab.remove(active)
      fab.discardActiveObject()
      fab.renderAll()
      undoStack.current = undoStack.current.filter(o => o !== active)
      setSelectedObj(null)
    }
  }

  // ── Zoom In / Out / Reset ─────────────────────────────────────────────────
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(5, +(prev * 1.25).toFixed(2)))
  }

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const next = Math.max(0.5, +(prev / 1.25).toFixed(2))
      if (Math.abs(next - 1) < 0.08) {
        setPanOffset({ x: 0, y: 0 })
        panOffsetRef.current = { x: 0, y: 0 }
        return 1
      }
      return next
    })
  }

  const handleResetZoom = () => {
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    panOffsetRef.current = { x: 0, y: 0 }
  }

  // Viewport Wheel & Pointer Handlers (Pan & Zoom anywhere on screen)
  const handleViewportWheel = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setZoomLevel(prev => {
      const next = Math.min(5, Math.max(0.5, +(prev * factor).toFixed(2)))
      if (Math.abs(next - 1) < 0.05) {
        setPanOffset({ x: 0, y: 0 })
        panOffsetRef.current = { x: 0, y: 0 }
        return 1
      }
      return next
    })
  }

  const handleViewportPointerDown = (e) => {
    if (toolRef.current !== 'pan' && e.button !== 1 && e.button !== 0) return
    const onCanvas = e.target && e.target.closest && (e.target.closest('.canvas-container') || e.target.closest('canvas'))
    if (toolRef.current === 'pan' || e.button === 1 || (!onCanvas && zoomLevel > 1)) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY }
      panStartOffset.current = { ...panOffsetRef.current }
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    }
  }

  const handleViewportPointerMove = (e) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      const next = { x: panStartOffset.current.x + dx, y: panStartOffset.current.y + dy }
      panOffsetRef.current = next
      setPanOffset(next)
    }
  }

  const handleViewportPointerUp = () => {
    if (isPanning.current) {
      isPanning.current = false
    }
  }

  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 2) {
      const [t1, t2] = e.touches
      pinchDistRef.current = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      pinchStartZoomRef.current = zoomLevel
      isPanning.current = false
    }
  }

  const handleTouchMove = (e) => {
    if (e.touches && e.touches.length === 2 && pinchDistRef.current) {
      const [t1, t2] = e.touches
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const ratio = dist / pinchDistRef.current
      const newZoom = Math.min(4, Math.max(1, +(pinchStartZoomRef.current * ratio).toFixed(2)))
      setZoomLevel(newZoom)
      if (newZoom <= 1.05) {
        setPanOffset({ x: 0, y: 0 })
        panOffsetRef.current = { x: 0, y: 0 }
      }
    }
  }

  const handleTouchEnd = () => {
    pinchDistRef.current = null
  }

  // ── Crop Handling ─────────────────────────────────────────────────────────
  const handleStartCrop = () => {
    setIsCropping(true)
    setSelectMode('crop')
    setTool('crop')
    toolRef.current = 'crop'
    handleResetZoom()
  }

  const handleCancelCrop = () => {
    setIsCropping(false)
    setSelectMode('select')
    setTool('select')
    toolRef.current = 'select'
  }

  const handleApplyCrop = () => {
    const { canvasWidth, canvasHeight } = imageMetaRef.current
    if (!canvasWidth || !canvasHeight) {
      setIsCropping(false)
      setSelectMode('select')
      setTool('select')
      toolRef.current = 'select'
      return
    }

    const img = new window.Image()
    img.onload = () => {
      const scaleX = img.naturalWidth / canvasWidth
      const scaleY = img.naturalHeight / canvasHeight

      const sx = Math.max(0, Math.round(cropRect.x * scaleX))
      const sy = Math.max(0, Math.round(cropRect.y * scaleY))
      const sw = Math.min(img.naturalWidth - sx, Math.round(cropRect.width * scaleX))
      const sh = Math.min(img.naturalHeight - sy, Math.round(cropRect.height * scaleY))

      if (sw < 15 || sh < 15) {
        setIsCropping(false)
        setSelectMode('select')
        setTool('select')
        toolRef.current = 'select'
        return
      }

      const offscreen = document.createElement('canvas')
      offscreen.width = sw
      offscreen.height = sh
      const ctx = offscreen.getContext('2d')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      const croppedUrl = offscreen.toDataURL('image/jpeg', 0.95)
      setImageHistory(prev => [...prev, activeImageSrc])
      setActiveImageSrc(croppedUrl)
      setIsCropping(false)
      setSelectMode('select')
      setTool('select')
      toolRef.current = 'select'
    }
    img.src = activeImageSrc
  }

  // Interactive Crop Dragging & Resizing
  const handleCropPointerDown = (e, handleType) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    cropDragRef.current = {
      type: handleType,
      startX: e.clientX,
      startY: e.clientY,
      initialRect: { ...cropRect },
    }
  }

  const handleCropPointerMove = (e) => {
    if (!cropDragRef.current) return
    const { type, startX, startY, initialRect } = cropDragRef.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const { canvasWidth, canvasHeight } = imageMetaRef.current
    if (!canvasWidth || !canvasHeight) return

    setCropRect(prev => {
      let { x, y, width, height } = initialRect
      const minSize = 35

      if (type === 'move') {
        x = Math.max(0, Math.min(canvasWidth - width, x + dx))
        y = Math.max(0, Math.min(canvasHeight - height, y + dy))
      } else if (type === 'tl') {
        const nx = Math.max(0, Math.min(x + width - minSize, x + dx))
        const ny = Math.max(0, Math.min(y + height - minSize, y + dy))
        width += (x - nx)
        height += (y - ny)
        x = nx
        y = ny
      } else if (type === 'tr') {
        width = Math.max(minSize, Math.min(canvasWidth - x, width + dx))
        const ny = Math.max(0, Math.min(y + height - minSize, y + dy))
        height += (y - ny)
        y = ny
      } else if (type === 'bl') {
        const nx = Math.max(0, Math.min(x + width - minSize, x + dx))
        width += (x - nx)
        x = nx
        height = Math.max(minSize, Math.min(canvasHeight - y, height + dy))
      } else if (type === 'br') {
        width = Math.max(minSize, Math.min(canvasWidth - x, width + dx))
        height = Math.max(minSize, Math.min(canvasHeight - y, height + dy))
      }
      return { x, y, width, height }
    })
  }

  const handleCropPointerUp = () => {
    cropDragRef.current = null
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    const fab = fabricRef.current
    if (!fab) {
      onSave(activeImageSrc)
      return
    }

    // Reset viewport transform so exported canvas is never clipped by current zoom/pan
    const currentVpt = fab.viewportTransform ? fab.viewportTransform.slice() : null
    if (fab.setViewportTransform) {
      fab.setViewportTransform([1, 0, 0, 1, 0, 0])
    }

    const { naturalWidth, naturalHeight, canvasWidth } = imageMetaRef.current
    const exportOpts = getAnnotatorExportOptions(
      naturalWidth,
      naturalHeight,
      canvasWidth || fab.getWidth(),
      photoQuality || getStoredPhotoQuality()
    )
    const dataUrl = fab.toDataURL(exportOpts)

    // Restore viewport transform
    if (currentVpt && fab.setViewportTransform) {
      fab.setViewportTransform(currentVpt)
      fab.renderAll()
    }

    onSave(dataUrl)
  }

  // ── Tool / Style Switchers ─────────────────────────────────────────────────
  function handleSelectTool(id) {
    if (id === 'crop') {
      handleStartCrop()
      return
    }
    if (isCropping) {
      setIsCropping(false)
    }
    if (['select', 'pan'].includes(id)) {
      setSelectMode(id)
    }
    if (['rectangle', 'circle', 'cloud', 'arrow', 'dimension', 'line'].includes(id)) {
      setSelectedShape(id)
    }
    setTool(id)
    toolRef.current = id
  }

  function handleSelectColor(c) {
    setColor(c)
    colorRef.current = c
    const fab = fabricRef.current
    if (fab && fab.freeDrawingBrush) {
      fab.freeDrawingBrush.color = c
    }
    // If an object or text is currently selected, update its color
    if (fab) {
      const active = fab.getActiveObject()
      if (active) {
        if (active.type === 'i-text' || active.type === 'text') {
          active.set('fill', c)
        } else if (active.type === 'group' && active.getObjects) {
          active.getObjects().forEach(o => {
            if (o.type === 'i-text' || o.type === 'text') o.set('fill', c)
            else o.set('stroke', c)
          })
        } else {
          active.set('stroke', c)
        }
        fab.renderAll()
      }
    }
  }

  function handleSetStrokeWidth(w) {
    setStrokeW(w)
    strokeWRef.current = w
    const dash = lineTypeRef.current === 'dash' ? getDashArray(w) : null
    const fab = fabricRef.current
    if (fab && fab.freeDrawingBrush) {
      fab.freeDrawingBrush.width = w
      fab.freeDrawingBrush.strokeDashArray = dash
    }
    if (fab) {
      const active = fab.getActiveObject()
      if (active && active.type !== 'i-text' && active.type !== 'text') {
        if (active.type === 'group' && active.getObjects) {
          active.getObjects().forEach(o => {
            o.set('strokeWidth', w)
            if (o.strokeDashArray) o.set('strokeDashArray', dash)
          })
        } else {
          active.set('strokeWidth', w)
          if (active.strokeDashArray) active.set('strokeDashArray', dash)
        }
        fab.renderAll()
      }
    }
  }

  function handleSetLineType(type) {
    setLineType(type)
    lineTypeRef.current = type
    const dash = type === 'dash' ? getDashArray(strokeWRef.current) : null
    const fab = fabricRef.current
    if (fab) {
      if (fab.freeDrawingBrush) {
        fab.freeDrawingBrush.strokeDashArray = dash
      }
      const active = fab.getActiveObject()
      if (active && active.type !== 'i-text' && active.type !== 'text') {
        if (active.type === 'group' && active.getObjects) {
          active.getObjects().forEach(o => {
            o.set('strokeDashArray', dash)
          })
        } else {
          active.set('strokeDashArray', dash)
        }
        fab.renderAll()
      }
    }
  }

  const isShapeActive = ['rectangle', 'circle', 'cloud', 'arrow', 'dimension', 'line'].includes(tool) && !isCropping
  const isSelectActive = (tool === 'select' || tool === 'pan' || isCropping)
  const currentShapeObj = SHAPES.find(s => s.id === selectedShape) || SHAPES[2] // defaults to Cloud
  const currentSelectToolObj = SELECT_TOOLS.find(s => s.id === (isCropping ? 'crop' : selectMode)) || SELECT_TOOLS[0]

  const handleShapesButtonClick = (e) => {
    e.stopPropagation()
    if (!isShapeActive) {
      handleSelectTool(selectedShape)
    }
    setShowShapesMenu(prev => !prev)
    setShowSelectMenu(false)
    setShowStrokePopup(false)
  }

  const handleSelectButtonClick = (e) => {
    e.stopPropagation()
    if (!isSelectActive) {
      handleSelectTool(selectMode)
    }
    setShowSelectMenu(prev => !prev)
    setShowShapesMenu(false)
    setShowStrokePopup(false)
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[60] bg-gray-900 flex flex-col select-none">
      {/* Top toolbar - Responsive Single-Line Layout */}
      <div
        className="relative z-30 bg-gray-800 border-b border-gray-700 px-2 sm:px-4 py-1.5 flex-shrink-0"
        style={{
          paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))',
          paddingLeft: 'calc(8px + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(8px + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center justify-between gap-1 sm:gap-2 max-w-4xl mx-auto w-full py-0.5">
          {/* Tool buttons group */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Select / Pan / Crop Dropdown */}
            <div className="relative" ref={selectMenuRef}>
              <button
                type="button"
                onClick={handleSelectButtonClick}
                title={`Select tool (${currentSelectToolObj.label})`}
                className={`flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-xl transition-all min-w-[38px] sm:min-w-[42px] cursor-pointer ${
                  isSelectActive
                    ? 'bg-brand-600 text-white shadow-sm ring-1 ring-white/30'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/80'
                }`}
              >
                <div className="flex items-center gap-0.5">
                  {currentSelectToolObj.icon}
                  <ChevronDown size={11} className="opacity-70 -mr-0.5" />
                </div>
                <span className="text-[10px] leading-tight font-medium mt-0.5">
                  {currentSelectToolObj.label}
                </span>
              </button>

              {showSelectMenu && (
                <div
                  className="absolute top-full left-0 mt-2 z-[70] bg-gray-900 border border-gray-700 rounded-xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-1 min-w-[125px] animate-fade-in"
                  style={{ minWidth: '125px' }}
                >
                  {SELECT_TOOLS.map(st => {
                    const isSelected = isCropping ? st.id === 'crop' : tool === st.id
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectMode(st.id)
                          handleSelectTool(st.id)
                          setShowSelectMenu(false)
                        }}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'text-gray-300 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {st.icon}
                          <span>{st.label}</span>
                        </div>
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Shapes Dropdown (Rectangle, Circle, Cloud, Arrow) */}
            <div className="relative" ref={shapesMenuRef}>
              <button
                type="button"
                onClick={handleShapesButtonClick}
                title={`Shapes (${currentShapeObj?.label || 'Cloud'})`}
                className={`flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-xl transition-all min-w-[38px] sm:min-w-[42px] cursor-pointer ${
                  isShapeActive
                    ? 'bg-brand-600 text-white shadow-sm ring-1 ring-white/30'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/80'
                }`}
              >
                <div className="flex items-center gap-0.5">
                  {currentShapeObj?.icon || <ConstructionCloudIcon size={17} />}
                  <ChevronDown size={11} className="opacity-70 -mr-0.5" />
                </div>
                <span className="text-[10px] leading-tight font-medium mt-0.5">
                  {currentShapeObj?.label || 'Cloud'}
                </span>
              </button>

              {showShapesMenu && (
                <div
                  className="absolute top-full left-0 mt-2 z-[70] bg-gray-900 border border-gray-700 rounded-xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-1 min-w-[150px] animate-fade-in"
                  style={{ minWidth: '150px' }}
                >
                  {SHAPES.map(s => {
                    const isSelected = !isCropping && tool === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedShape(s.id)
                          handleSelectTool(s.id)
                          setShowShapesMenu(false)
                        }}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'text-gray-300 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {s.icon}
                          <span>{s.label}</span>
                        </div>
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Other Tools: Pen, Text */}
            {OTHER_TOOLS.map(t => {
              const isActive = tool === t.id && !isCropping
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setShowSelectMenu(false)
                    setShowShapesMenu(false)
                    handleSelectTool(t.id)
                  }}
                  title={t.label}
                  className={`flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-xl transition-all min-w-[34px] sm:min-w-[38px] cursor-pointer ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm ring-1 ring-white/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700/80'
                  }`}
                >
                  {t.icon}
                  <span className="text-[10px] leading-tight font-medium mt-0.5">{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-700 flex-shrink-0 mx-0.5" />

          {/* 3 Color Selection with Line Weight Popup Below */}
          <div className="relative flex-shrink-0" ref={strokePopupRef}>
            <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-900/60 p-1 sm:p-1.5 px-2 rounded-xl border border-gray-700/80">
              {THREE_COLORS.map(c => {
                const isSelected = color === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setShowSelectMenu(false)
                      setShowShapesMenu(false)
                      handleSelectColor(c)
                      setShowStrokePopup(prev => isSelected ? !prev : true)
                    }}
                    className={`w-6 h-6 sm:w-6 sm:h-6 rounded-full flex-shrink-0 transition-all cursor-pointer relative shadow-sm ${
                      isSelected
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105'
                        : 'opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ background: c }}
                    title={`Select color (Click to change line weight & type)`}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow-xs">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Line Weight Selection Pop-up Directly Below Color Selection (Screen-Clamped) */}
            {showStrokePopup && (
              <div
                className="absolute top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2.5 animate-fade-in"
                style={popupStyle}
              >
                <div className="flex items-center justify-between text-xs text-gray-300 pb-1.5 border-b border-gray-800">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400">Line Weight</span>
                  <span className="font-mono font-bold text-white bg-gray-800 px-2 py-0.5 rounded-md border border-gray-700 text-xs">
                    {strokeW}px
                  </span>
                </div>

                {/* Preset Thickness Options with Live Stroke Preview in the Active Color */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Fine',  w: 2 },
                    { label: 'Med',   w: 4 },
                    { label: 'Thick', w: 7 },
                    { label: 'Heavy', w: 12 },
                  ].map(preset => {
                    const isActive = strokeW === preset.w
                    return (
                      <button
                        key={preset.w}
                        type="button"
                        onClick={() => handleSetStrokeWidth(preset.w)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-gray-800 border-white/60 text-white shadow-xs'
                            : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800/80'
                        }`}
                        title={`${preset.label} (${preset.w}px)`}
                      >
                        <div
                          className="w-full rounded-full mb-1.5 transition-all"
                          style={{
                            height: `${Math.min(10, Math.max(2, preset.w))}px`,
                            background: color,
                          }}
                        />
                        <span className="text-[10px] font-semibold">{preset.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Line Type Toggle inside Line Weight popup */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-xs">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400">Line Type</span>
                  <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
                    <button
                      type="button"
                      onClick={() => handleSetLineType('solid')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        lineType === 'solid' ? 'bg-brand-600 text-white shadow-xs' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <svg width="18" height="8" viewBox="0 0 18 8" className={lineType === 'solid' ? 'text-white' : 'text-gray-400'}>
                        <line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                      <span>Solid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetLineType('dash')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        lineType === 'dash' ? 'bg-brand-600 text-white shadow-xs' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <svg width="18" height="8" viewBox="0 0 18 8" className={lineType === 'dash' ? 'text-white' : 'text-gray-400'}>
                        <line x1="1" y1="4" x2="5" y2="4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        <line x1="7.5" y1="4" x2="11.5" y2="4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        <line x1="14" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                      <span>Dash</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-700 flex-shrink-0 mx-0.5" />

          {/* Right: Undo / Redo / Clear Annotations (Eraser icon) */}
          <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer ${
                canUndo ? 'text-gray-200 hover:text-white hover:bg-gray-700' : 'text-gray-500 cursor-not-allowed opacity-50'
              }`}
              title="Undo annotation"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer ${
                canRedo ? 'text-gray-200 hover:text-white hover:bg-gray-700' : 'text-gray-500 cursor-not-allowed opacity-50'
              }`}
              title="Redo annotation"
            >
              <Redo2 size={16} />
            </button>
            {/* Clear All Annotations changed to Eraser icon */}
            <button
              type="button"
              onClick={clearAllAnnotations}
              className="p-1.5 sm:p-2 text-amber-400 hover:text-amber-300 hover:bg-gray-700 rounded-xl transition-colors cursor-pointer"
              title="Clear all annotations on photo (Eraser)"
            >
              <Eraser size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas & Interactive Viewport Container */}
      <div
        ref={viewportContainerRef}
        className="flex-1 relative overflow-hidden bg-gray-950 flex items-center justify-center touch-none select-none"
        onWheel={handleViewportWheel}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor: tool === 'pan' ? (isPanning.current ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Floating Selected Annotation Toolbar (Move / Edit / Delete) */}
        {selectedObj && tool === 'select' && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900/90 border border-gray-700 px-3 py-1.5 rounded-2xl shadow-2xl backdrop-blur-md animate-fade-in"
            data-no-pan="true"
          >
            <span className="text-xs text-gray-300 font-semibold flex items-center gap-1.5">
              <MousePointer size={13} className="text-blue-400" />
              <span>{selectedObj.type === 'i-text' ? 'Text Selected (Double-click to edit)' : 'Annotation Selected'}</span>
            </span>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="px-2.5 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors flex items-center gap-1 shadow-md cursor-pointer ml-1"
              title="Delete selected annotation (or press Delete/Backspace)"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}

        {/* Scalable and Pannable Canvas Wrapper */}
        <div
          ref={canvasWrapperRef}
          className="relative touch-none shadow-2xl"
          style={{
            width: imageMetaRef.current.canvasWidth || 'auto',
            height: imageMetaRef.current.canvasHeight || 'auto',
            transformOrigin: 'center center',
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transition: isPanning.current ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          <canvas ref={canvasRef} className="block touch-none" />

          {/* Interactive Crop Overlay */}
          {isCropping && (
            <div
              className="absolute inset-0 z-30 select-none overflow-hidden touch-none"
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              {/* Crop Bounding Box with Dark Backdrop */}
              <div
                className="absolute border-2 border-white shadow-2xl cursor-move touch-none"
                style={{
                  left: cropRect.x,
                  top: cropRect.y,
                  width: cropRect.width,
                  height: cropRect.height,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                }}
                onPointerDown={(e) => handleCropPointerDown(e, 'move')}
              >
                {/* 3x3 Rule-of-thirds grid */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                  <div className="border-r border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-b border-white" />
                  <div className="border-r border-white" />
                  <div className="border-r border-white" />
                  <div />
                </div>

                {/* 4 Corner Resize Handles */}
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'tl')}
                  className="absolute -top-2 -left-2 w-5 h-5 bg-white border-2 border-brand-600 rounded-sm cursor-nwse-resize shadow-md"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'tr')}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-white border-2 border-brand-600 rounded-sm cursor-nesw-resize shadow-md"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'bl')}
                  className="absolute -bottom-2 -left-2 w-5 h-5 bg-white border-2 border-brand-600 rounded-sm cursor-nesw-resize shadow-md"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'br')}
                  className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-2 border-brand-600 rounded-sm cursor-nwse-resize shadow-md"
                />
              </div>

              {/* Floating Crop Confirmation Bar */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900/90 border border-gray-700 px-3 py-1.5 rounded-2xl shadow-2xl backdrop-blur-md">
                <button
                  type="button"
                  onClick={handleCancelCrop}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Check size={14} strokeWidth={3} /> Apply Crop
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Floating Zoom Controls at Bottom-Right of Viewport */}
        {!isCropping && (
          <div
            className="absolute bottom-4 right-4 flex items-center gap-1 bg-gray-900/85 backdrop-blur-md px-2 py-1 rounded-xl border border-gray-700 text-white shadow-xl z-20"
            data-no-pan="true"
          >
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              className="p-1 hover:bg-white/15 rounded-lg text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 py-0.5 text-xs font-mono font-bold text-gray-200 hover:text-white hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
              title="Reset Zoom (Fit to Screen)"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 5}
              className="p-1 hover:bg-white/15 rounded-lg text-gray-300 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            {(zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 hover:bg-white/15 rounded-lg text-gray-300 hover:text-white transition-colors cursor-pointer ml-0.5 border-l border-gray-700 pl-1.5"
                title="Fit to Screen"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom action buttons - Aligned with desktop page width (max-w-4xl) like the top bar */}
      <div
        className="bg-gray-800 border-t border-gray-700 p-3 flex-shrink-0"
        style={{
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(12px + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(12px + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-initial sm:px-8 py-2.5 rounded-xl border border-gray-600 text-gray-300 font-semibold text-sm hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <X size={16} /> Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="sitepunch-btn-primary flex-1 sm:flex-initial sm:px-10 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            style={{ background: 'var(--brand-button, #1d4ed8)' }}
          >
            <Check size={16} /> {saveButtonLabel || 'Save Photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Construction Revision Cloud Generator ──────────────────────────────────
function drawCloud(Fabric, ox, oy, x, y, stroke, strokeWidth, strokeDashArray = null) {
  const left   = Math.min(ox, x)
  const top    = Math.min(oy, y)
  const width  = Math.abs(x - ox)
  const height = Math.abs(y - oy)
  if (width < 8 || height < 8) return null

  // Divide width and height into scallops roughly 24px wide
  const step = 24
  const nx = Math.max(2, Math.round(width / step))
  const ny = Math.max(2, Math.round(height / step))
  const hx = Math.max(4, (width / nx) * 0.4)
  const hy = Math.max(4, (height / ny) * 0.4)

  let d = `M ${left} ${top} `

  // Top edge: left to right (scallops arch upward)
  for (let i = 0; i < nx; i++) {
    const x1 = left + (width / nx) * (i + 1)
    const cx = left + (width / nx) * (i + 0.5)
    const cy = top - hx
    d += `Q ${cx} ${cy} ${x1} ${top} `
  }

  // Right edge: top to bottom (scallops arch rightward)
  for (let i = 0; i < ny; i++) {
    const y1 = top + (height / ny) * (i + 1)
    const cx = left + width + hy
    const cy = top + (height / ny) * (i + 0.5)
    d += `Q ${cx} ${cy} ${left + width} ${y1} `
  }

  // Bottom edge: right to left (scallops arch downward)
  for (let i = 0; i < nx; i++) {
    const x1 = left + width - (width / nx) * (i + 1)
    const cx = left + width - (width / nx) * (i + 0.5)
    const cy = top + height + hx
    d += `Q ${cx} ${cy} ${x1} ${top + height} `
  }

  // Left edge: bottom to top (scallops arch leftward)
  for (let i = 0; i < ny; i++) {
    const y1 = top + height - (height / ny) * (i + 1)
    const cx = left - hy
    const cy = top + height - (height / ny) * (i + 0.5)
    d += `Q ${cx} ${cy} ${left} ${y1} `
  }

  d += 'Z'

  return new Fabric.Path(d, {
    stroke,
    strokeWidth,
    strokeDashArray,
    fill: 'transparent',
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    selectable: false,
    cornerColor: '#3b82f6',
    cornerSize: 8,
    transparentCorners: false,
  })
}
