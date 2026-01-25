import {useState} from 'react'
import Image from 'next/image'
import Link from 'next/link'

const HoverImageLinkItem = ({
	href,
	defaultSrc,
	hoverSrc,
	alt,
	width,
	height,
	openInNewTab = true,
	className = '',
	ariaLabel,
}) => {
	const [isInteracting, setIsInteracting] = useState(false)
	const resolvedWidth =
		width ??
		(typeof defaultSrc === 'object' && defaultSrc.width
			? defaultSrc.width
			: typeof hoverSrc === 'object' && hoverSrc.width
			? hoverSrc.width
			: 200)
	const resolvedHeight =
		height ??
		(typeof defaultSrc === 'object' && defaultSrc.height
			? defaultSrc.height
			: typeof hoverSrc === 'object' && hoverSrc.height
			? hoverSrc.height
			: 200)

	const imageToRender = isInteracting ? hoverSrc : defaultSrc

	return (
		<Link href={href} passHref legacyBehavior>
			<a
				className={`inline-block ${className}`}
				target={openInNewTab ? '_blank' : undefined}
				rel={openInNewTab ? 'noopener noreferrer' : undefined}
				onMouseEnter={() => setIsInteracting(true)}
				onMouseLeave={() => setIsInteracting(false)}
				onFocus={() => setIsInteracting(true)}
				onBlur={() => setIsInteracting(false)}
				aria-label={ariaLabel ?? alt}
			>
				<Image
					src={imageToRender}
					alt={alt}
					width={resolvedWidth}
					height={resolvedHeight}
					priority
				/>
			</a>
		</Link>
	)
}

const HoverImageLinks = ({items, className = ''}) => {
	if (!Array.isArray(items) || items.length === 0) {
		return null
	}

	return (
		<div className={`flex flex-col gap-4 ${className}`}>
			{items.map((item) => (
				<HoverImageLinkItem key={item.id ?? item.href} {...item} />
			))}
		</div>
	)
}

export default HoverImageLinks

