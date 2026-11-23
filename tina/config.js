import {defineConfig, defineSchema} from 'tinacms'

// Side-effect import: patches Tina's media store to downscale images in the
// browser before they're uploaded. See tina/shrinkUploads.js for why it's done
// this way rather than via loadCustomStore.
import './shrinkUploads.js'

// Adds the "Schedule" screen to the admin sidebar: the /fix-schedule-grid
// editor with a Save button that writes public/uploads/schedule.csv.
import {scheduleScreenPlugin, announceScheduleScreen} from './scheduleScreen.jsx'

import collectionPage from './collections/page.js'
import collectionBlog from './collections/blog.js'
import collectionArchive from './collections/archive.js'
import collectionCategory from './collections/category.js'
import collectionContacts from './collections/contacts.js'

const schema = defineSchema({
	collections: [
		collectionPage,
		collectionBlog,
		collectionArchive,
		collectionCategory,
		collectionContacts,
	],
})

export const config = defineConfig({
	clientId: process.env.TINA_PUBLIC_CLIENT_ID,
	branch: 'main',
	token: process.env.TINA_TOKEN,
	cmsCallback: (cms) => {
		cms.plugins.add(scheduleScreenPlugin)
		announceScheduleScreen(cms)
		return cms
	},
	media: {
		tina: {
			publicFolder: 'public',
			mediaRoot: 'uploads',
		},
	},
	search: {
		tina: {
			indexerToken: process.env.SEARCH_TOKEN,
			stopwordLanguages: ['eng'],
		},
		indexBatchSize: 100,
		maxSearchIndexFieldLength: 100,
	},
	build: {
		publicFolder: 'public', // The public asset folder for your framework
		outputFolder: 'admin', // within the public folder
	},
	schema,
})

export default config
