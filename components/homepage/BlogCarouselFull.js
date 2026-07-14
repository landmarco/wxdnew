import PostPreview from '../PostPreview'
import Link from 'next/link'
import { useRouter } from 'next/router'

// There are two BlogCarousel components. On desktop, if there is content in the "WXYC This Week" section, the blog post carousel renders underneath "WXYC This Week" and the audio player at full-screen (BlogCarouselFull.js) However, if there is no content in "WXYC This Week", BlogCarouselCropped.js is called, and is aligned with the audio player.

const BlogCarouselFull = (props) => {
	const router = useRouter()

	// The whole card links to /blog. Individual post previews (and the "Older
	// blog posts" link) stopPropagation so clicking one goes to that post rather
	// than triggering the card's navigation.
	const goToBlog = () => router.push('/blog')

	const handleKeyDown = (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			goToBlog()
		}
	}

	return (
		<div
			role="link"
			tabIndex={0}
			onClick={goToBlog}
			onKeyDown={handleKeyDown}
			aria-label="Blog Posts — see all blog posts"
			className="group flex h-full cursor-pointer flex-col rounded-lg border border-white bg-black/80 p-4 transition hover:border-[#e0ff05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0ff05]"
		>
			<p className="kallisto mb-4 whitespace-nowrap text-3xl text-white group-hover:text-[#e0ff05] lg:text-5xl">
				Blog Posts
			</p>

			<div className="flex flex-1 flex-col">
				<div className="scrollbar mb-6 flex snap-mandatory flex-col gap-6 md:flex-row md:items-start md:gap-4 md:overflow-x-auto">
					{props.posts.map((post) => (
						<div key={post.node.id} onClick={(e) => e.stopPropagation()}>
							<PostPreview
								id={post.node.id}
								title={post.node.title}
								slug={post.node._sys.filename}
								cover={post.node.cover}
								subtitle={post.node.description}
								categories={post.node.categories}
							/>
						</div>
					))}
				</div>
				<div className="mt-auto flex justify-center rounded-3xl bg-neutral-800 px-3 py-2 md:ml-auto md:inline-block md:bg-transparent md:px-0 md:py-0 lg:justify-start">
					<Link href="/blog" onClick={(e) => e.stopPropagation()}>
						<h2 className="my-1 cursor-pointer hover:underline">
							Older blog posts {'>'}
						</h2>
					</Link>
				</div>
			</div>
		</div>
	)
}

export default BlogCarouselFull
