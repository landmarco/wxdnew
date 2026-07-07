import { useEffect, useRef } from 'react'

export default function AnimatedBackground({ size = 25 }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let p5Instance
    let onVisibilityChange

    // dynamic import so p5 only loads in the browser, never during SSR
    import('p5').then((p5Module) => {
      const p5 = p5Module.default

      const sketch = (p) => {
        let cols, rows
        let xoff = 0, yoff = 0, inc = 0.1
        let zoff = 0
        let sizeZoff = 0
        let bgOff = 0

        p.setup = () => {
          p.createCanvas(window.innerWidth, window.innerHeight)
          p.rectMode(p.CENTER)
          // ambient background; 15fps is plenty and halves the per-second work
          p.frameRate(15)
          // don't 4x the pixels on retina/HiDPI — imperceptible for a soft background
          p.pixelDensity(1)
          // hue 0-360, saturation/brightness 0-100 so we can cap them for a muted palette
          p.colorMode(p.HSB, 360, 100, 100)
          recalcGrid()

          // pause the draw loop while the tab/window is hidden so we don't burn CPU
          onVisibilityChange = () => {
            if (document.hidden) p.noLoop()
            else p.loop()
          }
          document.addEventListener('visibilitychange', onVisibilityChange)
        }

        function recalcGrid() {
          cols = Math.ceil(p.width / size)
          rows = Math.ceil(p.height / size)
        }

        p.windowResized = () => {
          p.resizeCanvas(window.innerWidth, window.innerHeight)
          recalcGrid()
        }

        p.draw = () => {
          // background slowly cycles through a muted hue instead of staying gray
          let bgHue = p.noise(bgOff) * 360
          p.background(bgHue, 40, 55)
          bgOff += 0.002

          // blobs are always solid black — set fill/stroke once per frame, not per square
          p.noStroke()
          p.fill(0, 0, 0)

          xoff = 0
          for (let i = 0; i < cols; i++) {
            yoff = 0
            for (let j = 0; j < rows; j++) {
              // size is only used this frame, so a local avoids reallocating arrays every frame
              const s = p.map(p.noise(xoff, yoff, sizeZoff), 0, 1, 0, size * 1.7)
              yoff += inc
              p.rect(size / 2 + i * size, size / 2 + j * size, s, s)
            }
            xoff += inc
            zoff += 0.0001
          }
          sizeZoff += 0.01
        }
      }

      p5Instance = new p5(sketch, containerRef.current)
    })

    // cleanup when component unmounts (e.g. navigating away from homepage)
    return () => {
      if (onVisibilityChange) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (p5Instance) p5Instance.remove()
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