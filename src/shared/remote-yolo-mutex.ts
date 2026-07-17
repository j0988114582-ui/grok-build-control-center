import type { AgentPermissionMode } from './types'

/** Chinese copy: Remote and YOLO must never run together (R-SEC-14b / X8). */
export const YOLO_BLOCKED_BY_REMOTE =
  '遠端遙控啟用中，無法開啟 YOLO。請先關閉手機遙控。'

export const REMOTE_BLOCKED_BY_YOLO =
  'YOLO（一律核准）啟用中，無法開啟遠端遙控。請先改回「每次詢問」。'

export const PERMISSION_ASK_ALREADY_NOTICE =
  '目前已是「每次詢問」：工具操作前會先請你確認用途與風險，不會自動核准。'

export const PERMISSION_ASK_TOOLTIP =
  '工具權限模式（每次啟動重置為每次詢問）。每次詢問：工具執行前會顯示確認對話框。YOLO：一律自動核准（高風險，不可與遠端遙控並用）。'

export type MutexDecision = { ok: true } | { ok: false; reason: string }

/** Enabling YOLO is forbidden while Remote control is active. */
export function canEnableYolo(remoteActive: boolean): MutexDecision {
  if (remoteActive) return { ok: false, reason: YOLO_BLOCKED_BY_REMOTE }
  return { ok: true }
}

/** Starting Remote is forbidden while desktop YOLO is active. */
export function canEnableRemote(permissionMode: AgentPermissionMode): MutexDecision {
  if (permissionMode === 'always-approve') return { ok: false, reason: REMOTE_BLOCKED_BY_YOLO }
  return { ok: true }
}

/** True when Remote and YOLO would be simultaneously active. */
export function isRemoteYoloConflict(remoteActive: boolean, permissionMode: AgentPermissionMode): boolean {
  return remoteActive && permissionMode === 'always-approve'
}
