import { describe, expect, it } from 'vitest'
import {
  canEnableRemote,
  canEnableYolo,
  isRemoteYoloConflict,
  PERMISSION_ASK_ALREADY_NOTICE,
  REMOTE_BLOCKED_BY_YOLO,
  YOLO_BLOCKED_BY_REMOTE
} from '../src/shared/remote-yolo-mutex'

describe('remote ↔ YOLO mutex (R-SEC-14b)', () => {
  it('blocks YOLO while Remote is active', () => {
    expect(canEnableYolo(true)).toEqual({ ok: false, reason: YOLO_BLOCKED_BY_REMOTE })
    expect(canEnableYolo(false)).toEqual({ ok: true })
  })

  it('blocks Remote while YOLO is active', () => {
    expect(canEnableRemote('always-approve')).toEqual({ ok: false, reason: REMOTE_BLOCKED_BY_YOLO })
    expect(canEnableRemote('ask')).toEqual({ ok: true })
  })

  it('detects simultaneous conflict', () => {
    expect(isRemoteYoloConflict(true, 'always-approve')).toBe(true)
    expect(isRemoteYoloConflict(true, 'ask')).toBe(false)
    expect(isRemoteYoloConflict(false, 'always-approve')).toBe(false)
  })

  it('exposes Chinese copy for already-ask notice', () => {
    expect(PERMISSION_ASK_ALREADY_NOTICE).toMatch(/每次詢問/)
    expect(PERMISSION_ASK_ALREADY_NOTICE).toMatch(/不會自動核准/)
  })
})
