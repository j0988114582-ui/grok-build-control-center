export type StarDensity = 'low' | 'medium' | 'high'
export type StarfieldActivity = 'launch' | 'idle' | 'running' | 'error' | 'connect'

export type MotionProfile = {
  speed: number
  stretch: number
  flash: number
  redshift: number
}

export const densityToStarCount = (density: StarDensity): number =>
  density === 'low' ? 600 : density === 'high' ? 1500 : 1000

export function motionProfile(activity: StarfieldActivity): MotionProfile {
  switch (activity) {
    case 'launch': return { speed: 5.5, stretch: 1, flash: 0.9, redshift: 0 }
    case 'running': return { speed: 2.3, stretch: 0.72, flash: 0.08, redshift: 0 }
    case 'error': return { speed: 0.45, stretch: 0.18, flash: 0.22, redshift: 1 }
    case 'connect': return { speed: 3.7, stretch: 0.82, flash: 1, redshift: 0 }
    default: return { speed: 0.16, stretch: 0.03, flash: 0, redshift: 0 }
  }
}

export const shouldRenderStatic = (settingReducedMotion: boolean, operatingSystemReducedMotion: boolean): boolean =>
  settingReducedMotion || operatingSystemReducedMotion

export type StarfieldEngine = {
  readonly renderer: 'webgl' | 'canvas2d' | 'none'
  setActivity(activity: Exclude<StarfieldActivity, 'error' | 'connect'>): void
  pulse(activity: 'error' | 'connect'): void
  destroy(): void
}

type EngineOptions = {
  density: StarDensity
  static: boolean
}

type Programs = {
  fog: WebGLProgram
  stars: WebGLProgram
  quad: WebGLBuffer
  positions: WebGLBuffer
  layers: WebGLBuffer
}

type CanvasStar = { x: number; y: number; z: number; layer: number; size: number }

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
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.,0.)), f.x), mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
}
void main() {
  vec2 p = v_uv - .5;
  float vignette = 1.0 - smoothstep(.12, .84, length(p));
  float nebula = noise(v_uv * 3.4 + vec2(u_time * .004, -u_time * .002));
  nebula = pow(max(0.0, nebula - .42), 2.2);
  vec3 deep = vec3(.012, .022, .055);
  vec3 ice = vec3(.07, .24, .39) * nebula * vignette;
  vec3 amber = vec3(.36, .18, .035) * nebula * .22;
  vec3 red = vec3(.32, .025, .02) * u_redshift * vignette;
  gl_FragColor = vec4(deep + ice + amber + red + u_flash * vec3(.32,.48,.62), .96);
}`

const STAR_VERTEX = `
attribute vec3 a_star;
attribute float a_layer;
uniform float u_time;
uniform float u_speed;
uniform float u_stretch;
uniform float u_aspect;
varying float v_alpha;
varying float v_stretch;
void main() {
  float rate = .018 + a_layer * .009;
  float z = fract(a_star.z - u_time * .001 * u_speed * rate);
  z = max(.035, z);
  vec2 projected = a_star.xy / z;
  projected.x /= u_aspect;
  gl_Position = vec4(projected, 0., 1.);
  gl_PointSize = min(17., (1.2 + a_layer * .8) / z + u_stretch * 6.);
  v_alpha = (1.0 - smoothstep(.08, 1.0, z)) * (.45 + a_layer * .22);
  v_stretch = u_stretch;
}`

const STAR_FRAGMENT = `
precision mediump float;
varying float v_alpha;
varying float v_stretch;
uniform float u_redshift;
void main() {
  vec2 p = gl_PointCoord - .5;
  p.y *= mix(1., .17, v_stretch);
  float glow = 1.0 - smoothstep(.02, .5, length(p));
  if (glow <= .02) discard;
  vec3 ice = mix(vec3(.62,.82,1.), vec3(1.,.28,.18), u_redshift);
  gl_FragColor = vec4(ice, glow * v_alpha);
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

class GalaxyEngine implements StarfieldEngine {
  renderer: 'webgl' | 'canvas2d' | 'none'
  private readonly gl: WebGLRenderingContext | null
  private readonly context2d: CanvasRenderingContext2D | null
  private programs: Programs | null
  private readonly canvasStars: CanvasStar[]
  private frame = 0
  private activity: Exclude<StarfieldActivity, 'error' | 'connect'> = 'idle'
  private pulseActivity: 'error' | 'connect' | null = null
  private pulseUntil = 0
  private current = motionProfile('idle')
  private destroyed = false
  private resizeObserver?: ResizeObserver

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: EngineOptions) {
    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    } catch { gl = null }
    this.gl = gl
    let context2d: CanvasRenderingContext2D | null = null
    if (!gl) {
      try { context2d = canvas.getContext('2d', { alpha: true }) } catch { context2d = null }
    }
    this.context2d = context2d
    this.programs = gl ? this.initializeWebGl(gl) : null
    this.renderer = this.programs ? 'webgl' : context2d ? 'canvas2d' : 'none'
    this.canvasStars = this.createCanvasStars(densityToStarCount(options.density))
    this.resize = this.resize.bind(this)
    this.onVisibility = this.onVisibility.bind(this)
    this.onContextLost = this.onContextLost.bind(this)
    this.onContextRestored = this.onContextRestored.bind(this)
    this.resize()
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resize)
      this.resizeObserver.observe(canvas)
    } else window.addEventListener('resize', this.resize)
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

  destroy(): void {
    this.destroyed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.resize)
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
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0 }
  }

  private onContextRestored(): void {
    if (this.destroyed || !this.gl) return
    this.programs = this.initializeWebGl(this.gl)
    if (!this.programs) {
      this.renderer = 'none'
      return
    }
    this.renderer = 'webgl'
    this.resize()
    if (this.options.static) this.render(performance.now())
    else if (!document.hidden && !this.frame) this.frame = requestAnimationFrame((time) => this.render(time))
  }

  private onVisibility(): void {
    if (document.hidden && this.frame) { cancelAnimationFrame(this.frame); this.frame = 0 }
    else if (!document.hidden && !this.options.static && !this.destroyed && this.renderer !== 'none' && !this.frame) this.frame = requestAnimationFrame((time) => this.render(time))
  }

  private resize(): void {
    const ratio = Math.min(1.5, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.floor((this.canvas.clientWidth || window.innerWidth || 1) * ratio))
    const height = Math.max(1, Math.floor((this.canvas.clientHeight || window.innerHeight || 1) * ratio))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      if (this.options.static && !this.destroyed && this.renderer !== 'none') this.render(performance.now())
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
        layerData[index] = index % 3
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
      layer: index % 3,
      size: .55 + random() * 1.5
    }))
  }

  private render(time: number): void {
    this.frame = 0
    if (this.destroyed || document.hidden || this.renderer === 'none') return
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
    if (this.gl && this.programs) this.renderWebGl(wrapped)
    else if (this.context2d) this.renderCanvas2d(wrapped)
    if (!this.options.static) this.frame = requestAnimationFrame((next) => this.render(next))
  }

  private renderWebGl(time: number): void {
    const gl = this.gl!
    const programs = this.programs!
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
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
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
    gl.drawArrays(gl.POINTS, 0, densityToStarCount(this.options.density))
    gl.disable(gl.BLEND)
  }

  private renderCanvas2d(time: number): void {
    const context = this.context2d!
    const width = this.canvas.width
    const height = this.canvas.height
    const centerX = width / 2
    const centerY = height / 2
    const fog = context.createRadialGradient(centerX * .58, centerY * .42, 0, centerX, centerY, Math.max(width, height) * .72)
    fog.addColorStop(0, `rgba(${Math.round(18 + 75 * this.current.redshift)},54,92,.72)`)
    fog.addColorStop(.48, 'rgba(7,20,48,.96)')
    fog.addColorStop(1, 'rgba(2,6,18,1)')
    context.fillStyle = fog
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'lighter'
    for (const star of this.canvasStars) {
      const z = Math.max(.035, ((star.z - time * .00000032 * this.current.speed * (1 + star.layer * .5)) % 1 + 1) % 1)
      const x = centerX + star.x * width * .52 / z
      const y = centerY + star.y * height * .52 / z
      if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue
      const alpha = Math.min(.9, (.2 + star.layer * .16) * (1 - z))
      context.strokeStyle = this.current.redshift > .35 ? `rgba(255,92,72,${alpha})` : `rgba(160,215,255,${alpha})`
      context.lineWidth = Math.min(3, star.size / z)
      context.beginPath()
      context.moveTo(x, y)
      const streak = 1 + this.current.stretch * 28 / z
      context.lineTo(x + (x - centerX) * .002 * streak, y + (y - centerY) * .002 * streak)
      context.stroke()
    }
    context.globalCompositeOperation = 'source-over'
    if (this.current.flash > .01) {
      context.fillStyle = `rgba(190,225,255,${Math.min(.45, this.current.flash * .4)})`
      context.fillRect(0, 0, width, height)
    }
  }
}

export const createStarfield = (canvas: HTMLCanvasElement, options: EngineOptions): StarfieldEngine =>
  new GalaxyEngine(canvas, options)
