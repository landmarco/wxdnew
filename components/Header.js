import React from 'react'
import Link from 'next/link'
import photo from '../images/logo.png'
import Image from 'next/image'
import {useAudio} from './AudioContext'
import MobileNavDrawer from './MobileNavDrawer'

const Header = () => {
	const {isPlaying, togglePlayPause} = useAudio()

	return (
		//Parent Container
		<div className="h-full">
			{/* Mobile navigation: an edge-swipe drawer replaces the hamburger menu. */}
			<MobileNavDrawer />

			<div className="relative z-20">

				{/* Parent container of web navbar */}
				<div className="mb-20 hidden w-full lg:flex mt-10">
					{/* Actual navbar */}
					<div className="flex h-14 w-full flex-row justify-between bg-black px-1 py-4 ">
							{/* Logo and player*/}
							<div className="my-auto flex flex-row">
								{/* Clicking the logo starts/stops the stream, like the WXDU logos on the homepage. */}
								<button
									type="button"
									onClick={togglePlayPause}
									aria-label={isPlaying ? 'Pause WXDU stream' : 'Play WXDU stream'}
									title={isPlaying ? 'Pause stream' : 'Play stream'}
									className="my-auto ml-10 flex h-10 w-28 cursor-pointer border-0 bg-transparent p-0"
								>
									<Image src={photo} alt="WXDU logo" />
								</button>
							</div>

						{/* Links*/}
						<div className="my-auto flex w-1/2 flex-row">
							<Link href="/" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Home
							</Link>

							<Link href="/listen" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Listen
							</Link>

							<Link href="/schedule" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Schedule
							</Link>

							<Link href="/charts" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Charts
							</Link>

							<Link href="/blog" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Blog
							</Link>

							<Link href="/archive" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Archive
							</Link>

							<Link href="/contact" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								Contact
							</Link>

							<Link href="/about" legacyBehavior={false} className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300">
								About
							</Link>

						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default Header
