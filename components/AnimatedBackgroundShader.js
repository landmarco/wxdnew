import { useEffect, useRef, useState } from 'react'

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
  uniform sampler2D uNoiseTex;
  varying vec2 vUv;

  const float INV_NOISE_TEX_SIZE = 0.00390625; // 1.0 / 256.0, must match the JS-side noise texture size

  // Texture-lookup hash: trades the old simplex noise's long permute/mod289/
  // taylorInvSqrt ALU chain for a cheap texture fetch, which is generally
  // faster on integrated/weaker GPUs where texture units are separate from
  // (and less contended than) the ALU pipeline doing everything else on screen.
  float hash(vec3 p) {
    vec2 uv = (p.xy + p.z * 37.0) * INV_NOISE_TEX_SIZE;
    return texture2D(uNoiseTex, uv).x;
  }

  // Trilinearly-interpolated value noise using the hash above in place of a
  // gradient noise; same smoothstep-based interpolation shape as classic Perlin.
  float snoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = p - i;
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);

    float y0 = mix(x00, x10, f.y);
    float y1 = mix(x01, x11, f.y);

    // Remap 0..1 value noise into -1..1 to match the old snoise's output range,
    // since downstream code (*0.5+0.5 etc.) expects that range.
    return mix(y0, y1, f.z) * 2.0 - 1.0;
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
    // for every pixel this frame. Rather than re-run noise + hsb2rgb in all ~millions of
    // pixels, it's computed once per frame on the CPU (see snoise3/hsb2rgb below) and passed in
    // as uBgColor: one continuous color wash, same as the old p.noise(bgOff).
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
// Ashima simplex noise + hsb2rgb, so the wash looks identical to the old per-pixel path.
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

// Seeded so the noise texture (and thus the square-size pattern) is consistent
// across reloads instead of reshuffling every mount.
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Small tileable RGBA hash texture read by the shader's hash()/snoise() in place of the
// old ALU-heavy simplex noise chain — cheap texture-cache fetches beat per-pixel vector
// math on integrated/weaker GPUs, where texture units aren't contended by the rest of
// the shader's ALU work.
function createNoiseTextureData(size = 256) {
  const seed = Math.random()
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = seededRandom(seed + i * 0.001) * 255
    data[i * 4 + 1] = seededRandom(seed + i * 0.001 + 1000) * 255
    data[i * 4 + 2] = seededRandom(seed + i * 0.001 + 2000) * 255
    data[i * 4 + 3] = 255
  }
  return data
}

// Base animation drift speed as a fraction of real time, multiplied by the `speed` prop
// (default 1.6) so the default effective rate matches the previous fixed 0.4 scale while
// still being tunable. Kept well below real time so the drift reads as gentle, not jumpy.
const BASE_TIME_SCALE = 0.25

// The background hue samples the noise at a single point (animTime), and animTime=0 lands
// on a lattice point where the noise has a sharp dip (green) with a very steep slope right
// beside it. Starting there means the first ~2s of drift rushes green->blue before settling
// into the gentle roll everywhere else. Start past that singularity, at a spot that's also
// green but on a gentle slope, so a freshly-mounted background rests green and drifting eases
// smoothly green->blue instead of snapping. (The square-size noise samples per-cell, so it has
// no such global singularity and is unaffected by the offset.)
const HUE_START_OFFSET = 36

export default function AnimatedBackgroundShader({ size = 17, brightness = 0.6, saturation = 0.75, speed = 8 }) {
  const containerRef = useRef(null)
  const [supported, setSupported] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    // Respect the OS-level reduced-motion setting: skip mounting the canvas
    // entirely rather than rendering a static frame, since users who set this
    // are opting out of the animation, not just wanting it to hold still. Render
    // the same solid-black static fallback as the unsupported-GPU path (below) so
    // both non-animated cases look identical instead of leaving a transparent gap.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReducedMotion(true)
      return
    }

    let renderer, program, mesh, canvas
    let rafId = null
    let resizeRafId = null
    let onResize, onActivityChange
    let destroyed = false

    // ogl only touches the DOM/WebGL context, so it's loaded dynamically to keep it
    // out of the SSR bundle entirely — same reasoning as the old p5 dynamic import.
    import('ogl').then(({ Renderer, Program, Mesh, Triangle, Texture }) => {
      // effect cleanup can fire before this promise resolves (fast route change); bail out
      // rather than mounting a canvas into a container that's already gone.
      if (destroyed || !containerRef.current) return

      // Probe context creation ourselves first with failIfMajorPerformanceCaveat: if the
      // browser would otherwise silently fall back to a software rasterizer (e.g. because
      // of a blocklisted GPU driver), this throws/returns null instead — so we can bail to
      // a static background rather than "GPU shader" actually running on the CPU every frame.
      // ogl's Renderer doesn't expose this flag, so create+check a context manually first;
      // the canvas keeps the same context when Renderer calls getContext on it again below.
      canvas = document.createElement('canvas')
      let probeGl = null
      try {
        probeGl = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: true,
        })
      } catch {
        probeGl = null
      }
      if (!probeGl) {
        setSupported(false)
        return
      }

      // dpr: 1 skips retina's 4x pixel fill; antialias: false is redundant work since
      // the shader already anti-aliases its own square edges via smoothstep.
      renderer = new Renderer({ canvas, dpr: 1, alpha: false, antialias: false, powerPreference: 'low-power' })
      const gl = renderer.gl
      canvas.style.display = 'block'
      containerRef.current.appendChild(canvas)

      const noiseSize = 256
      const noiseTexture = new Texture(gl, {
        image: createNoiseTextureData(noiseSize),
        width: noiseSize,
        height: noiseSize,
        wrapS: gl.REPEAT,
        wrapT: gl.REPEAT,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
        generateMipmaps: false,
      })

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
          uBgColor: { value: hsb2rgb(0.5, saturation, brightness) },
          uNoiseTex: { value: noiseTexture },
        },
      })
      mesh = new Mesh(gl, { geometry, program })

      // The loop is throttled to ~30fps — the drift is slow enough that 60fps is wasted work.
      // The square sizes animate in the shader; the background hue drifts on the CPU (uBgColor)
      // so it isn't recomputed per-pixel. Halving the frames roughly halves both the
      // rAF/compositing CPU cost and the GPU shading load (what spins fans on integrated GPUs).
      const targetFps = 30
      const frameInterval = 1000 / targetFps
      // Accumulated *animation* seconds, advanced by the loop below at `speed` * BASE_TIME_SCALE
      // relative to real time.
      let animTime = HUE_START_OFFSET
      let lastTs = null

      // Draw one frame at the current animTime. Called by the loop, on resize, and once up
      // front, so the background shows a frame immediately rather than staying blank.
      const renderFrame = () => {
        program.uniforms.uTime.value = animTime
        const bgHue = snoise3(animTime * 0.03, 0, 0) * 0.5 + 0.5
        program.uniforms.uBgColor.value = hsb2rgb(bgHue, saturation, brightness)
        renderer.render({ scene: mesh })
      }

      // Resize the GL framebuffer + tell the shader the new pixel dimensions (uResolution) so
      // grid cells stay screen-space-sized, then repaint. The repaint matters because resizing
      // a WebGL canvas clears it, and the loop may be stopped (tab hidden) when it fires.
      let lastW = 0, lastH = 0
      const applyResize = () => {
        resizeRafId = null
        const w = window.innerWidth, h = window.innerHeight
        // Skip no-op events: mobile fires resize on scroll even when nothing changed.
        if (w === lastW && h === lastH) return
        lastW = w; lastH = h
        renderer.setSize(w, h)
        program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height]
        renderFrame()
      }
      // Coalesce resize events into at most one framebuffer resize per frame. Mobile browsers
      // fire a *storm* of resize events while the URL bar collapses during scroll; handling each
      // one synchronously reallocates the GL framebuffer on the main thread and can stutter the
      // very scroll that triggered it. Batching to a single rAF caps it at one realloc per frame.
      const resize = () => {
        if (resizeRafId === null) resizeRafId = requestAnimationFrame(applyResize)
      }
      onResize = resize
      applyResize() // initial sizing + first paint, synchronously (before the loop starts)
      window.addEventListener('resize', onResize)

      const update = (t) => {
        rafId = requestAnimationFrame(update)
        if (lastTs === null) lastTs = t
        const elapsed = t - lastTs
        if (elapsed < frameInterval) return
        lastTs = t - (elapsed % frameInterval)
        animTime += (elapsed / 1000) * BASE_TIME_SCALE * speed
        renderFrame()
      }

      // The visualization should only run while the tab is actually visible — nothing
      // to render for a hidden/backgrounded tab (switched tab/app, phone locked). Unlike
      // an earlier version, this does NOT pause on window blur: devtools or another
      // window merely stealing OS focus shouldn't freeze a background that's still on
      // screen and visible to the user.
      const isActive = () => !document.hidden

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

      // resize() above already painted the initial frame; the background always drifts
      // once mounted (mounting/unmounting is what the on/off toggle controls).
      startLoop()

      // Re-sync the loop to tab visibility: stop the instant the tab is hidden, resume
      // once it's visible again.
      onActivityChange = () => {
        if (isActive()) startLoop()
        else stopLoop()
      }
      document.addEventListener('visibilitychange', onActivityChange)
    })

    return () => {
      destroyed = true
      if (rafId) cancelAnimationFrame(rafId)
      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      if (onResize) window.removeEventListener('resize', onResize)
      if (onActivityChange) {
        document.removeEventListener('visibilitychange', onActivityChange)
      }
      // Explicitly drop the WebGL context so its GPU resources are freed now rather than
      // waiting on GC. The footer toggle unmounts/remounts this component, and browsers cap
      // the number of live WebGL contexts (~16) — without this, repeated toggling leaks
      // contexts until the browser starts killing the oldest ones.
      if (renderer) {
        const loseCtx = renderer.gl.getExtension('WEBGL_lose_context')
        if (loseCtx) loseCtx.loseContext()
      }
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  }, [size, brightness, saturation, speed])

  // If WebGL2 creation failed (e.g. failIfMajorPerformanceCaveat rejected a
  // software-rendering fallback), or the user has reduced-motion set, render a
  // plain static background instead of silently paying for a fullscreen shader
  // running on the CPU (or animating against the user's stated preference).
  if (!supported || reducedMotion) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          backgroundColor: '#000000',
          pointerEvents: 'none',
        }}
      />
    )
  }

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
