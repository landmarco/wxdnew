import AnimatedBackground from './AnimatedBackground'

// Same animation as AnimatedBackground, just with smaller squares for small screens.
export default function MobileAnimatedBackground() {
  return <AnimatedBackground size={10} />
}
