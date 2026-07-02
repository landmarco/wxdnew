import React, {useEffect, useRef, useState} from 'react'
import Link from 'next/link'
import photo from '../images/logo.png'
import Image from 'next/image'
import {AiOutlineMenu, AiOutlineClose} from 'react-icons/ai'
import {useAudio} from './AudioContext'

const Header = () => {
	const {isPlaying, togglePlayPause} = useAudio()

	const [isOpen, setIsOpen] = useState(false)
	const mobileNavRef = useRef(null)

	const closeMenu = () => {
		setIsOpen(false)
	}

	const toggleMenu = () => {
		setIsOpen((current) => !current)
	}

	// manages the closing behavior of the hamburger menu nav bar
	useEffect(() => {
		if (!isOpen) return

		const handleOutsideClick = (event) => {
			if (mobileNavRef.current?.contains(event.target)) return
			closeMenu()
		}

		document.addEventListener('mousedown', handleOutsideClick)
		document.addEventListener('touchstart', handleOutsideClick)

		return () => {
			document.removeEventListener('mousedown', handleOutsideClick)
			document.removeEventListener('touchstart', handleOutsideClick)
		}
	}, [isOpen])

	return (
		//Parent Container
		<div className="h-full">
			{/* MOBILE NAVBAR STARTS HERE */}
			<div
				ref={mobileNavRef}
				className="pointer-events-none fixed left-0 top-16 z-50 flex h-10 w-full items-center justify-end bg-transparent lg:hidden"
			>
				<div className="flex h-full flex-row items-center justify-end">
					{/* Hamburger icon */}
					<button
						type="button"
						onClick={toggleMenu}
						className="hamburger-icon duration-450 pointer-events-auto flex h-full w-16 items-center justify-center transition-all ease-in-out"
						aria-label={isOpen ? 'Close main menu' : 'Open main menu'}
					>
						{isOpen ? (
							<AiOutlineClose size={32} className="mt-1" aria-hidden="true" />
						) : (
							<AiOutlineMenu size={32} className="mt-1" aria-hidden="true" />
						)}
					</button>
				</div>

				{/* Collapsible menu for mobile*/}
				{isOpen && (
					<ul
						className="duration-450 pointer-events-auto fixed left-0 top-[104px] flex h-[calc(100vh-104px)] w-screen flex-col justify-start bg-black/90 backdrop-blur-md transition-all ease-in-out md:gap-6"
						onClick={closeMenu}
					>
						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Home
							</Link>
						</div>

						<div className="ml-10 mt-16 flex h-8 text-3xl">
							<Link
								href="/listen"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Listen
							</Link>
						</div>

						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/schedule"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Schedule
							</Link>
						</div>

						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/charts"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Charts
							</Link>
						</div>

						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/blog"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Blog
							</Link>
						</div>

						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/archive"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Archive
							</Link>
						</div>

						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/contact"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								Contact
							</Link>
						</div>

						<div className="ml-10 mt-8 flex h-8 text-3xl">
							<Link
								href="/about"
								legacyBehavior={false}
								className="cursor-pointer"
								rel="noopener noreferrer"
								onClick={closeMenu}
							>
								About
							</Link>
						</div>

						{/* Add more navigation links as needed */}
					</ul>
				)}
			</div>

			{/* Makes the mobile navbar overlap the rest of the header content */}
			<div className="relative z-20">
				{/* END MOBILE NAVBAR */}


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
