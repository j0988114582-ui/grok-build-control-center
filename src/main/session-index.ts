import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { SessionSummary, SessionUsage } from '../shared/types'

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined
const number = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined

export function parseSessionSummary(value: unknown): SessionSummary | null {
  const source = record(value)
  const info = record(source?.info)
  const id = text(info?.id)
  const cwd = text(info?.cwd)
  if (!source || !id || !cwd) return null

  return {
    id,
    cwd,
    title: text(source.generated_title) ?? text(source.session_summary) ?? 'Untitled session',
    ...(text(source.current_model_id) ? { model: text(source.current_model_id) } : {}),
    ...(text(source.agent_name) ? { agentName: text(source.agent_name) } : {}),
    ...(text(source.current_mode_id) ? { mode: text(source.current_mode_id) } : {}),
    ...(text(source.created_at) ? { createdAt: text(source.created_at) } : {}),
    ...(text(source.updated_at) ? { updatedAt: text(source.updated_at) } : {}),
    ...(number(source.num_chat_messages) !== undefined ? { messageCount: number(source.num_chat_messages) } : {})
  }
}

async function findSummaries(directory: string, results: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return findSummaries(fullPath, results)
    if (entry.isFile() && entry.name === 'summary.json') results.push(fullPath)
  }))
}

export async function listLocalSessions(grokHome: string): Promise<SessionSummary[]> {
  const files: string[] = []
  await findSummaries(path.join(grokHome, 'sessions'), files)
  const summaries = await Promise.all(files.map(async (file) => {
    try {
      return parseSessionSummary(JSON.parse(await readFile(file, 'utf8')))
    } catch {
      return null
    }
  }))
  return summaries.filter((item): item is SessionSummary => item !== null)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export function parseSessionUsage(sessionId: string, value: unknown): SessionUsage {
  const source = record(value) ?? {}
  return {
    sessionId,
    ...(number(source.contextTokensUsed) !== undefined ? { contextTokensUsed: number(source.contextTokensUsed) } : {}),
    ...(number(source.contextWindowTokens) !== undefined ? { contextWindowTokens: number(source.contextWindowTokens) } : {}),
    ...(number(source.contextWindowUsage) !== undefined ? { contextWindowUsage: number(source.contextWindowUsage) } : {}),
    ...(number(source.turnCount) !== undefined ? { turnCount: number(source.turnCount) } : {}),
    ...(number(source.toolCallCount) !== undefined ? { toolCallCount: number(source.toolCallCount) } : {}),
    ...(number(source.compactionCount) !== undefined ? { compactionCount: number(source.compactionCount) } : {})
  }
}

async function findSessionDir(grokHome: string, sessionId: string): Promise<string | null> {
  const sessionsRoot = path.join(grokHome, 'sessions')
  let groups
  try {
    groups = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return null
  }
  for (const group of groups) {
    if (!group.isDirectory()) continue
    const candidate = path.join(sessionsRoot, group.name, sessionId)
    try {
      if ((await stat(candidate)).isDirectory()) return candidate
    } catch {
      continue
    }
  }
  return null
}

export async function readSessionUsage(grokHome: string, sessionId: string): Promise<SessionUsage | null> {
  const directory = await findSessionDir(grokHome, sessionId)
  if (!directory) return null
  try {
    return parseSessionUsage(sessionId, JSON.parse(await readFile(path.join(directory, 'signals.json'), 'utf8')))
  } catch {
    return { sessionId }
  }
}
