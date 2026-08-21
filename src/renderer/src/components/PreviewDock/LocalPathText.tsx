import React from 'react'
import { basenameOf } from '../../../../shared/preview-path-policy'
import { splitTextWithLocalPaths } from '../../../../shared/preview-discover'

const SKIP_LINKIFY = new Set(['code', 'pre', 'a', 'button'])

export function LocalPathChips({
  text,
  onPreviewPath
}: {
  text: string
  onPreviewPath?: (path: string) => void
}): React.ReactNode {
  if (!onPreviewPath) return text
  const parts = splitTextWithLocalPaths(text)
  if (parts.length === 1 && parts[0]?.type === 'text') return text
  return parts.map((part, index) => {
    if (part.type !== 'path') return <React.Fragment key={`t${index}`}>{part.value}</React.Fragment>
    return (
      <button
        key={`p${index}`}
        type="button"
        className="md-preview-chip path-preview-chip"
        data-testid="md-local-path-chip"
        title={part.value}
        onClick={() => onPreviewPath(part.value)}
      >
        {basenameOf(part.value)}
      </button>
    )
  })
}

export function linkifyLocalPathNodes(
  children: React.ReactNode,
  onPreviewPath?: (path: string) => void
): React.ReactNode {
  if (!onPreviewPath) return children
  if (typeof children === 'string' || typeof children === 'number') {
    return <LocalPathChips text={String(children)} onPreviewPath={onPreviewPath} />
  }
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <React.Fragment key={index}>{linkifyLocalPathNodes(child, onPreviewPath)}</React.Fragment>
    ))
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    const type = children.type
    const name = typeof type === 'string' ? type : undefined
    if (name && SKIP_LINKIFY.has(name)) return children
    if (children.props.children !== undefined) {
      return React.cloneElement(children, {
        children: linkifyLocalPathNodes(children.props.children, onPreviewPath)
      })
    }
  }
  return children
}
