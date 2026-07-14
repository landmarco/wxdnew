import Head from 'next/head'
import Header from './Header'
import Footer from './Footer'
import MobileTopBar from './MobileTopBar'
import { NavDrawerProvider } from './NavDrawerContext'

export const Layout = (props) => {
	return (
		<NavDrawerProvider>
			<div>
			<Head>
				<title>WXDU</title>
				<meta
					name="description"
					content="Duke and Durham's alternative, non-commercial radio station"
				/>

				{/* app download banner on iphone */}
				<meta name="apple-itunes-app" content="app-id=353182815" />
			</Head>

				<header className="header">
					<Header />
				</header>

				{/* Main skip-link target for keyboard users. */}
				{/* On mobile the fixed top player is 64px (h-16) tall. Desktop nav is in-flow. */}
				<main id="main-content" tabIndex="-1" className="pt-16 lg:pt-0">
					{/* Mobile hamburger + search: in normal flow (scrolls away), just
					    under the fixed player. Desktop uses the header navbar instead. */}
					<MobileTopBar />
					{props.children}
				</main>
				<Footer />
			</div>
		</NavDrawerProvider>
		)
	}
