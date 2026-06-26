import {tinaField, useTina} from 'tinacms/dist/react'
import {client} from '../tina/__generated__/client'
import WeeklySchedule from '../components/WeeklySchedule'
import RichText from '../components/RichText'
import { scheduleBuilder } from '../lib/schedule/scheduleBuilder'

//editable static pages (programming, contact, etc.)
export default function Home(props) {
	// data passes though in production mode and data is updated to the sidebar data in edit-mode
	const {data} = useTina({
		query: props.query,
		variables: props.variables,
		data: props.data,
	})

	// store whatever is in rich text editor for that page in variable content
	const content = data.page.body
	const isProgrammingPage = props.slug === 'programming'

	// page-specific Tina template: the weekly schedule (programming page only).
	// Shared markdown overrides (e.g. the SiteLink `a` renderer) are applied by RichText.
	const components = {
		weeklySchedule: () => isProgrammingPage ? (
			<div className="not-prose relative left-1/2 mt-8 w-[80vw] -translate-x-1/2">
				<WeeklySchedule schedule={props.schedule} />
			</div>
		) : null
	}

	return (
		<div>
			<div data-tina-field={tinaField(data.page, 'body')}>
				<div className="mx-auto flex w-full flex-col items-center pb-10">
					<article className="prose prose-lg text-white prose-h1:font-kallisto prose-h1:font-normal prose-h1:text-white prose-h3:text-gray-400 prose-a:text-blue-500 prose-strong:text-slate-700">
						<RichText content={content} components={components} />
					</article>
				</div>
			</div>
		</div>
	)
}

// build all the editable static pages ahead of time via github action.
// Enumerate every `page` collection entry so new Tina sections route automatically
// through this handler (which renders via RichText -> stream-safe links) without
// needing a new page file. Slugs served elsewhere are reserved to avoid colliding
// with the homepage (home.mdx -> `/`) and the dedicated about/contact page files.
export const getStaticPaths = async () => {
	const RESERVED = new Set(['home', 'about', 'contact'])

	const {data} = await client.queries.pageConnection()
	const paths = (data.pageConnection.edges || [])
		.map((edge) => edge.node._sys.filename)
		.filter((slug) => !RESERVED.has(slug))
		.map((slug) => ({params: {slug}}))

	return {
		paths,
		fallback: 'blocking',
	}
}

// get relevant content via graphql
export const getStaticProps = async (ctx) => {
	try{
		const {data, query, variables} = await client.queries.page({
		relativePath: ctx.params.slug + '.mdx',
		})
		// loads schedule data from csv file (via lib/schedule.js) if on programming page
		// otherwise schedule is null and WeeklySchedule component won't render!
		let schedule = null
		if (ctx.params.slug === 'programming') {
			schedule = await scheduleBuilder()
		}

		return {
			props: {
				data,
				query,
				variables,
				slug: ctx.params.slug,
				schedule,
			},
		}
	}catch (err) {
		// page not found in Tina => return 404
		return { notFound: true };
	}
}
