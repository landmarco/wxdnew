// This component is the dropdown menu in the nav bar that contains different information about the station

import React, {forwardRef} from 'react'
import {Menu} from '@headlessui/react'
import Link from 'next/link'
import {IoIosArrowDown} from 'react-icons/io'

const menuItemClass =
    'text-medium flex w-full items-center justify-center rounded-md px-4 py-2 text-white hover:text-blue-300'

const MenuLink = forwardRef(({href, children, ...props}, ref) => (
    <Link href={href} passHref legacyBehavior>
        <a ref={ref} {...props}>
            {children}
        </a>
    </Link>
))

MenuLink.displayName = 'MenuLink'

const StationInfoDropdownMenu = ({onNavigate}) => {
    return (
        <div>
            <Menu as="div" className="relative">
                <Menu.Button className="inline-flex w-full justify-center text-white  hover:text-blue-300">
                    Station Info <IoIosArrowDown size={18} className="ml-1 mt-1" aria-hidden="true" />
                </Menu.Button>
                <Menu.Items className="outline-t-2 outline-t-2 outline-t-black absolute left-1/2 mt-4 w-32 origin-top -translate-x-1/2 transform bg-black shadow-lg ring-1 ring-black ring-opacity-5 ">
                    <Menu.Item
                        as={MenuLink}
                        href="/about"
                        onClick={onNavigate}
                        className={menuItemClass}
                    >
                        About
                    </Menu.Item>

                    <Menu.Item
                        as={MenuLink}
                        href="/contact"
                        onClick={onNavigate}
                        className={menuItemClass}
                    >
                        Contact
                    </Menu.Item>
                </Menu.Items>
            </Menu>
        </div>
    )
}

export default StationInfoDropdownMenu
