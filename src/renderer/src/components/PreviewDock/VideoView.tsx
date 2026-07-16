import React, { useEffect, useRef } from 'react'

export function VideoView({
  src,
  active
}: {
  src: string
  /** When false, pause playback (item switch / dock collapse). */
  active: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  const [error, setError] = React.useState(false)

  useEffect(() => {
    setError(false)
    const el = ref.current
    if (!el) return
    el.pause()
    el.currentTime = 0
    el.load()
  }, [src])

  useEffect(() => {
    if (!active) {
      ref.current?.pause()
    }
  }, [active])

  if (error) {
    return <div className="preview-error" role="alert">無法載入影片（可改用系統播放器開啟）</div>
  }

  return <div className="preview-video-view" data-testid="preview-video-view">
    <video
      ref={ref}
      key={src}
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => setError(true)}
    />
    <p className="preview-hint">支援拖曳進度列 seek（Range）</p>
  </div>
}
