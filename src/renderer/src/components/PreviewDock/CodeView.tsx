import React, { useEffect, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { PREVIEW_CODE_HIGHLIGHT_MAX_BYTES } from '../../../../shared/preview-types'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)

export function CodeView({
  code,
  language,
  truncated
}: {
  code: string
  language?: string
  truncated?: boolean
}): React.JSX.Element {
  const [wrap, setWrap] = useState(true)
  const [copied, setCopied] = useState(false)
  const [lang, setLang] = useState(language ?? '')

  useEffect(() => {
    setLang(language ?? '')
  }, [language, code])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const overHighlightCap = code.length > PREVIEW_CODE_HIGHLIGHT_MAX_BYTES
  const highlighted = useMemo(() => {
    if (overHighlightCap) return ''
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    } catch {
      return ''
    }
  }, [code, lang, overHighlightCap])

  return <div className="preview-code-view" data-testid="preview-code-view">
    <div className="preview-code-toolbar">
      <label>
        語言
        <input
          value={lang}
          onChange={(event) => setLang(event.target.value)}
          placeholder="auto"
          aria-label="程式碼語言"
        />
      </label>
      <label className="preview-check">
        <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />
        自動換行
      </label>
      <button
        type="button"
        aria-label={copied ? '已複製' : '複製全部'}
        onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true)) }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? '已複製' : '複製'}
      </button>
    </div>
    {truncated && <p className="preview-hint">檔案超過讀取上限，已截斷顯示</p>}
    {overHighlightCap && <p className="preview-hint">內容超過 200KB 上色上限，以純文字顯示以免卡住介面</p>}
    <pre className={`preview-code-pre ${wrap ? 'is-wrap' : 'is-scroll'}`} data-testid="preview-code-body">
      {overHighlightCap || !highlighted
        ? <code>{code}</code>
        : <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />}
    </pre>
  </div>
}
