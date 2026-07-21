export type StarDensity = 'low' | 'medium' | 'high'
export type StarfieldActivity = 'launch' | 'idle' | 'running' | 'error' | 'connect'
export type StarTheme = 'dark' | 'light'

export type MotionProfile = {
  speed: number
  stretch: number
  flash: number
  redshift: number
}

export const densityToStarCount = (density: StarDensity): number =>
  density === 'low' ? 600 : density === 'high' ? 1500 : 1000

/**
 * Obsidian Voyage motion language: launch is a dark warp reveal (no white wash);
 * `flash` is reserved for the low, champagne-gold connect ripple only.
 */
export function motionProfile(activity: StarfieldActivity): MotionProfile {
  switch (activity) {
    case 'launch': return { speed: 5.5, stretch: 1, flash: 0, redshift: 0 }
    case 'running': return { speed: 2.3, stretch: 0.72, flash: 0, redshift: 0 }
    case 'error': return { speed: 0.45, stretch: 0.18, flash: 0.1, redshift: 1 }
    case 'connect': return { speed: 3.7, stretch: 0.82, flash: 0.32, redshift: 0 }
    default: return { speed: 0.16, stretch: 0.03, flash: 0, redshift: 0 }
  }
}

export const shouldRenderStatic = (settingReducedMotion: boolean, operatingSystemReducedMotion: boolean): boolean =>
  settingReducedMotion || operatingSystemReducedMotion

export type StarfieldHealth = {
  renderer: 'webgl' | 'canvas2d' | 'none'
  frames: number
  lastFrameAt: number
  contextLostAt: number | null
}

export type StarfieldEngine = {
  readonly renderer: 'webgl' | 'canvas2d' | 'none'
  setActivity(activity: Exclude<StarfieldActivity, 'error' | 'connect'>): void
  pulse(activity: 'error' | 'connect'): void
  /** True while frames are expected to keep flowing (watchdog contract). */
  shouldBeAnimating(): boolean
  getHealth(): StarfieldHealth
  /** Re-arm the frame loop after a stall; returns false when a full rebuild is needed. */
  revive(): boolean
  destroy(): void
}

type EngineOptions = {
  density: StarDensity
  static: boolean
  theme?: StarTheme
  /** Escape hatch for GPUs that keep losing WebGL on resize — 2d canvas cannot context-lose. */
  forceCanvas2d?: boolean
}

type Programs = {
  fog: WebGLProgram
  stars: WebGLProgram
  quad: WebGLBuffer
  positions: WebGLBuffer
  layers: WebGLBuffer
}

type CanvasStar = { x: number; y: number; z: number; layer: number; size: number }

type Rgb = [number, number, number]

/**
 * Palette per theme — dark is "Obsidian Voyage", light is "Dawn Nebula" (phase 4).
 *
 * Dawn is not an inversion of obsidian. The fog shader is purely additive, so the
 * light palette starts from a warm-white mist floor and *adds* a champagne bloom
 * and a cool sky patch — it can never reach pure white, which is what keeps the
 * bright theme from glaring. Stars flip to alpha-over blending so pale dust can
 * darken the cream instead of burning it out.
 */
type Palette = {
  deep: Rgb
  ice: Rgb
  gold: Rgb
  red: Rgb
  flash: Rgb
  starIce: Rgb
  starGold: Rgb
  /** Star tint at full redshift (error pulse). */
  starRed: Rgb
  /** Colour the warp reveal eases *out of*: black on obsidian, dawn mist on light. */
  revealBase: Rgb
  /** Obsidian burns stars additively; dawn alpha-blends so dark dust reads on cream. */
  starBlend: 'add' | 'over'
  /** Global star opacity multiplier (1 keeps the obsidian look byte-identical). */
  starAlpha: number
  /** canvas2d fallback colours in 0–255 space (context-loss demotion path). */
  fallback: {
    composite: 'lighter' | 'source-over'
    fogInner: Rgb
    /** Added to fogInner at redshift 1. */
    fogInnerShift: Rgb
    fogInnerAlpha: number
    fogMid: string
    fogOuter: string
    starIce: Rgb
    starGold: Rgb
    starRed: Rgb
    starAlphaCap: number
    flash: Rgb
    flashAlphaCap: number
  }
}

const PALETTES: Record<StarTheme, Palette> = {
  dark: {
    deep: [0.006, 0.013, 0.038],
    ice: [0.05, 0.19, 0.36],
    gold: [0.30, 0.20, 0.07],
    red: [0.30, 0.02, 0.02],
    flash: [0.20, 0.15, 0.06],
    starIce: [0.64, 0.83, 1.0],
    starGold: [1.0, 0.85, 0.55],
    starRed: [1.0, 0.30, 0.20],
    revealBase: [0, 0, 0],
    starBlend: 'add',
    starAlpha: 1,
    fallback: {
      composite: 'lighter',
      fogInner: [14, 40, 78],
      fogInnerShift: [75, 0, 0],
      fogInnerAlpha: 0.72,
      fogMid: 'rgba(6,16,40,.96)',
      fogOuter: 'rgba(2,5,16,1)',
      starIce: [160, 215, 255],
      starGold: [255, 214, 150],
      starRed: [255, 92, 72],
      starAlphaCap: 0.9,
      flash: [233, 199, 130],
      flashAlphaCap: 0.2
    }
  },
  light: {
    // #e5e2db mist floor: the darkest pixel on screen, so panels always read as lifted.
    deep: [0.898, 0.886, 0.859],
    // Additive bands top out around #f1ede5 at the vignette centre — never white.
    ice: [0.03, 0.055, 0.10],
    gold: [0.24, 0.17, 0.06],
    red: [0.075, 0.005, 0.012],
    flash: [0.09, 0.07, 0.03],
    starIce: [0.17, 0.24, 0.35],
    starGold: [0.42, 0.30, 0.11],
    starRed: [0.62, 0.16, 0.13],
    revealBase: [0.878, 0.867, 0.843],
    starBlend: 'over',
    starAlpha: 0.42,
    fallback: {
      composite: 'source-over',
      fogInner: [246, 240, 230],
      fogInnerShift: [6, -18, -26],
      fogInnerAlpha: 0.96,
      fogMid: 'rgba(238,234,225,.98)',
      fogOuter: 'rgba(226,223,214,1)',
      starIce: [58, 80, 112],
      starGold: [122, 88, 32],
      starRed: [176, 60, 48],
      starAlphaCap: 0.34,
      flash: [233, 205, 150],
      flashAlphaCap: 0.12
    }
  }
}

const FOG_VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FOG_FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_flash;
uniform float u_redshift;
uniform float u_reveal;
uniform vec3 u_deep;
uniform vec3 u_ice;
uniform vec3 u_gold;
uniform vec3 u_red;
uniform vec3 u_flashColor;
uniform vec3 u_revealBase;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.,0.)), f.x), mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
}
float fbm(vec2 p) {
  return noise(p) * .62 + noise(p * 2.13 + 11.7) * .38;
}
void main() {
  vec2 p = v_uv - .5;
  float vignette = 1.0 - smoothstep(.16, .92, length(p));
  float iceBand = fbm(v_uv * 3.1 + vec2(u_time * .0035, -u_time * .0018));
  float goldBand = fbm(v_uv * 2.2 + vec2(-u_time * .0021, u_time * .0012) + 7.31);
  vec3 ice = u_ice * pow(max(0.0, iceBand - .44), 2.1) * vignette;
  vec3 gold = u_gold * pow(max(0.0, goldBand - .55), 2.4) * vignette * 1.15;
  vec3 red = u_red * u_redshift * vignette;
  vec3 color = u_deep + ice + gold + red + u_flash * u_flashColor;
  // Obsidian reveals out of black (u_revealBase 0 → identical to color * u_reveal);
  // dawn reveals out of its own mist so a frozen launch frame is never a dark flash.
  gl_FragColor = vec4(mix(u_revealBase, color, u_reveal), .97);
}`

const STAR_VERTEX = `
attribute vec3 a_star;
attribute float a_layer;
uniform float u_time;
uniform float u_speed;
uniform float u_stretch;
uniform float u_aspect;
uniform float u_reveal;
varying float v_alpha;
varying float v_stretch;
varying float v_gold;
void main() {
  float layer = min(a_layer, 4.0);
  float meteor = step(4.5, a_layer);
  float rate = .016 + layer * .008;
  float z = fract(a_star.z - u_time * .001 * u_speed * rate);
  float meteorZ = fract(a_star.z - u_time * .00135);
  z = max(.035, mix(z, meteorZ, meteor));
  vec2 projected = a_star.xy / z;
  projected.x /= u_aspect;
  gl_Position = vec4(projected, 0., 1.);
  float size = (1.1 + layer * .7) / z + u_stretch * 6.;
  gl_PointSize = min(17., size * mix(1., 1.5, meteor));
  float gate = mix(1., step(fract(a_star.z * 7.31 + u_time * .000021), .045), meteor);
  v_alpha = (1.0 - smoothstep(.07, 1.0, z)) * (.4 + layer * .16) * gate * u_reveal;
  v_stretch = max(u_stretch, meteor * .85);
  v_gold = step(.93, fract(a_star.x * 137.7)) * (1.0 - meteor);
}`

const STAR_FRAGMENT = `
precision mediump float;
varying float v_alpha;
varying float v_stretch;
varying float v_gold;
uniform float u_redshift;
uniform float u_starAlpha;
uniform vec3 u_starIce;
uniform vec3 u_starGold;
uniform vec3 u_starRed;
void main() {
  vec2 p = gl_PointCoord - .5;
  p.y *= mix(1., .16, v_stretch);
  float glow = 1.0 - smoothstep(.02, .5, length(p));
  if (glow <= .02) discard;
  vec3 color = mix(u_starIce, u_starGold, v_gold);
  color = mix(color, u_starRed, u_redshift);
  gl_FragColor = vec4(color, glow * v_alpha * u_starAlpha);
}`

const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to allocate starfield shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile failure'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

const createProgram = (gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram => {
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to allocate starfield program')
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertex)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragment)
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Starfield link failure')
  return program
}

const seededRandom = (seed: number): (() => number) => () => {
  seed |= 0
  seed = seed + 0x6D2B79F5 | 0
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
  return ((value ^ value >>> 14) >>> 0) / 4294967296
}

const TIME_WRAP_MS = 36_000_000
/** Warp arrival: brightness eases 0→1 over this window — worst frozen frame is dark, never a wash. */
const REVEAL_MS = 1_800
const METEOR_COUNT = 8

class GalaxyEngine implements StarfieldEngine {
  renderer: 'webgl' | 'canvas2d' | 'none'
  private readonly gl: WebGLRenderingContext | null
  private readonly context2d: CanvasRenderingContext2D | null
  private programs: Programs | null
  private readonly canvasStars: CanvasStar[]
  private readonly palette: Palette
  private frame = 0
  private frames = 0
  private lastFrameAt = 0
  private contextLostAt: number | null = null
  private readonly createdAt: number
  private activity: Exclude<StarfieldActivity, 'error' | 'connect'> = 'idle'
  private pulseActivity: 'error' | 'connect' | null = null
  private pulseUntil = 0
  private current = motionProfile('idle')
  private destroyed = false
  private resizeObserver?: ResizeObserver
  private readonly onWindowResize = (): void => { this.resize({ kick: true }) }
  private readonly onRoResize = (): void => { this.resize({ kick: true }) }

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: EngineOptions) {
    this.palette = PALETTES[options.theme ?? 'dark']
    this.createdAt = performance.now()
    let gl: WebGLRenderingContext | null = null
    if (!options.forceCanvas2d) {
      try {
        gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
      } catch { gl = null }
    }
    this.gl = gl
    let context2d: CanvasRenderingContext2D | null = null
    if (!gl) {
      try { context2d = canvas.getContext('2d', { alpha: true }) } catch { context2d = null }
    }
    this.context2d = context2d
    this.programs = gl ? this.initializeWebGl(gl) : null
    this.renderer = this.programs ? 'webgl' : context2d ? 'canvas2d' : 'none'
    this.canvasStars = this.createCanvasStars(densityToStarCount(options.density))
    this.onVisibility = this.onVisibility.bind(this)
    this.onContextLost = this.onContextLost.bind(this)
    this.onContextRestored = this.onContextRestored.bind(this)
    // Constructor size only — sync render follows; do not double-schedule RAF.
    this.resize({ kick: false })
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onRoResize)
      this.resizeObserver.observe(canvas)
    } else window.addEventListener('resize', this.onWindowResize)
    document.addEventListener('visibilitychange', this.onVisibility)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    if (this.renderer !== 'none') this.render(performance.now())
  }

  setActivity(activity: Exclude<StarfieldActivity, 'error' | 'connect'>): void {
    this.activity = activity
  }

  pulse(activity: 'error' | 'connect'): void {
    this.pulseActivity = activity
    this.pulseUntil = performance.now() + (activity === 'error' ? 760 : 900)
    if (!this.options.static && !this.frame && !document.hidden && this.renderer !== 'none') this.frame = requestAnimationFrame((time) => this.render(time))
  }

  shouldBeAnimating(): boolean {
    return !this.destroyed && !this.options.static && this.renderer !== 'none' && !document.hidden
  }

  getHealth(): StarfieldHealth {
    return { renderer: this.renderer, frames: this.frames, lastFrameAt: this.lastFrameAt, contextLostAt: this.contextLostAt }
  }

  revive(): boolean {
    if (this.destroyed) return false
    // Context lost and never restored → caller must rebuild the whole engine.
    if (this.contextLostAt !== null && performance.now() - this.contextLostAt > 3_000) return false
    if (this.renderer === 'none') return false
    if (this.options.static) {
      this.render(performance.now())
      return true
    }
    if (!this.frame && !document.hidden) this.frame = requestAnimationFrame((time) => this.render(time))
    return true
  }

  destroy(): void {
    this.destroyed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.onWindowResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    if (this.gl && this.programs) {
      this.gl.deleteProgram(this.programs.fog)
      this.gl.deleteProgram(this.programs.stars)
      this.gl.deleteBuffer(this.programs.quad)
      this.gl.deleteBuffer(this.programs.positions)
      this.gl.deleteBuffer(this.programs.layers)
    }
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
  }

  private onContextLost(event: Event): void {
    event.preventDefault()
    this.contextLostAt = performance.now()
    // A lost-context canvas can composite as garbage (white) on some Windows
    // drivers — hide it so the CSS fallback starfield shows instead.
    this.canvas.style.opacity = '0'
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0 }
  }

  private onContextRestored(): void {
    if (this.destroyed || !this.gl) return
    this.contextLostAt = null
    this.programs = this.initializeWebGl(this.gl)
    if (!this.programs) {
      this.renderer = 'none'
      return
    }
    this.renderer = 'webgl'
    this.resize({ kick: false })
    if (this.options.static) this.render(performance.now())
    else if (!document.hidden && !this.frame) this.frame = requestAnimationFrame((time) => this.render(time))
  }

  private onVisibility(): void {
    if (document.hidden && this.frame) { cancelAnimationFrame(this.frame); this.frame = 0 }
    else if (!document.hidden && !this.options.static && !this.destroyed && this.renderer !== 'none' && !this.frame) this.frame = requestAnimationFrame((time) => this.render(time))
  }

  private resize(options?: { kick?: boolean }): void {
    // Prefer real layout; fall back to window only when canvas still has no box (cold start).
    const layoutW = this.canvas.clientWidth
    const layoutH = this.canvas.clientHeight
    const cssW = layoutW > 0 ? layoutW : (window.innerWidth || 1)
    const cssH = layoutH > 0 ? layoutH : (window.innerHeight || 1)
    const ratio = Math.min(1.5, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.floor(cssW * ratio))
    const height = Math.max(1, Math.floor(cssH * ratio))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      // kick:true when ResizeObserver/window resize fires after a tiny cold buffer.
      if (options?.kick && !this.destroyed && this.renderer !== 'none') {
        if (this.options.static) this.render(performance.now())
        else if (!this.frame && !document.hidden) this.frame = requestAnimationFrame((time) => this.render(time))
      }
    }
  }

  private initializeWebGl(gl: WebGLRenderingContext): Programs | null {
    try {
      const fog = createProgram(gl, FOG_VERTEX, FOG_FRAGMENT)
      const stars = createProgram(gl, STAR_VERTEX, STAR_FRAGMENT)
      const quad = gl.createBuffer()
      const positions = gl.createBuffer()
      const layers = gl.createBuffer()
      if (!quad || !positions || !layers) throw new Error('Unable to allocate starfield buffers')
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
      const random = seededRandom(0x47524f4b)
      const count = densityToStarCount(this.options.density)
      const positionData = new Float32Array(count * 3)
      const layerData = new Float32Array(count)
      for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2
        const radius = Math.pow(random(), .62) * 1.35 + .035
        positionData[index * 3] = Math.cos(angle) * radius
        positionData[index * 3 + 1] = Math.sin(angle) * radius
        positionData[index * 3 + 2] = random()
        // Layers 0–4 parallax depth; the tail of the buffer becomes rare meteors (layer 5).
        layerData[index] = index >= count - METEOR_COUNT ? 5 : index % 5
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, positions)
      gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, layers)
      gl.bufferData(gl.ARRAY_BUFFER, layerData, gl.STATIC_DRAW)
      return { fog, stars, quad, positions, layers }
    } catch {
      return null
    }
  }

  private createCanvasStars(count: number): CanvasStar[] {
    const random = seededRandom(0x47524f4b)
    return Array.from({ length: count }, (_value, index) => ({
      x: random() * 2 - 1,
      y: random() * 2 - 1,
      z: Math.max(.02, random()),
      layer: index % 5,
      size: .55 + random() * 1.5
    }))
  }

  private reveal(time: number): number {
    if (this.options.static) return 1
    const t = Math.min(1, Math.max(0, (time - this.createdAt) / REVEAL_MS))
    return t * t * (3 - 2 * t)
  }

  private render(time: number): void {
    this.frame = 0
    if (this.destroyed || document.hidden || this.renderer === 'none') return
    // Some drivers lose the context on resize without firing the event — probe it.
    if (this.gl && this.gl.isContextLost()) {
      if (this.contextLostAt === null) this.contextLostAt = performance.now()
      this.canvas.style.opacity = '0'
      return
    }
    if (this.contextLostAt === null && this.canvas.style.opacity === '0') this.canvas.style.opacity = '1'
    const pulse = this.pulseActivity && time < this.pulseUntil ? this.pulseActivity : null
    if (!pulse) this.pulseActivity = null
    const target = motionProfile(pulse ?? this.activity)
    const follow = this.options.static ? 1 : .075
    this.current = {
      speed: this.current.speed + (target.speed - this.current.speed) * follow,
      stretch: this.current.stretch + (target.stretch - this.current.stretch) * follow,
      flash: this.current.flash + (target.flash - this.current.flash) * follow,
      redshift: this.current.redshift + (target.redshift - this.current.redshift) * follow
    }
    const wrapped = time % TIME_WRAP_MS
    if (this.gl && this.programs) this.renderWebGl(wrapped, this.reveal(time))
    else if (this.context2d) this.renderCanvas2d(wrapped, this.reveal(time))
    this.frames += 1
    this.lastFrameAt = time
    if (!this.options.static) this.frame = requestAnimationFrame((next) => this.render(next))
  }

  private renderWebGl(time: number, reveal: number): void {
    const gl = this.gl!
    const programs = this.programs!
    const palette = this.palette
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(programs.fog)
    gl.bindBuffer(gl.ARRAY_BUFFER, programs.quad)
    const fogPosition = gl.getAttribLocation(programs.fog, 'a_position')
    gl.enableVertexAttribArray(fogPosition)
    gl.vertexAttribPointer(fogPosition, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1f(gl.getUniformLocation(programs.fog, 'u_time'), time * .001)
    gl.uniform1f(gl.getUniformLocation(programs.fog, 'u_flash'), this.current.flash)
    gl.uniform1f(gl.getUniformLocation(programs.fog, 'u_redshift'), this.current.redshift)
    gl.uniform1f(gl.getUniformLocation(programs.fog, 'u_reveal'), reveal)
    gl.uniform3fv(gl.getUniformLocation(programs.fog, 'u_deep'), palette.deep)
    gl.uniform3fv(gl.getUniformLocation(programs.fog, 'u_ice'), palette.ice)
    gl.uniform3fv(gl.getUniformLocation(programs.fog, 'u_gold'), palette.gold)
    gl.uniform3fv(gl.getUniformLocation(programs.fog, 'u_red'), palette.red)
    gl.uniform3fv(gl.getUniformLocation(programs.fog, 'u_flashColor'), palette.flash)
    gl.uniform3fv(gl.getUniformLocation(programs.fog, 'u_revealBase'), palette.revealBase)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.enable(gl.BLEND)
    // Additive burns bright dust into obsidian; dawn needs alpha-over so slate/gold
    // dust can sit *on top of* the cream mist instead of being clipped to white.
    const destinationFactor = palette.starBlend === 'over' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE
    gl.blendFunc(gl.SRC_ALPHA, destinationFactor)
    gl.useProgram(programs.stars)
    gl.bindBuffer(gl.ARRAY_BUFFER, programs.positions)
    const starPosition = gl.getAttribLocation(programs.stars, 'a_star')
    gl.enableVertexAttribArray(starPosition)
    gl.vertexAttribPointer(starPosition, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, programs.layers)
    const starLayer = gl.getAttribLocation(programs.stars, 'a_layer')
    gl.enableVertexAttribArray(starLayer)
    gl.vertexAttribPointer(starLayer, 1, gl.FLOAT, false, 0, 0)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_time'), time)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_speed'), this.current.speed)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_stretch'), this.current.stretch)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_redshift'), this.current.redshift)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_aspect'), this.canvas.width / this.canvas.height)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_reveal'), reveal)
    gl.uniform1f(gl.getUniformLocation(programs.stars, 'u_starAlpha'), palette.starAlpha)
    gl.uniform3fv(gl.getUniformLocation(programs.stars, 'u_starIce'), palette.starIce)
    gl.uniform3fv(gl.getUniformLocation(programs.stars, 'u_starGold'), palette.starGold)
    gl.uniform3fv(gl.getUniformLocation(programs.stars, 'u_starRed'), palette.starRed)
    gl.drawArrays(gl.POINTS, 0, densityToStarCount(this.options.density))
    gl.disable(gl.BLEND)
  }

  private renderCanvas2d(time: number, reveal: number): void {
    const context = this.context2d!
    const fallback = this.palette.fallback
    const width = this.canvas.width
    const height = this.canvas.height
    const centerX = width / 2
    const centerY = height / 2
    const shift = (index: 0 | 1 | 2): number =>
      Math.max(0, Math.min(255, Math.round(fallback.fogInner[index] + fallback.fogInnerShift[index] * this.current.redshift)))
    const fog = context.createRadialGradient(centerX * .58, centerY * .42, 0, centerX, centerY, Math.max(width, height) * .72)
    fog.addColorStop(0, `rgba(${shift(0)},${shift(1)},${shift(2)},${fallback.fogInnerAlpha})`)
    fog.addColorStop(.48, fallback.fogMid)
    fog.addColorStop(1, fallback.fogOuter)
    context.fillStyle = fog
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = fallback.composite
    context.globalAlpha = reveal
    for (const star of this.canvasStars) {
      const z = Math.max(.035, ((star.z - time * .00000032 * this.current.speed * (1 + star.layer * .35)) % 1 + 1) % 1)
      const x = centerX + star.x * width * .52 / z
      const y = centerY + star.y * height * .52 / z
      if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue
      const alpha = Math.min(fallback.starAlphaCap, (.2 + star.layer * .12) * (1 - z))
      const gold = (star.x * 137.7) % 1 > .93
      const tint = this.current.redshift > .35 ? fallback.starRed : gold ? fallback.starGold : fallback.starIce
      context.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${alpha})`
      context.lineWidth = Math.min(3, star.size / z)
      context.beginPath()
      context.moveTo(x, y)
      const streak = 1 + this.current.stretch * 28 / z
      context.lineTo(x + (x - centerX) * .002 * streak, y + (y - centerY) * .002 * streak)
      context.stroke()
    }
    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-over'
    if (this.current.flash > .01) {
      const veil = Math.min(fallback.flashAlphaCap, this.current.flash * .3)
      context.fillStyle = `rgba(${fallback.flash[0]},${fallback.flash[1]},${fallback.flash[2]},${veil})`
      context.fillRect(0, 0, width, height)
    }
  }
}

export const createStarfield = (canvas: HTMLCanvasElement, options: EngineOptions): StarfieldEngine =>
  new GalaxyEngine(canvas, options)
