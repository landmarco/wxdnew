import EventPreview from '../../components/EventPreview'
import {client} from '../../tina/__generated__/client'
import {
	groupEventsByWeek,
	generateStructuredData,
} from '../../components/OrganizingArchive'
// import LazyLoad from 'react-lazyload';
// import ArchiveDropdown from '../../components/DropdownArchive'
import ArchiveLayout from '../../components/ArchiveLayout'
// import photo from '/images/crowd.webp'
// import mobilephoto from '/images/crowdmobile.webp'
// import Image from 'next/image'
import React, {useState} from 'react'
import SeeMoreButton from '../../components/SeeMoreButton'
import Link from 'next/link'

// archive home page
export default function EventList(props) {
	const [eventsToShow, setEventsToShow] = useState(20)

	const loadMoreEvents = () => {
		setEventsToShow(eventsToShow + 20)
	}

	const eventsList = props.data.archiveConnection.edges
	const groupedEvents = groupEventsByWeek(eventsList)
	const structuredData = generateStructuredData(groupedEvents)

	// Only feeds the commented-out Filter dropdown below. The categoryConnection
	// query in getStaticProps is left in place so restoring the dropdown is a
	// matter of uncommenting, with no query changes.
	// let specialtyShows = []
	// props.data.categoryConnection.edges.forEach((category) => {
	// 	specialtyShows.push({
	// 		label: category.node.title,
	// 		value: category.node._sys.filename,
	// 	})
	// })

	return (
		<ArchiveLayout>
			<div className="relative z-10 -mt-2 flex w-full flex-col items-center justify-between md:w-5/6 md:flex-row">
				<div className="relative z-20 mt-5 text-sm md:text-base">
						Coming soon: an archive of WXDU&apos;s activities from our 75+ years as a
						radio station. Watch this space!
						{/* Blank line before the old-site pointer: two <br>s, since this block
						    is a plain text run rather than separate <p>s. */}
						<br></br>
						<br></br>
						Miss our old site? We loved it too! You can go back whenever by
						visiting{' '}
						<a href="https://old.wxdu.org" className="underline">
							old.wxdu.org
						</a>
						{'.'}
						{/* Hidden until there is enough in the archive to be worth browsing. Both
						    destinations still exist and still build, so this is uncommenting when
						    ready. Use Link for internal nav to preserve SPA navigation + semantics. */}
						{/* <br></br>
						<Link href="/schedule" className="underline">
							Learn more about WXDU&apos;s specialty programming
						</Link>
						{"."}
						<br></br>
						<Link href="/archive/legacy" className="underline">
							Browse historical collections
						</Link>
						{"."} */}
						{/* Restore alongside the links above when the archive opens up. */}
						{/* <br></br>
						If you would like to help us build this out, contact our computing
						team at{" "}
						<a href="mailto:computing@wxdu.org" className="underline">
							computing@wxdu.org
						</a>
						{"."} */}
				</div>
				{/* Filter dropdown — hidden for now. Uncomment this along with the
				    ArchiveDropdown import and the specialtyShows list above to bring
				    it back. */}
				{/* <div className="mt-3">
					<ArchiveDropdown specialtyShows={specialtyShows} />
				</div> */}
			</div>

			{/* Banner image — hidden until images/crowd.webp and images/crowdmobile.webp
			    are replaced with a WXDU asset. Restore this along with the photo,
			    mobilephoto and next/image imports at the top of the file, and make sure
			    the replacements are pre-sized per the image standard in CLAUDE.md. */}
			{/* Desktop banner image */}
			{/* <div className="relative z-5 -mt-10 hidden md:block">
				<Image src={photo} alt="A crowded dancefloor at a WXDU event." />
			</div> */}

			{/* Mobile banner image */}
			{/* <div className="relative z-10 -mt-10 md:hidden">
				<Image src={mobilephoto} alt="A crowded dancefloor at a WXDU event." />
			</div> */}

			<div className="archive-grid mx-auto lg:max-w-screen-xl">
				{structuredData.slice(0, eventsToShow).map((event) => (
					<div key={event.id}>
						{event.type === 'heading' && (
							<p className="mb-2 mt-10 text-3xl font-bold">
								Week of {event.weekStartDate}
							</p>
						)}
						{event.type === 'events' && (
							// needs unique key somehow
							<div>
								{event.weekEvents && (
									<div className="bg scrollbar flex flex-row justify-start gap-2 overflow-x-auto md:gap-4">
										{event.weekEvents.map((event) => (
											<div key={event.event.id}>
												{/* <LazyLoad height={200} once={true}> */}
												<EventPreview
													id={event.event.id}
													title={event.event.title}
													cover={event.event.cover}
													subtitle={event.event.description.children[0].children[0].text.substring(
														0,
														75
													)}
													slug={event.event._sys.filename}
												/>
												{/* </LazyLoad> */}
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>

			{eventsToShow < structuredData.length && (
				<SeeMoreButton onClick={loadMoreEvents} />
			)}
		</ArchiveLayout>
	)
}

export const getStaticProps = async () => {
	const currentDateTime = new Date()
	const endOfWeek = new Date(
		currentDateTime.getFullYear(),
		currentDateTime.getMonth(),
		currentDateTime.getDate() + (6 - currentDateTime.getDay())
	)

	const length = await client.request({
		query: `{
      archiveConnection {
        totalCount
      }
    }
    `,
	})

	const {data} = await client.request({
		query: `
    query getContent($eventCount: Float, $endOfWeek: String)
    {
      archiveConnection(filter: {published: {before: $endOfWeek}}, sort: "published", last: $eventCount, before: "cG9zdCNkYXRlIzE2NTc4Njg0MDAwMDAjY29udGVudC9wb3N0cy9hbm90aGVyUG9zdC5qc29u"){
        edges {
          node {
            id
            title
            cover
            published
            description
            _sys {
              filename
            }
          }
        }
      },
      categoryConnection(filter: {specialtyShow: { eq:true}}) {
        edges {
          node {
            id
            title
            _sys {
              filename
            }
          }
        }
      }
    }
    `,
		variables: {
			eventCount: length.data.archiveConnection.totalCount,
			endOfWeek: endOfWeek.toDateString(),
		},
	})

	return {
		props: {
			data,
		},
	}
}
