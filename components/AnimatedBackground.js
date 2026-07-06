import { useEffect, useRef } from 'react'

export default function AnimatedBackground({ size = 15 }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let p5Instance

    // dynamic import so p5 only loads in the browser, never during SSR
    import('p5').then((p5Module) => {
      const p5 = p5Module.default

      const sketch = (p) => {
        let sizes = []
        let cols, rows
        let xoff = 0, yoff = 0, inc = 0.1
        let zoff = 0
        let sizeZoff = 0

        p.setup = () => {
          p.createCanvas(window.innerWidth, window.innerHeight)
          p.rectMode(p.CENTER)
          p.frameRate(30)
          // hue 0-360, saturation/brightness 0-100 so we can cap them for a muted palette
          p.colorMode(p.HSB, 360, 100, 100)
          recalcGrid()
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
          // neutral, low-brightness gray background (0 saturation)
          p.background(0, 0, 60)
          xoff = 0
          for (let i = 0; i < cols; i++) {
            sizes[i] = []
            yoff = 0
            for (let j = 0; j < rows; j++) {
              sizes[i][j] = p.map(p.noise(xoff, yoff, sizeZoff), 0, 1, 0, size * 1.7)
              yoff += inc

              // only the hue wanders through noise; saturation/brightness stay
              // capped low so every hue that comes up reads as muted and dark
              let hue = p.noise(zoff) * 360
              let saturation = p.map(p.noise(zoff + 7), 0, 1, 50, 60)
              let brightness = p.map(p.noise(zoff + 10), 0, 1, 35, 60)

              p.fill(hue, saturation, brightness)
              p.noStroke()
              p.rect(size / 2 + i * size, size / 2 + j * size, sizes[i][j], sizes[i][j])
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