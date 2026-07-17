import type { AgentPermissionMode } from './types'

/**
 * v0.9 contract: Remote and YOLO **may** coexist (station owner workable remote).
 * Opening YOLO while Remote is active requires PIN elevation (server-side), not a hard block.
 */

export const YOLO_ELEVATION_PIN_REQUIRED =
  '遠端遙控啟用中：開啟 YOLO（一律核准）前請再輸入一次 PIN。'

export const REMOTE_START_WHILE_YOLO_CONFIRM =
  '目前為 YOLO（一律核准）。啟用遠端遙控將讓已配對的手機在高權限下操作本機 Grok，請確認風險。'

export const YOLO_REMOTE_COEXIST_NOTICE =
  'YOLO 與遠端遙控可同時啟用（單人高風險）。開啟 YOLO 需 PIN；關閉 YOLO 不影響遙控連線。'

/** @deprecated kept for copy migration — no longer a hard block reason */
export const YOLO_BLOCKED_BY_REMOTE = YOLO_ELEVATION_PIN_REQUIRED

/** @deprecated v0.9: Remote may start while YOLO with desktop confirm */
export const REMOTE_BLOCKED_BY_YOLO = REMOTE_START_WHILE_YOLO_CONFIRM

export const PERMISSION_ASK_ALREADY_NOTICE =
  '目前已是「每次詢問」：工具操作前會先請你確認用途與風險，不會自動核准。'

export const PERMISSION_ASK_TOOLTIP =
  '工具權限模式（每次啟動重置為每次詢問）。每次詢問：工具執行前會顯示確認對話框。YOLO：一律自動核准（高風險）。遠端遙控啟用時可並用 YOLO，但開啟 YOLO 需再輸入 PIN。'

export type MutexDecision = { ok: true } | { ok: false; reason: string }

/**
 * Desktop/UI: enabling YOLO is always allowed at the mutex layer.
 * When Remote is active, caller must still collect PIN and call elevate API.
 */
export function canEnableYolo(remoteActive: boolean): MutexDecision {
  void remoteActive
  return { ok: true }
}

/** Whether PIN elevation is required before YOLO while Remote is on. */
export function requiresPinForYoloElevation(remoteActive: boolean): boolean {
  return remoteActive
}

/**
 * Starting Remote is allowed in ask or always-approve.
 * When already YOLO, UI should show REMOTE_START_WHILE_YOLO_CONFIRM once.
 */
export function canEnableRemote(permissionMode: AgentPermissionMode): MutexDecision {
  void permissionMode
  return { ok: true }
}

/** Desktop confirm recommended when enabling Remote while already YOLO. */
export function shouldConfirmRemoteStartWhileYolo(permissionMode: AgentPermissionMode): boolean {
  return permissionMode === 'always-approve'
}

/**
 * v0.9: coexistence is intentional — not a hard security conflict for gatekeeping.
 * Returns true only as a *status* flag (both on), never as "must refuse".
 */
export function isRemoteYoloCoactive(remoteActive: boolean, permissionMode: AgentPermissionMode): boolean {
  return remoteActive && permissionMode === 'always-approve'
}

/** @deprecated use isRemoteYoloCoactive — no longer means refuse */
export function isRemoteYoloConflict(remoteActive: boolean, permissionMode: AgentPermissionMode): boolean {
  return isRemoteYoloCoactive(remoteActive, permissionMode)
}
