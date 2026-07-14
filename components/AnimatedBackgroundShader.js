import { useEffect, useRef } from 'react'

// GPU-shader version of AnimatedBackgroundInverted: same visual (black squares whose
// size drifts with noise, over a slowly-cycling muted HSB background) but the whole
// thing runs as a single fullscreen GLSL fragment shader on the GPU instead of ~thousands
// of per-square canvas2D draw calls on the main thread. Uses the same approach WXYC's
// site uses (via the `ogl` WebGL library), so it never competes with scroll/input.
// ogl's Triangle geometry is one oversized triangle whose corners land outside
// clip space but whose visible slice exactly covers the screen — cheaper than
// two triangles (a quad) since there's no seam down the middle to rasterize twice.
// This shader does no per-vertex work: uv/position pass straight through, and all
// the drawing happens per-pixel in the fragment shader below.

// setting up canvas
const vertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uSize;
  uniform vec3 uBgColor;
  varying vec2 vUv;

  // Simplex 3D noise (Ashima Arts / Ian McEwan, webgl-noise) for smooth effect
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // main p5.js sketch replacement below
  void main() {
    // PIXEL POSITION: vUv is 0..1 across the screen; scale up to actual pixel coordinates so
    // uSize (a pixel value, matching the old p5 grid cell size) means the same thing here. Ex: vUv gives a random number, and this function says which pixel number it is at.
    // Measure Y from the TOP (vUv.y=1 at top): the canvas is position:fixed at top:0, so on
    // resize the top-left corner stays put on screen while the bottom edge moves. Anchoring the
    // grid to that stable top-left corner is what stops the pattern from "jumping" on mobile,
    // where scrolling shows/hides the URL bar and fires a resize with a changed innerHeight.
    vec2 fragCoord = vec2(vUv.x, 1.0 - vUv.y) * uResolution;

    // BG COLOR: the background hue drifts over time only (no spatial input), so it's the same
    // for every pixel this frame. Rather than re-run simplex noise + hsb2rgb in all ~millions of
    // pixels, it's computed once per frame on the CPU (see snoise3/hsb2rgb below) and passed in
    // as uBgColor — one continuous color wash, same as the old p.noise(bgOff).
    vec3 bgColor = uBgColor;


    // WHICH GRID SQUARE + DISTANCE FROM CENTER CALCULATION. This replaces the old p5 double for-loop over cols/rows — instead of iterating cells
    // and drawing a rect each, every pixel independently figures out its own cell in parallel.
    vec2 cell = floor(fragCoord / uSize);
    vec2 cellCenter = (cell + 0.5) * uSize;
    vec2 localPos = fragCoord - cellCenter;

    // SQUARE SIZE. Sample noise using the cell's grid coordinates (not pixel coords) so the whole
    // square gets one consistent size, and offset by time so sizes drift frame to frame —
    // same role as the old p.noise(xoff, yoff, sizeZoff) per-cell size lookup.
    float n = snoise(vec3(cell * 0.1, uTime * 0.15));
    float s = (n * 0.5 + 0.5) * uSize * 1.7;

    // INSIDE SQUARE OR GAP. Distance from the cell center using max(|x|,|y|) (Chebyshev distance to get a square) gives a
    // square footprint rather than a circle. smoothstep over a 2px band anti-aliases
    // the square's edge instead of leaving it jagged.
    float d = max(abs(localPos.x), abs(localPos.y));
    float mask = 1.0 - smoothstep(s * 0.5 - 1.0, s * 0.5 + 1.0, d);

    // Blend from the background color to solid black based on the mask: 0 outside the
    // square (pure bgColor), 1 inside it (pure black), with the smoothstep band between.
    vec3 color = mix(bgColor, vec3(0.0), mask);
    gl_FragColor = vec4(color, 1.0);
  }
`

// --- CPU ports of the two GLSL helpers, used only for the spatially-constant background
// color (computed once per frame instead of once per pixel). Faithful ports of the same
// Ashima simplex noise + hsb2rgb above, so the wash looks identical to the old per-pixel path.
function mod289(x) { return x - Math.floor(x * (1 / 289)) * 289 }
function permute(x) { return mod289((x * 34 + 1) * x) }
function taylorInvSqrt(r) { return 1.79284291400159 - 0.85373472095314 * r }

function snoise3(vx, vy, vz) {
  const CX = 1 / 6, CY = 1 / 3
  const dvy = (vx + vy + vz) * CY
  let ix = Math.floor(vx + dvy), iy = Math.floor(vy + dvy), iz = Math.floor(vz + dvy)
  const dix = (ix + iy + iz) * CX
  const x0 = [vx - ix + dix, vy - iy + dix, vz - iz + dix]

  const g = [x0[0] >= x0[1] ? 1 : 0, x0[1] >= x0[2] ? 1 : 0, x0[2] >= x0[0] ? 1 : 0]
  const l = [1 - g[0], 1 - g[1], 1 - g[2]]
  const i1 = [Math.min(g[0], l[2]), Math.min(g[1], l[0]), Math.min(g[2], l[1])]
  const i2 = [Math.max(g[0], l[2]), Math.max(g[1], l[0]), Math.max(g[2], l[1])]

  const x1 = [x0[0] - i1[0] + CX, x0[1] - i1[1] + CX, x0[2] - i1[2] + CX]
  const x2 = [x0[0] - i2[0] + CY, x0[1] - i2[1] + CY, x0[2] - i2[2] + CY]
  const x3 = [x0[0] - 0.5, x0[1] - 0.5, x0[2] - 0.5]

  ix = mod289(ix); iy = mod289(iy); iz = mod289(iz)
  let p = [0, i1[2], i2[2], 1].map((v) => permute(iz + v))
  p = p.map((pv, k) => permute(pv + iy + [0, i1[1], i2[1], 1][k]))
  p = p.map((pv, k) => permute(pv + ix + [0, i1[0], i2[0], 1][k]))

  const n_ = 1 / 7
  const nsx = n_ * 2, nsy = n_ * 0.5 - 1
  // p is a non-negative integer here, so these use exact integer modulo/division. The GLSL
  // does the same math as multiply-by-1/7 + floor(), which works on the GPU only because
  // float32 rounds 7*(1/7) *up* to 1.0. In JS's float64 the truncated 0.142857… lands just
  // under 1/7, so floor() drops by one at every multiple of 7 — flipping a gradient index and
  // producing out-of-range noise. Integer ops sidestep the rounding entirely.
  const j = p.map((pv) => pv % 49)
  const x_ = j.map((jv) => Math.floor(jv / 7))
  const y_ = j.map((jv, k) => jv - 7 * x_[k])
  const xx = x_.map((v) => v * nsx + nsy)
  const yy = y_.map((v) => v * nsx + nsy)
  const h = xx.map((v, k) => 1 - Math.abs(v) - Math.abs(yy[k]))

  const b0 = [xx[0], xx[1], yy[0], yy[1]]
  const b1 = [xx[2], xx[3], yy[2], yy[3]]
  const s0 = b0.map((v) => Math.floor(v) * 2 + 1)
  const s1 = b1.map((v) => Math.floor(v) * 2 + 1)
  const sh = h.map((v) => -(v <= 0 ? 1 : 0))

  const a0 = [b0[0] + s0[0] * sh[0], b0[2] + s0[2] * sh[0], b0[1] + s0[1] * sh[1], b0[3] + s0[3] * sh[1]]
  const a1 = [b1[0] + s1[0] * sh[2], b1[2] + s1[2] * sh[2], b1[1] + s1[1] * sh[3], b1[3] + s1[3] * sh[3]]

  let g0 = [a0[0], a0[1], h[0]]
  let g1 = [a0[2], a0[3], h[1]]
  let g2 = [a1[0], a1[1], h[2]]
  let g3 = [a1[2], a1[3], h[3]]
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const norm = [g0, g1, g2, g3].map((gv) => taylorInvSqrt(dot3(gv, gv)))
  g0 = g0.map((v) => v * norm[0]); g1 = g1.map((v) => v * norm[1])
  g2 = g2.map((v) => v * norm[2]); g3 = g3.map((v) => v * norm[3])

  let m = [dot3(x0, x0), dot3(x1, x1), dot3(x2, x2), dot3(x3, x3)].map((v) => Math.max(0.6 - v, 0))
  m = m.map((v) => v * v)
  const mm = m.map((v) => v * v)
  return 42 * (mm[0] * dot3(g0, x0) + mm[1] * dot3(g1, x1) + mm[2] * dot3(g2, x2) + mm[3] * dot3(g3, x3))
}

function hsb2rgb(hue, sat, bri) {
  return [0, 4, 2].map((o) => {
    let v = (((hue * 6 + o) % 6) + 6) % 6
    v = Math.min(Math.max(Math.abs(v - 3) - 1, 0), 1)
    v = v * v * (3 - 2 * v)
    return bri * (1 + (v - 1) * sat)
  })
}

// Animation drift speed as a fraction of real time — lower is slower. The square/color
// motion reads best well below real time, and slowing it also thins GPU work a little more.
const TIME_SCALE = 0.4

// The background hue samples the noise at a single point (animTime), and animTime=0 lands
// on a lattice point where the noise has a sharp dip (green) with a very steep slope right
// beside it. Starting there means the first ~2s of drift rushes green->blue before settling
// into the gentle roll everywhere else. Start past that singularity, at a spot that's also
// green but on a gentle slope, so the paused frame rests green and drifting eases smoothly
// green->blue instead of snapping. (The square-size noise samples per-cell, so it has no
// such global singularity and is unaffected by the offset.)
const HUE_START_OFFSET = 36

export default function AnimatedBackgroundShader({ size = 17, animate = true }) {
  const containerRef = useRef(null)
  // Latest desired animate state + the running loop's start/stop handles. Kept in refs so
  // starting/stopping the drift on play/pause never tears down and rebuilds the GL context.
  const animateRef = useRef(animate)
  const controlsRef = useRef(null)

  // Start or stop the drift when playback starts/stops. The loop controls only exist after
  // the async ogl import resolves; until then this just records the intent in animateRef,
  // which the setup effect reads once it's ready.
  useEffect(() => {
    animateRef.current = animate
    const controls = controlsRef.current
    if (!controls) return
    if (animate) controls.start()
    else controls.stop()
  }, [animate])

  useEffect(() => {
    // Respect the OS-level reduced-motion setting: skip mounting the canvas
    // entirely rather than rendering a static frame, since users who set this
    // are opting out of the animation, not just wanting it to hold still.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let renderer, program, mesh, canvas
    let rafId = null
    let onResize, onActivityChange
    let destroyed = false

    // ogl only touches the DOM/WebGL context, so it's loaded dynamically to keep it
    // out of the SSR bundle entirely — same reasoning as the old p5 dynamic import.
    import('ogl').then(({ Renderer, Program, Mesh, Triangle }) => {
      // effect cleanup can fire before this promise resolves (fast route change); bail out
      // rather than mounting a canvas into a container that's already gone.
      if (destroyed || !containerRef.current) return

      // dpr: 1 skips retina's 4x pixel fill; antialias: false is redundant work since
      // the shader already anti-aliases its own square edges via smoothstep.
      renderer = new Renderer({ dpr: 1, alpha: false, antialias: false })
      const gl = renderer.gl
      canvas = gl.canvas
      canvas.style.display = 'block'
      containerRef.current.appendChild(canvas)

      // One triangle, one shader program, one mesh; the entire "scene" is a single
      // draw call every frame, vs. thousands of individual rect() calls in the old version.
      const geometry = new Triangle(gl)
      program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [window.innerWidth, window.innerHeight] },
          uSize: { value: size },
          uBgColor: { value: hsb2rgb(0.5, 0.4, 0.55) },
        },
      })
      mesh = new Mesh(gl, { geometry, program })

      // The loop is throttled to ~30fps — the drift is slow enough that 60fps is wasted work.
      // The square sizes animate in the shader; the background hue drifts on the CPU (uBgColor)
      // so it isn't recomputed per-pixel. Halving the frames roughly halves both the
      // rAF/compositing CPU cost and the GPU shading load (what spins fans on integrated GPUs).
      const targetFps = 30
      const frameInterval = 1000 / targetFps
      // Accumulated *animation* seconds — advances only while the loop runs, so pausing freezes
      // the current frame and resuming picks up where it left off rather than jumping forward by
      // the time spent paused. TIME_SCALE slows the drift relative to real time.
      let animTime = HUE_START_OFFSET
      let lastTs = null

      // Draw one frame at the current animTime. Called by the loop, on resize, and once up
      // front, so a paused (or never-played) background still shows a static frame, not blank.
      const renderFrame = () => {
        program.uniforms.uTime.value = animTime
        const bgHue = snoise3(animTime * 0.03, 0, 0) * 0.5 + 0.5
        program.uniforms.uBgColor.value = hsb2rgb(bgHue, 0.4, 0.55)
        renderer.render({ scene: mesh })
      }

      // Resize the GL framebuffer + tell the shader the new pixel dimensions (uResolution) so
      // grid cells stay screen-space-sized, then repaint. The repaint matters while paused:
      // resizing a WebGL canvas clears it and the loop isn't running to redraw it, so without
      // this the background would blank on resize until playback resumes.
      const resize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight)
        program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height]
        renderFrame()
      }
      onResize = resize
      resize()
      window.addEventListener('resize', onResize)

      const update = (t) => {
        rafId = requestAnimationFrame(update)
        if (lastTs === null) lastTs = t
        const elapsed = t - lastTs
        if (elapsed < frameInterval) return
        lastTs = t - (elapsed % frameInterval)
        animTime += (elapsed / 1000) * TIME_SCALE
        renderFrame()
      }

      // The visualization should only run while the user is actually looking at the
      // page. "Active" means the tab is visible AND the window has focus, so we stop
      // not only when the tab is hidden (switched tab/app, phone locked) but also when
      // the window merely loses focus (another window on top) — nothing to render for
      // someone who isn't looking, same spirit as not keeping the stream warm for a
      // listener who's navigated away.
      const isActive = () => !document.hidden && document.hasFocus()

      const startLoop = () => {
        if (rafId || !isActive()) return
        lastTs = null // don't count time spent stopped as elapsed animation
        rafId = requestAnimationFrame(update)
      }
      const stopLoop = () => {
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
      }
      // Expose the handles so the animate-prop effect (play/pause) can gate the loop.
      controlsRef.current = { start: startLoop, stop: stopLoop }

      // resize() above already painted the initial frame; start drifting only if the stream
      // is already playing at mount (or once it starts, via the animate-prop effect above).
      if (animateRef.current) startLoop()

      // Re-sync the loop to activity: stop the instant the page goes hidden or loses
      // focus, resume only once it's active again and we're still meant to animate.
      // visibilitychange covers tab/app switches and phone lock; blur/focus cover a
      // still-visible window losing or regaining focus.
      onActivityChange = () => {
        if (isActive()) {
          if (animateRef.current) startLoop()
        } else {
          stopLoop()
        }
      }
      document.addEventListener('visibilitychange', onActivityChange)
      window.addEventListener('blur', onActivityChange)
      window.addEventListener('focus', onActivityChange)
    })

    return () => {
      destroyed = true
      if (rafId) cancelAnimationFrame(rafId)
      if (onResize) window.removeEventListener('resize', onResize)
      if (onActivityChange) {
        document.removeEventListener('visibilitychange', onActivityChange)
        window.removeEventListener('blur', onActivityChange)
        window.removeEventListener('focus', onActivityChange)
      }
      controlsRef.current = null
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  }, [size])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
