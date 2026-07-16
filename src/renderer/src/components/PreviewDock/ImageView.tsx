import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'

export function ImageView({
  src,
  alt,
  onOpenLightbox
}: {
  src: string
  alt: string
  onOpenLightbox?: () => void
}): React.JSX.Element {
  const [fit, setFit] = useState(true)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setFit(true)
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setError(false)
  }, [src])

  const onWheel = useCallback((event: React.WheelEvent) => {
    if (fit) return
    event.preventDefault()
    setScale((current) => Math.min(8, Math.max(0.25, current * (event.deltaY > 0 ? 0.9 : 1.1))))
  }, [fit])

  if (error) {
    return <div className="preview-error" role="alert">無法載入圖片</div>
  }

  return <div className="preview-image-view" data-testid="preview-image-view">
    <div className="preview-image-toolbar">
      <button type="button" className={fit ? 'active' : ''} onClick={() => { setFit(true); setScale(1); setOffset({ x: 0, y: 0 }) }}>符合視窗</button>
      <button type="button" className={!fit ? 'active' : ''} onClick={() => setFit(false)}>原始大小</button>
      {!fit && <>
        <button type="button" aria-label="放大" onClick={() => setScale((s) => Math.min(8, s * 1.2))}><ZoomIn size={14} /></button>
        <button type="button" aria-label="縮小" onClick={() => setScale((s) => Math.max(0.25, s / 1.2))}><ZoomOut size={14} /></button>
      </>}
      {onOpenLightbox && <button type="button" onClick={onOpenLightbox}>全螢幕</button>}
    </div>
    <div
      className={`preview-image-stage ${fit ? 'is-fit' : 'is-actual'}`}
      onWheel={onWheel}
      onDoubleClick={() => onOpenLightbox?.()}
      onPointerDown={(event) => {
        if (fit) return
        drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
        ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        setOffset({
          x: drag.current.ox + (event.clientX - drag.current.x),
          y: drag.current.oy + (event.clientY - drag.current.y)
        })
      }}
      onPointerUp={() => { drag.current = null }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={fit ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        onError={() => setError(true)}
      />
    </div>
  </div>
}
