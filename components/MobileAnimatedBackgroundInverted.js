import AnimatedBackgroundInverted from './AnimatedBackgroundInverted'

// Same animation as AnimatedBackgroundInverted. Note: LARGER squares = FEWER of them, which
// is what phones want — small squares would mean tens of thousands of shapes redrawn per frame.
export default function MobileAnimatedBackgroundInverted() {
  return <AnimatedBackgroundInverted size={22} />
}
