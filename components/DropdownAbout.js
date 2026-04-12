import NavDropdown from './NavDropdown'

const items = [
	{href: '/about', label: 'About Us', external: false},
	{href: '/faq', label: 'FAQ', external: false},
]

const DropdownAbout = () => {
	return <NavDropdown label="About" items={items} />
}

export default DropdownAbout
