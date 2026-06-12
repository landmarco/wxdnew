import NavDropdown from './NavDropdown'

const items = [
	{href: 'https://stream.wxdu.art/wxdu192.mp3', label: 'Stream', external: true},
	{href: 'https://stream.wxdu.art/wxdu128.ogg', label: 'Stream (ogg)', external: true},
	{href: 'https://wxdu.org/plmanager/world/currentplaylist.php', label: 'Live playlist', external: true},
	{href: 'https://archive.wxyc.org', label: 'Archive', external: true},
]

const DropdownMenu = () => {
	return <NavDropdown label="Listen" items={items} />
}

export default DropdownMenu
