import React, { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)

export function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const language = className?.match(/language-([\w-]+)/)?.[1]
  const code = String(children ?? '')

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!language) return <code className={className}>{children}</code>
  const highlighted = hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : hljs.highlightAuto(code).value
  return <div className="code-block" data-language={language}>
    <header><span>{language}</span><button aria-label={copied ? '已複製' : '複製程式碼'} onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true)) }}>{copied ? <Check /> : <Copy />}{copied ? '已複製' : '複製'}</button></header>
    <pre><code data-testid="highlighted-code" data-language={language} className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
  </div>
}
