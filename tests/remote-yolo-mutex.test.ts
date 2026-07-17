import { describe, expect, it } from 'vitest'
import {
  canEnableRemote,
  canEnableYolo,
  isRemoteYoloCoactive,
  isRemoteYoloConflict,
  PERMISSION_ASK_ALREADY_NOTICE,
  requiresPinForYoloElevation,
  shouldConfirmRemoteStartWhileYolo,
  YOLO_ELEVATION_PIN_REQUIRED
} from '../src/shared/remote-yolo-mutex'

describe('remote ↔ YOLO coexistence (v0.9)', () => {
  it('allows YOLO while Remote is active at mutex layer', () => {
    expect(canEnableYolo(true)).toEqual({ ok: true })
    expect(canEnableYolo(false)).toEqual({ ok: true })
  })

  it('allows Remote while YOLO is active at mutex layer', () => {
    expect(canEnableRemote('always-approve')).toEqual({ ok: true })
    expect(canEnableRemote('ask')).toEqual({ ok: true })
  })

  it('requires PIN elevation only when Remote is active', () => {
    expect(requiresPinForYoloElevation(true)).toBe(true)
    expect(requiresPinForYoloElevation(false)).toBe(false)
    expect(YOLO_ELEVATION_PIN_REQUIRED).toMatch(/PIN/)
  })

  it('flags coactive status without hard refuse', () => {
    expect(isRemoteYoloCoactive(true, 'always-approve')).toBe(true)
    expect(isRemoteYoloCoactive(true, 'ask')).toBe(false)
    // deprecated alias still reports status
    expect(isRemoteYoloConflict(true, 'always-approve')).toBe(true)
  })

  it('recommends desktop confirm when starting Remote under YOLO', () => {
    expect(shouldConfirmRemoteStartWhileYolo('always-approve')).toBe(true)
    expect(shouldConfirmRemoteStartWhileYolo('ask')).toBe(false)
  })

  it('exposes Chinese already-ask notice', () => {
    expect(PERMISSION_ASK_ALREADY_NOTICE).toMatch(/每次詢問/)
  })
})
