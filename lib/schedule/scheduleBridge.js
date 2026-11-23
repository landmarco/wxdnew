// Message protocol between the Tina admin's "Schedule" screen
// (tina/scheduleScreen.jsx) and the /fix-schedule-grid page it embeds.
//
// The grid page is a plain static page with no login of its own, so it can't
// commit anything. Inside the admin it runs in an iframe, and the screen around
// it holds the editor's Tina session. Save hands the CSV up to the screen,
// which writes it through Tina's media store, the same path as a manual upload
// in the Media Manager. No token or server code is involved.
//
// Both sides only accept messages from the other's window and from this site's
// own origin. Keep this file dependency-free: the Tina admin bundle (built by
// the Tina CLI, not Next) imports it too, so no `@/` aliases.

export const SCHEDULE_FILE = 'schedule.csv'

// the grid page, flagged so it knows to look for the admin around it
export const EMBED_PATH = '/fix-schedule-grid/?tina=1'

export const BRIDGE = {
	hello: 'wxdu-schedule:hello', // page -> screen: "is anyone there?"
	ready: 'wxdu-schedule:ready', // screen -> page: "yes, Save is available"
	save: 'wxdu-schedule:save', // page -> screen: { id, csv }
	saved: 'wxdu-schedule:saved', // screen -> page: { id, ok, error? }
}
