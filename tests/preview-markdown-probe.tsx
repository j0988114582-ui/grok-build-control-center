// Minimal probe for transcript remote-image privacy rule (no auto <img src=https>).
import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function MarkdownRemoteChipProbe(): React.JSX.Element {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    img: ({ src, alt }) => {
      if (!src) return null
      if (/^https?:\/\//i.test(src)) {
        return <button type="button" className="md-preview-chip" data-testid="md-remote-image-chip">{alt || '遠端圖片 · 點擊在預覽台開啟'}</button>
      }
      return <button type="button" className="md-preview-chip" data-testid="md-local-image-chip">{alt || src}</button>
    }
  }}>{'![remote](https://cdn.example.com/track.png)'}</ReactMarkdown>
}
