import React from 'react'
import '/styles/globals.css'
import {Layout} from '../components/Layout'
import {PostHogProvider} from 'posthog-js/react'
import {useEffect} from 'react'
import {Router} from 'next/router'
import posthog from 'posthog-js'
import { AudioProvider } from '../components/AudioContext'
import { ModalProvider } from '../components/ModalContext'
import NavPlayer from '../components/audioplayers/NavPlayer'
import DJRequestWidget from '../components/DJRequestWidget'
import FeedbackWidget from '../components/FeedbackWidget'
import KeyboardShortcutsHint from '../components/KeyboardShortcutsHint'

const App = ({Component, pageProps}) => {
	useEffect(() => {
		posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
			api_host:
				process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
			person_profiles: 'identified_only',
			// Enable debug mode in development
			loaded: (posthog) => {
				if (process.env.NODE_ENV === 'development') posthog.debug()
			},
		})

		const handleRouteChange = () => posthog?.capture('$pageview')

		Router.events.on('routeChangeComplete', handleRouteChange)

		return () => {
			Router.events.off('routeChangeComplete', handleRouteChange)
		}
	}, [])
	return (
		<PostHogProvider client={posthog}>
			<AudioProvider>
				<ModalProvider>
					<div className="flex flex-col lg:items-center">
						{/* overflow-x-clip (not overflow-hidden) prevents a horizontal
						    scrollbar from full-bleed sections WITHOUT making this a scroll
						    container — otherwise it, not the viewport, would anchor every
						    position:sticky descendant (e.g. the schedule's day headers) and
						    they'd never stick on page scroll. */}
						<div className="m-0 flex h-full w-full flex-col overflow-x-clip bg-black font-courierprime text-base text-white">
							{/* First-focus overlay: shows keyboard shortcuts + the
							    skip-to-main-content link on the initial Tab press. */}
							<KeyboardShortcutsHint />
							<NavPlayer />
							<Layout>
								<Component {...pageProps} />
							</Layout>
						</div>
					</div>
					<DJRequestWidget />
					<FeedbackWidget />
				</ModalProvider>
			</AudioProvider>
		</PostHogProvider>
	)
}

export default App
