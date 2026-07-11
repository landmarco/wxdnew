import {AiFillInstagram, AiFillTwitterCircle} from 'react-icons/ai'
// import {FaTiktok} from 'react-icons/fa'
// import {FaBluesky} from 'react-icons/fa6'
// import {BsSpotify} from 'react-icons/bs'
import {FiMail} from 'react-icons/fi'

import applebadge from '/images/apple_badge.svg'
import androidbadge from '/images/android_badge.svg'
import Image from 'next/image'
import {FaPhone} from 'react-icons/fa6'

import {AiFillGithub} from 'react-icons/ai'
import {FaTumblr, FaBandcamp} from "react-icons/fa6";
import {useAudio} from './AudioContext'
import {useModal} from './ModalContext'
import {useBackground} from './BackgroundContext'
import Emerald from './Emerald'
import CDLink from './homepage/CDLink'
import {NAV_ITEMS, cdImageFor} from '../lib/navItems'

const Footer = () => {
	const {isHighQuality, setHighQuality, isPlaying} = useAudio()
	const {openModal} = useModal()
	const {backgroundEnabled, toggleBackground} = useBackground()
	// Shared look for the footer action buttons — a bordered box rather than an
	// underlined link, so they read as buttons.
	const actionButtonClass =
		'rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
	return (
		// Footer is formatted as a column on phone screen and as a row on tablet+desktop screens
		<footer className="mx-auto mb-3 mt-10 px-2 lg:mt-36 lg:px-24">
			{/* CD nav: one tile per header tab, so the whole site stays reachable
			    from the bottom of the page even without the header or swipe menu.
			    Images cycle through the CD pool, so new tabs need no new artwork. */}
			<nav aria-label="Site navigation" className="mb-10 border-b border-gray-700 pb-8">
				<ul className="flex flex-wrap items-start justify-center gap-x-4 gap-y-6 sm:gap-x-8">
					{NAV_ITEMS.map((item, index) => (
						<li key={item.href}>
							<CDLink
								href={item.href}
								label={item.label}
								image={cdImageFor(index)}
								boxClassName="w-20 h-20 lg:w-24 lg:h-24"
								labelClassName="text-sm"
							/>
						</li>
					))}
				</ul>
			</nav>

			<div className="flex flex-col md:flex-row md:justify-around">
			<div className=" px-5">
				<p className=" text-lg font-bold md:text-xl">Connect</p>
				<div className="mt-2 flex w-full items-start justify-start gap-8 pb-5 lg:gap-10">
						{/* Icon-only links need labels for assistive tech. */}
						<a target="_blank" rel="noopener noreferrer" href="https://instagram.com/wxdu" aria-label="WXDU Instagram">
							<AiFillInstagram size={32} className=" mt-0.5" />
						</a>
					{/* <a target="_blank" href="https://bsky.app/profile/wxyc.org">
						<FaBluesky size={32} className="ml-.5 mt-0.5" />
					</a>
					<a target="_blank" href="https://tiktok.com/@wxyc893">
						<FaTiktok size={32} className="ml-.5 mt-0.5" />
					</a>
					<a target="_blank" href="https://open.spotify.com/user/wxyc">
						{' '}
						<BsSpotify size={32} className="ml-;5 mt-0.5" />
					</a> */}
						<a target="_blank" rel="noopener noreferrer" href="https://github.com/wxdu" aria-label="WXDU GitHub">
							<AiFillGithub size={32} className="ml-.5 mt-0.5" />
						</a>
						<a target="_blank" rel="noopener noreferrer" href="https://wxduarchive.tumblr.com/" aria-label="WXDU Tumblr archive">
							<FaTumblr size={32} className="ml-.5 mt-0.5" />
						</a>
						<a target="_blank" rel="noopener noreferrer" href="https://wxdu.bandcamp.com/" aria-label="WXDU Bandcamp">
							<FaBandcamp size={32} className="ml-.5 mt-0.5" />
						</a>
				</div>
				<div className="mt-1 flex flex-col items-start gap-2">
					<button
						type="button"
						onClick={() => openModal('feedback')}
						className={actionButtonClass}
					>
						submit a bug report/feedback
					</button>
					<button
						type="button"
						onClick={toggleBackground}
						aria-pressed={!backgroundEnabled}
						className={actionButtonClass}
					>
						{backgroundEnabled ? 'banish the background' : 'bring back the background'}
					</button>
				</div>
			</div>

			{/* <div className="flex flex-col px-5">
				<p className=" w-5/6 text-lg font-bold md:text-xl">Listen</p>
				<div className=" flex items-center justify-start gap-4 ">
					<a
						target="_blank"
						href="https://play.google.com/store/apps/details?id=org.wxyc.WXYCCH&pcampaignid=web_share"
						className="w-36"
					>
						<Image
							src={androidbadge}
							alt="Link to the WXYC Android mobile app"
						/>
					</a>

					<div className="w-36 md:ml-10">
						<a
							target="_blank"
							href="https://apps.apple.com/us/app/wxyc-radio/id353182815"
						>
							<Image src={applebadge} alt="Link to the WXYC Apple mobile app" />
						</a>
					</div>
				</div>
			</div> */}

			<div className="px-5 md:max-w-md">
				<p className="text-lg font-bold md:text-xl">WXDU&apos;s Mission</p>
				<p className="mt-2 text-sm leading-relaxed text-gray-300">
					WXDU, as a member of the Duke University Union, exists to inform,
					educate, and entertain both the students of Duke University and the
					surrounding community of Durham through quality progressive alternative
					radio programming. WXDU seeks to give its staff the freedom to pursue
					their personal aesthetic within the framework of a cohesive format.
					WXDU aims to provide the listener with an alternative viewpoint
					untainted by commercial interests. WXDU resolves to maintain good
					relations with the music industry without compromising its integrity
					and nationally recognized commitment to quality programming. WXDU
					resolves to remain a laboratory where all members are free to make and
					learn from their mistakes.
				</p>
			</div>

			<div className="px-5">
				<p className="text-lg font-bold md:text-xl">Contact</p>

					<a target="_blank" rel="noopener noreferrer" href="mailto:gm@wxdu.org" className="mt-2 flex items-center">
					<FiMail size={20} className="mr-2" aria-hidden="true" />
					<span>gm@wxdu.org</span>
				</a>
				<a target="_blank" rel="noopener noreferrer" href="tel:9196848870" className="mt-2 flex items-center">
					<FaPhone size={20} className="mr-2" aria-hidden="true" />
					<span>(919) 684-8870</span>
				</a>

				<p className="mt-5">
					WXDU 88.7FM <br></br>
					PO Box 90687 <br></br>
					2020 Campus Drive <br></br>
					Durham, NC 27708
				</p>

				<a target="_blank" rel="noopener noreferrer" href="https://publicfiles.fcc.gov/fm-profile/wxdu" className="mt-4 inline-block underline hover:no-underline">
					View the WXDU Public File
				</a>

				{isHighQuality && (
					<div className="mt-4">
						<Emerald size={72} animated={isPlaying} onClick={() => setHighQuality(false)} label="Revert to standard quality stream" />
					</div>
				)}
			</div>
			</div>
		</footer>
	)
}

export default Footer
