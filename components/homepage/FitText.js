import { useRef, useState, useEffect } from 'react'

// Shrinks (and caps) its content's font size so it always fits inside its parent
// box in both dimensions. The parent box must have a definite size — FitText
// fills it and never lets content spill out. The largest size that fits is found
// by binary search on every size/content change, so a long track title scales
// down to fit the vinyl player's fixed panel instead of overflowing it.
//
// max/min font sizes are expressed as a fraction of the box width (via
// maxRatio / minRatio) so the whole thing scales with the widget: a normal-length
// title renders at the design size (the cap), and only longer text shrinks.
export default function FitText({ children, maxRatio = 0.16, minRatio = 0.045, deps = [], boxClassName = '' }) {
  const boxRef = useRef(null)
  const innerRef = useRef(null)
  const [fontPx, setFontPx] = useState(null)

  useEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    const fit = () => {
      const w = box.clientWidth
      const h = box.clientHeight
      if (!w || !h) return
      const max = Math.max(1, Math.round(w * maxRatio))
      const min = Math.max(1, Math.round(w * minRatio))
      let lo = min
      let hi = max
      let best = min
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        inner.style.fontSize = `${mid}px`
        const fits = inner.scrollHeight <= h && inner.scrollWidth <= w
        if (fits) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      inner.style.fontSize = `${best}px`
      setFontPx(best)
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRatio, minRatio, ...deps])

  return (
    <div ref={boxRef} className={`flex h-full w-full flex-col justify-center overflow-hidden ${boxClassName}`}>
      <div ref={innerRef} style={fontPx ? { fontSize: `${fontPx}px` } : undefined}>
        {children}
      </div>
    </div>
  )
}
