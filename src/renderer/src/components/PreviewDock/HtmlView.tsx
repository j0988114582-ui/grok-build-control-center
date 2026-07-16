import React, { useMemo } from 'react'

/**
 * HTML preview via iframe srcdoc only.
 * Default: sandbox without scripts.
 * With allowScripts: allow-scripts only — NEVER combined with allow-same-origin.
 */
export function HtmlView({
  html,
  allowScripts,
  showScriptControl,
  onToggleScripts,
  missingAssetsNote = true
}: {
  html: string
  allowScripts: boolean
  showScriptControl: boolean
  onToggleScripts: (next: boolean) => void
  missingAssetsNote?: boolean
}): React.JSX.Element {
  // Never combine allow-same-origin with allow-scripts.
  const sandbox = useMemo(
    () => (allowScripts ? 'allow-scripts' : ''),
    [allowScripts]
  )

  return <div className="preview-html-view" data-testid="preview-html-view">
    {allowScripts && (
      <div className="preview-html-warn" role="alert" data-testid="preview-html-script-banner">
        已暫時允許此檔執行腳本（僅本次，不會記住）。請確認來源可信。
      </div>
    )}
    {showScriptControl && (
      <label className="preview-html-script-toggle">
        <input
          type="checkbox"
          checked={allowScripts}
          onChange={(event) => onToggleScripts(event.target.checked)}
          data-testid="preview-html-allow-scripts"
        />
        <span>允許腳本（逐次 · 不持久化）</span>
      </label>
    )}
    {missingAssetsNote && (
      <p className="preview-hint">外部 CSS／圖片可能缺失（CSP 刻意行為；本版不做同目錄資源解析）</p>
    )}
    <iframe
      title="HTML 預覽"
      className="preview-html-frame"
      data-testid="preview-html-frame"
      sandbox={sandbox}
      srcDoc={html}
      referrerPolicy="no-referrer"
    />
  </div>
}
