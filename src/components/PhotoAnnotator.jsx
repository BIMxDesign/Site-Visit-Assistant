import React, { useEffect, useRef, useState } from 'react'
import { getAnnotatorExportOptions, getStoredPhotoQuality } from '../utils/media'
import {
  X, ArrowRight, Pen,
  Undo2, Redo2, Trash2, Check, Minus, Plus
} from 'lucide-react'

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

const COLORS = [
  '#a40e26', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#000000', '#ffffff'
]

const TOOLS = [
  { id: 'cloud', icon: <ConstructionCloudIcon size={18} />, label: 'Cloud' },
  { id: 'arrow', icon: <ArrowRight size={16} />,         label: 'Arrow' },
  { id: 'pen',   icon: <Pen size={16} />,                label: 'Pen' },
]

export default function PhotoAnnotator({ imageDataUrl, photoQuality, onSave, onCancel }) {
  const canvasRef  = useRef(null)
  const overlayRef = useRef(null)
  const imageMetaRef = useRef({ naturalWidth: 0, naturalHeight: 0, canvasWidth: 0 })

  const [tool,    setTool]    = useState('cloud')
  const [color,   setColor]   = useState('#a40e26')
  const [strokeW, setStrokeW] = useState(3)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Use refs so event handlers always access the live values without stale closures
  const toolRef      = useRef('cloud')
  const colorRef     = useRef('#a40e26')
  const strokeWRef   = useRef(3)
  const fabricRef    = useRef(null)
  const FabricLibRef = useRef(null)

  const isDrawing = useRef(false)
  const startPt   = useRef(null)
  const activeObj = useRef(null)

  const undoStack = useRef([])
  const redoStack = useRef([])

  useEffect(() => { toolRef.current    = tool    }, [tool])
  useEffect(() => { colorRef.current   = color   }, [color])
  useEffect(() => { strokeWRef.current = strokeW }, [strokeW])

  // Accessibility & UX: Handle Escape key to cancel/exit photo markup mode back to observation edit page
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        onCancel()
      }
    }
    // Listen in capture phase (true) so it intercepts BEFORE App.jsx's global window listener
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

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

      const wrap = overlayRef.current
      const maxW = (wrap ? wrap.clientWidth : window.innerWidth) - 32
      const maxH = (wrap ? wrap.clientHeight : window.innerHeight) - 180

      const img = new window.Image()
      img.onload = () => {
        if (disposed) return
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const cw = Math.round(img.width * scale)
        const ch = Math.round(img.height * scale)
        imageMetaRef.current = {
          naturalWidth: img.naturalWidth || img.width,
          naturalHeight: img.naturalHeight || img.height,
          canvasWidth: cw,
        }

        const fab = new Fabric.Canvas(canvas, {
          width: cw,
          height: ch,
          isDrawingMode: toolRef.current === 'pen',
          selection: false,
        })
        fabricRef.current = fab

        if (toolRef.current === 'pen' && fab.freeDrawingBrush) {
          fab.freeDrawingBrush.color = colorRef.current
          fab.freeDrawingBrush.width = strokeWRef.current
        }

        // Set background image
        Fabric.Image.fromURL(
          imageDataUrl,
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

        // Event listeners
        fab.on('mouse:down', onMouseDown)
        fab.on('mouse:move', onMouseMove)
        fab.on('mouse:up',   onMouseUp)
        fab.on('path:created', onPathCreated)
      }
      img.src = imageDataUrl
    }

    init()

    return () => {
      disposed = true
      if (fabricRef.current) {
        fabricRef.current.dispose()
        fabricRef.current = null
      }
    }
  }, [imageDataUrl])

  // Update free drawing mode whenever tool/color/stroke changes
  useEffect(() => {
    const fab = fabricRef.current
    if (!fab) return
    if (tool === 'pen') {
      fab.isDrawingMode = true
      if (fab.freeDrawingBrush) {
        fab.freeDrawingBrush.color = color
        fab.freeDrawingBrush.width = strokeW
      }
    } else {
      fab.isDrawingMode = false
    }
  }, [tool, color, strokeW])

  // ── Drawing Events ────────────────────────────────────────────────────────
  function getPointer(e) {
    const fab = fabricRef.current
    return fab ? fab.getPointer(e.e || e) : { x: 0, y: 0 }
  }

  function onMouseDown(e) {
    if (toolRef.current === 'pen') return
    const fab = fabricRef.current
    if (!fab) return

    isDrawing.current = true
    startPt.current   = getPointer(e)
    activeObj.current = null
  }

  function onMouseMove(e) {
    if (!isDrawing.current || toolRef.current === 'pen' || !startPt.current) return
    const fab    = fabricRef.current
    const Fabric = FabricLibRef.current
    if (!fab || !Fabric) return

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

    if (currentTool === 'arrow') {
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
        const pathData = `M ${ox} ${oy} L ${x} ${y} M ${x1} ${y1} L ${x} ${y} L ${x2} ${y2}`
        obj = new Fabric.Path(pathData, {
          stroke: strokeColor,
          strokeWidth,
          fill: '',
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: false,
        })
      }
    } else if (currentTool === 'cloud') {
      obj = drawCloud(Fabric, ox, oy, x, y, strokeColor, strokeWidth)
    }

    if (obj) {
      fab.add(obj)
      activeObj.current = obj
      fab.renderAll()
    }
  }

  function onMouseUp() {
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
      e.path.set({ selectable: false })
      undoStack.current.push(e.path)
      redoStack.current = []
      setCanUndo(true)
      setCanRedo(false)
    }
  }

  // ── History Controls ──────────────────────────────────────────────────────
  function undo() {
    const fab = fabricRef.current
    if (!fab || undoStack.current.length === 0) return
    const last = undoStack.current.pop()
    fab.remove(last)
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

  function clear() {
    const fab = fabricRef.current
    if (!fab) return
    if (!confirm('Clear all annotations on this photo?')) return
    const objects = fab.getObjects()
    objects.forEach(obj => fab.remove(obj))
    fab.renderAll()
    undoStack.current = []
    redoStack.current = []
    setCanUndo(false)
    setCanRedo(false)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    const fab = fabricRef.current
    if (!fab) {
      onSave(imageDataUrl)
      return
    }
    const { naturalWidth, naturalHeight, canvasWidth } = imageMetaRef.current
    const exportOpts = getAnnotatorExportOptions(
      naturalWidth,
      naturalHeight,
      canvasWidth || fab.getWidth(),
      photoQuality || getStoredPhotoQuality()
    )
    const dataUrl = fab.toDataURL(exportOpts)
    onSave(dataUrl)
  }

  // ── Tool / Style Switchers ─────────────────────────────────────────────────
  function handleSelectTool(id) {
    setTool(id)
    toolRef.current = id
    const fab = fabricRef.current
    if (fab) {
      if (id === 'pen') {
        fab.isDrawingMode = true
        if (fab.freeDrawingBrush) {
          fab.freeDrawingBrush.color = colorRef.current
          fab.freeDrawingBrush.width = strokeWRef.current
        }
      } else {
        fab.isDrawingMode = false
      }
    }
  }

  function handleSelectColor(c) {
    setColor(c)
    colorRef.current = c
    const fab = fabricRef.current
    if (fab && fab.freeDrawingBrush) {
      fab.freeDrawingBrush.color = c
    }
  }

  function handleStrokeDelta(delta) {
    setStrokeW(prev => {
      const next = Math.min(24, Math.max(1, prev + delta))
      strokeWRef.current = next
      const fab = fabricRef.current
      if (fab && fab.freeDrawingBrush) {
        fab.freeDrawingBrush.width = next
      }
      return next
    })
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[60] bg-gray-900 flex flex-col select-none">
      {/* Top toolbar - Fully Responsive Layout */}
      <div
        className="bg-gray-800 border-b border-gray-700 px-2 sm:px-3 py-2 flex-shrink-0"
        style={{
          paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
          paddingLeft: 'calc(10px + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(10px + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 max-w-4xl mx-auto w-full">
          {/* Row 1 on mobile: Tool buttons on left + Undo/Redo/Clear on right */}
          <div className="flex items-center justify-between gap-1 w-full md:w-auto">
            {/* Tool buttons with name below icon */}
            <div className="flex items-center gap-1">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTool(t.id)}
                  title={t.label}
                  className={`flex flex-col items-center justify-center px-1.5 sm:px-2 py-1 rounded-lg transition-all min-w-[42px] sm:min-w-[48px] cursor-pointer ${
                    tool === t.id
                      ? 'bg-brand-600 text-white shadow-sm ring-1 ring-white/30'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700/80'
                  }`}
                >
                  {t.icon}
                  <span className="text-[10px] leading-tight font-medium mt-0.5">{t.label}</span>
                </button>
              ))}
            </div>

            {/* Undo / Redo / Clear on mobile row 1 */}
            <div className="flex items-center gap-0.5 md:hidden ml-auto">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className={`p-1.5 rounded transition-colors ${
                  canUndo ? 'text-gray-200 hover:text-white hover:bg-gray-700' : 'text-gray-500 cursor-not-allowed'
                }`}
                title="Undo"
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className={`p-1.5 rounded transition-colors ${
                  canRedo ? 'text-gray-200 hover:text-white hover:bg-gray-700' : 'text-gray-500 cursor-not-allowed'
                }`}
                title="Redo"
              >
                <Redo2 size={16} />
              </button>
              <button
                type="button"
                onClick={clear}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded transition-colors ml-0.5"
                title="Clear annotations"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Row 2 on mobile: Color Swatches + Stroke width; on desktop: in-line */}
          <div className="flex items-center justify-between md:justify-start gap-2 py-1 md:py-0 border-t md:border-t-0 border-gray-700/60 md:border-none w-full md:w-auto">
            {/* Color Swatches */}
            <div className="flex items-center gap-2 sm:gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleSelectColor(c)}
                  className={`w-6 h-6 sm:w-5 sm:h-5 rounded-full flex-shrink-0 transition-all cursor-pointer ${
                    color === c ? 'ring-2 ring-white scale-110 shadow-sm' : 'opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{ background: c }}
                  title={`Select color ${c}`}
                />
              ))}
            </div>

            {/* Stroke width on mobile row 2 */}
            <div className="flex md:hidden items-center gap-1 text-gray-300 bg-gray-900/60 px-1.5 py-0.5 rounded-lg border border-gray-700 ml-auto flex-shrink-0">
              <button
                type="button"
                onClick={() => handleStrokeDelta(-1)}
                className="p-1 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Decrease stroke"
              >
                <Minus size={12} />
              </button>
              <span className="text-white text-xs w-3.5 text-center font-bold">{strokeW}</span>
              <button
                type="button"
                onClick={() => handleStrokeDelta(1)}
                className="p-1 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Increase stroke"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Desktop-only: Stroke width & Undo/Redo/Clear grouped on the right */}
          <div className="hidden md:flex items-center gap-2">
            <div className="w-px h-6 bg-gray-700 mx-1 flex-shrink-0" />

            {/* Stroke width */}
            <div className="flex items-center gap-1 text-gray-300">
              <button
                type="button"
                onClick={() => handleStrokeDelta(-1)}
                className="p-1 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Decrease stroke"
              >
                <Minus size={14} />
              </button>
              <span className="text-white text-xs w-4 text-center font-bold">{strokeW}</span>
              <button
                type="button"
                onClick={() => handleStrokeDelta(1)}
                className="p-1 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Increase stroke"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="w-px h-6 bg-gray-700 mx-1 flex-shrink-0" />

            {/* Undo / Redo / Clear */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className={`p-1.5 rounded transition-colors ${
                  canUndo ? 'text-gray-200 hover:text-white hover:bg-gray-700' : 'text-gray-500 cursor-not-allowed'
                }`}
                title="Undo"
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className={`p-1.5 rounded transition-colors ${
                  canRedo ? 'text-gray-200 hover:text-white hover:bg-gray-700' : 'text-gray-500 cursor-not-allowed'
                }`}
                title="Redo"
              >
                <Redo2 size={16} />
              </button>
              <button
                type="button"
                onClick={clear}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded transition-colors ml-1"
                title="Clear annotations"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-3 bg-gray-950">
        <div className="rounded-lg shadow-2xl overflow-hidden border border-gray-800 touch-none">
          <canvas ref={canvasRef} className="block touch-none" />
        </div>
      </div>

      {/* Bottom action buttons */}
      <div
        className="flex gap-3 p-3 bg-gray-800 border-t border-gray-700 flex-shrink-0"
        style={{
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(12px + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(12px + env(safe-area-inset-right, 0px))',
        }}
      >
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-300 font-semibold text-sm hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
        >
          <X size={16} /> Cancel
        </button>
        <button
          onClick={handleSave}
          className="sitepunch-btn-primary flex-1 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
          style={{ background: 'var(--brand-button, #1d4ed8)' }}
        >
          <Check size={16} /> Save Photo
        </button>
      </div>
    </div>
  )
}

// ── Construction Revision Cloud Generator ──────────────────────────────────
function drawCloud(Fabric, ox, oy, x, y, stroke, strokeWidth) {
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
    fill: 'transparent',
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    selectable: false,
  })
}
