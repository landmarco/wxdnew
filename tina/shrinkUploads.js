// Downscales images in the browser *before* Tina uploads them.
//
// Why here and not in CI: media lives in the repo (`media.tina` below points at
// public/uploads), so whatever the editor picks is what gets committed. A CI job
// that shrinks files after the fact still commits the full-size original first,
// and that original is in git history forever. Shrinking at upload time is the
// only point where the big version never enters the repo at all.
//
// Why a prototype patch rather than `loadCustomStore`: `media.tina` and
// `media.loadCustomStore` are mutually exclusive in Tina's config type, and
// dropping `media.tina` changes how mediaRoot/publicFolder resolve. Wrapping the
// instance in `cmsCallback` doesn't hold either — Tina calls setupMedia() in the
// component body, so `cms.media.store` is reassigned on every render and a
// one-time wrapper is replaced on the next one. Patching the prototype survives
// every reconstruction and leaves the config untouched.
//
// Tradeoff: TinaMediaStore is exported at runtime but is not documented public
// API, so `tinacms` is pinned in package.json. Re-test uploads after upgrading.
// If a future version restructures this, the guard below means uploads keep
// working — they just stop being resized.
import {TinaMediaStore} from 'tinacms'

// Matches the 2x ceiling documented in CLAUDE.md: the widest a Tina-managed
// image ever renders is a blog cover (~668 CSS px in the square preview grid),
// so 1344 covers it at 2x. 1600 leaves headroom without being wasteful.
const MAX_EDGE = 1600
const QUALITY = 0.8

// Formats we deliberately pass through untouched: GIF would lose its animation
// (canvas only captures the first frame) and SVG is vector — rasterizing it
// would make it bigger and worse.
const PASSTHROUGH = ['image/gif', 'image/svg+xml']

export async function shrinkImageFile(file) {
	if (!file || !file.type || !file.type.startsWith('image/')) return file
	if (PASSTHROUGH.includes(file.type)) return file

	let bitmap
	try {
		// `from-image` applies EXIF rotation, so phone photos don't come out sideways
		// once the orientation tag is dropped by the re-encode.
		bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'})
	} catch (e) {
		// Anything we can't decode (corrupt, or an exotic format) uploads as-is
		// rather than failing the editor's upload.
		console.warn('[wxdu] could not decode image, uploading original:', e)
		return file
	}

	try {
		// Only ever shrink. An image already under the ceiling keeps its dimensions
		// and is just re-encoded, which is usually still a large win for PNGs.
		const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
		const canvas = document.createElement('canvas')
		canvas.width = Math.round(bitmap.width * scale)
		canvas.height = Math.round(bitmap.height * scale)
		canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)

		const blob = await new Promise((resolve) =>
			canvas.toBlob(resolve, 'image/webp', QUALITY)
		)

		// Already-optimised assets (and small WebPs) can come out bigger. Keep
		// whichever is smaller so we never make things worse.
		if (!blob || blob.size >= file.size) return file

		const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
		return new File([blob], name, {type: 'image/webp'})
	} finally {
		if (bitmap.close) bitmap.close()
	}
}

// Both upload paths (persist_local and persist_cloud) derive the stored path and
// the `src` written into frontmatter from `file.name`, so renaming to .webp here
// propagates correctly on its own — nothing downstream needs fixing up.
if (TinaMediaStore && !TinaMediaStore.prototype.__wxduShrinkPatched) {
	const originalPersist = TinaMediaStore.prototype.persist

	TinaMediaStore.prototype.persist = async function (media) {
		const shrunk = await Promise.all(
			media.map(async (item) => ({
				...item,
				file: await shrinkImageFile(item.file),
			}))
		)
		return originalPersist.call(this, shrunk)
	}

	TinaMediaStore.prototype.__wxduShrinkPatched = true
}
