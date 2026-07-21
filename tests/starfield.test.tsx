// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarfield, densityToStarCount, motionProfile, shouldRenderStatic } from '../src/renderer/src/fx/starfield'

describe('starfield performance contract', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('maps density settings to bounded particle budgets', () => {
    expect(densityToStarCount('low')).toBe(600)
    expect(densityToStarCount('medium')).toBe(1000)
    expect(densityToStarCount('high')).toBe(1500)
  })

  it('uses a dark warp launch (no wash flash) before settling into readable motion', () => {
    // v0.10 Obsidian Voyage: launch must NOT flash — a frozen launch frame stays dark.
    expect(motionProfile('launch')).toEqual({ speed: 5.5, stretch: 1, flash: 0, redshift: 0 })
    expect(motionProfile('idle')).toEqual({ speed: 0.16, stretch: 0.03, flash: 0, redshift: 0 })
    expect(motionProfile('running').flash).toBe(0)
    expect(motionProfile('connect').flash).toBeLessThanOrEqual(0.35)
    expect(motionProfile('running').speed).toBeGreaterThan(motionProfile('idle').speed)
    expect(motionProfile('error').redshift).toBe(1)
  })

  it('renders one static frame for OS or in-app reduced motion', () => {
    expect(shouldRenderStatic(true, false)).toBe(true)
    expect(shouldRenderStatic(false, true)).toBe(true)
    expect(shouldRenderStatic(false, false)).toBe(false)
  })

  it('stops animation when WebGL initialization fails after context restore', () => {
    let programCount = 0
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      ARRAY_BUFFER: 5,
      STATIC_DRAW: 6,
      FLOAT: 7,
      DEPTH_TEST: 8,
      TRIANGLES: 9,
      BLEND: 10,
      SRC_ALPHA: 11,
      ONE: 12,
      POINTS: 13,
      createProgram: vi.fn(() => ++programCount <= 2 ? {} : null),
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      deleteShader: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getProgramInfoLog: vi.fn(() => ''),
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      viewport: vi.fn(),
      disable: vi.fn(),
      useProgram: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      getUniformLocation: vi.fn(() => ({})),
      uniform1f: vi.fn(),
      uniform3fv: vi.fn(),
      drawArrays: vi.fn(),
      enable: vi.fn(),
      blendFunc: vi.fn(),
      deleteProgram: vi.fn(),
      deleteBuffer: vi.fn(),
      getExtension: vi.fn(() => null)
    } as unknown as WebGLRenderingContext
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn((type: string) => type === 'webgl' ? gl : null) as typeof canvas.getContext
    const requestFrame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const engine = createStarfield(canvas, { density: 'low', static: false })
    expect(engine.renderer).toBe('webgl')
    expect(requestFrame).toHaveBeenCalledTimes(1)

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))

    expect(engine.renderer).toBe('none')
    expect(requestFrame).toHaveBeenCalledTimes(1)
    engine.destroy()
  })
})
