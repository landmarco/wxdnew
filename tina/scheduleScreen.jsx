// "Schedule" entry in the Tina admin sidebar (under Site).
//
// Shows the /fix-schedule-grid editor in a frame and gives it a Save button
// that writes public/uploads/schedule.csv directly. That means editors don't
// download the CSV and re-upload it by hand. This is also how editors find
// the grid at all: it's deliberately not linked from the public site (and is
// disallowed in robots.txt), so the admin sidebar is the way in.
//
// Saving goes through cms.media.persist, the same call the Media Manager makes
// for an upload, so it's one commit by the logged-in editor. Uploading to an
// existing path replaces that file. Tina's media store wrapper in
// shrinkUploads.js passes non-images straight through, so the CSV isn't
// touched on the way.
//
// See lib/schedule/scheduleBridge.js for the message protocol.

import React, {useCallback, useEffect, useRef} from 'react'
import {useCMS} from 'tinacms'
import {BRIDGE, EMBED_PATH, SCHEDULE_FILE} from '../lib/schedule/scheduleBridge.js'

function ScheduleIcon(props) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="3" y="4" width="18" height="17" rx="2" />
			<path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2" />
		</svg>
	)
}

function ScheduleScreen() {
	const cms = useCMS()
	const frame = useRef(null)

	const send = useCallback((data) => {
		frame.current?.contentWindow?.postMessage(data, window.location.origin)
	}, [])

	useEffect(() => {
		const onMessage = async (event) => {
			// only the page in our own frame, served from this site
			if (event.source !== frame.current?.contentWindow) return
			if (event.origin !== window.location.origin) return
			const msg = event.data
			if (!msg || typeof msg !== 'object') return

			if (msg.type === BRIDGE.hello) {
				send({type: BRIDGE.ready})
				return
			}
			if (msg.type !== BRIDGE.save) return

			try {
				if (typeof msg.csv !== 'string' || !msg.csv.trim()) {
					throw new Error('The schedule was empty, so nothing was saved.')
				}
				const file = new File([msg.csv], SCHEDULE_FILE, {type: 'text/csv'})
				// directory '' is the media root, i.e. public/uploads
				const saved = await cms.media.persist([{directory: '', file}])
				// persist resolves to [] when the upload didn't happen (signed out,
				// or a branch prompt was cancelled), so an empty result isn't a save
				if (!Array.isArray(saved) || saved.length === 0) {
					throw new Error('Tina didn’t save the file. Check you’re still logged in and try again.')
				}
				send({type: BRIDGE.saved, id: msg.id, ok: true})
			} catch (err) {
				send({type: BRIDGE.saved, id: msg.id, ok: false, error: String(err?.message || err)})
			}
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [cms, send])

	return (
		<iframe
			ref={frame}
			src={EMBED_PATH}
			title="Schedule editor"
			// the page asks with `hello` once it's mounted; announcing on load as
			// well covers a hello that went out before this listener existed
			onLoad={() => send({type: BRIDGE.ready})}
			style={{display: 'block', flex: 1, width: '100%', minHeight: 'calc(100vh - 5rem)', border: 0}}
		/>
	)
}

// After login Tina opens straight into visual editing of the homepage, with the
// sidebar (and so the Schedule entry) folded away behind the ☰ menu. This puts
// a direct link in front of the editor once per browser session instead.
// Tina's info toasts render plain text and auto-link URLs (opening them in a
// new tab), so the link has to be a full URL rather than a custom component.
const NOTICE_KEY = 'wxdu:schedule-notice-shown'

export function announceScheduleScreen(cms) {
	let shown = false
	const show = () => {
		if (shown) return
		shown = true
		try {
			if (window.sessionStorage.getItem(NOTICE_KEY)) return
			window.sessionStorage.setItem(NOTICE_KEY, '1')
		} catch {
			// no storage: show it anyway, it just may repeat on reload
		}
		if (window.location.hash.includes('/screens/schedule')) return
		const url = `${window.location.origin}${window.location.pathname}#/screens/schedule`
		cms.alerts.info(`Editing the DJ schedule? Open the schedule editor: ${url}  (also in the ☰ menu → Schedule)`, 20000)
	}
	// cms:login is a fresh sign-in; cms:enable also covers returning with a live session
	cms.events.subscribe('cms:login', show)
	cms.events.subscribe('cms:enable', show)
	if (cms.enabled) show()
}

// Registered from cmsCallback in tina/config.js. Same shape as Tina's own
// screens (createScreen isn't exported, and this is all it builds). The name
// sets the sidebar label and the URL: /admin/#/screens/schedule
export const scheduleScreenPlugin = {
	__type: 'screen',
	name: 'Schedule',
	Icon: ScheduleIcon,
	layout: 'fullscreen',
	navCategory: 'Site',
	Component: ScheduleScreen,
}
