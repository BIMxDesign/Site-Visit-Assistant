import React, { useState, useEffect, useRef } from 'react'
import { Camera, X, RefreshCw, Zap, ZapOff, Image as ImageIcon, ShieldCheck } from 'lucide-react'

export default function InAppCameraModal({ isOpen, onClose, onCapture, onFallbackFilePick }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facingMode, setFacingMode] = useState('environment') // 'environment' (back) | 'user' (front)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [isShutterFlashing, setIsShutterFlashing] = useState(false)
  const [loading, setLoading] = useState(true)

  // Start camera stream when modal opens or facingMode changes
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    startCamera(facingMode)

    return () => {
      stopCamera()
    }
  }, [isOpen, facingMode])

  async function startCamera(mode) {
    setLoading(true)
    setErrorMsg(null)
    stopCamera()

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported on this browser.')
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0]
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {}
        setTorchSupported(Boolean(capabilities.torch))
      }

      setLoading(false)
    } catch (err) {
      console.warn('In-app camera stream error:', err)
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera permissions or upload an image file.'
          : 'Could not connect to camera: ' + (err.message || 'Unknown error')
      )
      setLoading(false)
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setTorchOn(false)
  }

  async function toggleTorch() {
    if (!streamRef.current || !torchSupported) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return

    try {
      const nextTorch = !torchOn
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }],
      })
      setTorchOn(nextTorch)
    } catch (err) {
      console.warn('Torch toggle error:', err)
    }
  }

  function handleFlipCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  function handleTakePhoto() {
    if (!videoRef.current || !streamRef.current) return

    const video = videoRef.current
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    if (width === 0 || height === 0) return

    // Trigger visual shutter flash effect
    setIsShutterFlashing(true)
    setTimeout(() => setIsShutterFlashing(false), 150)

    // Capture frame on offscreen canvas
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // If front camera, mirror image for natural selfie feel
    if (facingMode === 'user') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    stopCamera()
    onCapture(dataUrl)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col justify-between select-none animate-fade-in"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 z-10 bg-gradient-to-b from-black/80 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-all cursor-pointer backdrop-blur-md active:scale-90"
          title="Close Camera"
        >
          <X size={22} />
        </button>

        {/* Privacy Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold backdrop-blur-md">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span>Private • Kept Outside Photo Gallery</span>
        </div>

        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2.5 rounded-full transition-all cursor-pointer backdrop-blur-md active:scale-90 ${
                torchOn ? 'bg-amber-400 text-black' : 'bg-black/40 text-white hover:bg-black/60'
              }`}
              title="Toggle Flash"
            >
              {torchOn ? <Zap size={20} /> : <ZapOff size={20} />}
            </button>
          )}

          <button
            type="button"
            onClick={handleFlipCamera}
            className="p-2.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-all cursor-pointer backdrop-blur-md active:scale-90"
            title="Switch Camera"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Viewfinder Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3 z-10">
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-xs font-medium">Starting camera...</span>
          </div>
        )}

        {errorMsg ? (
          <div className="p-6 text-center text-white max-w-sm">
            <Camera size={44} className="mx-auto mb-3 text-red-400 opacity-80" />
            <p className="text-sm font-semibold mb-4 leading-relaxed">{errorMsg}</p>
            {onFallbackFilePick && (
              <button
                type="button"
                onClick={() => {
                  stopCamera()
                  onClose()
                  onFallbackFilePick()
                }}
                className="px-5 py-2.5 rounded-xl bg-white text-gray-900 font-bold text-xs shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2 mx-auto"
              >
                <ImageIcon size={16} />
                <span>Choose From Files</span>
              </button>
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Shutter Flash Animation */}
        {isShutterFlashing && (
          <div className="absolute inset-0 bg-white pointer-events-none animate-fade-out" />
        )}
      </div>

      {/* Bottom Shutter & Controls */}
      <div className="flex items-center justify-around px-6 py-6 z-10 bg-gradient-to-t from-black/80 to-transparent">
        {/* Fallback File Picker Button */}
        <button
          type="button"
          onClick={() => {
            stopCamera()
            onClose()
            onFallbackFilePick?.()
          }}
          className="flex flex-col items-center gap-1 text-white/80 hover:text-white p-2 rounded-xl transition-all cursor-pointer active:scale-95"
          title="Upload image from device files"
        >
          <div className="p-3 rounded-full bg-white/10 backdrop-blur-md">
            <ImageIcon size={20} />
          </div>
          <span className="text-[10px] font-medium">Files</span>
        </button>

        {/* Primary Shutter Button */}
        <button
          type="button"
          onClick={handleTakePhoto}
          disabled={loading || Boolean(errorMsg)}
          className="relative p-1.5 rounded-full border-4 border-white active:scale-90 transition-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl group"
          title="Capture Photo"
        >
          <div className="w-16 h-16 rounded-full bg-white group-active:bg-gray-200 transition-colors shadow-inner" />
        </button>

        {/* Spacer for balance */}
        <div className="w-12" />
      </div>
    </div>
  )
}
