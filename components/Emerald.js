// The sparkling green emerald shown while the 320 kbps stream is active. One
// source image (348x348) is sized down per use via the `size` prop. Pass
// `onClick` for the interactive footer emerald (reverts to standard quality);
// omit it for the decorative one behind the header visualizer.
import emerald from '/images/320kbps_emerald.png'

export default function Emerald({ onClick, size = 64, className = '', label, animated = true }) {
	const img = (
		<img
			src={emerald.src}
			alt={onClick ? label || '320 kbps emerald' : ''}
			aria-hidden={onClick ? undefined : true}
			className={`h-full w-full object-contain ${animated ? 'animate-emerald-glow' : ''}`}
		/>
	)

	const style = { width: size, height: size }

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				aria-label={label || 'Revert to standard quality stream'}
				title={label || 'Revert to standard quality stream'}
				className={`cursor-pointer border-0 bg-transparent p-0 ${className}`}
				style={style}
			>
				{img}
			</button>
		)
	}

	return (
		<span aria-hidden="true" className={className} style={style}>
			{img}
		</span>
	)
}
