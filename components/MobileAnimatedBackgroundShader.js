import AnimatedBackgroundShader from './AnimatedBackgroundShader'

// GPU-shader counterpart to MobileAnimatedBackgroundInverted. Cost no longer scales
// with square count (it's all one fragment shader draw), but a larger cell size still
// keeps the noise pattern from looking too busy on small screens.
export default function MobileAnimatedBackgroundShader({ animate = true }) {
  return <AnimatedBackgroundShader size={12} animate={animate} />
}
