import {Menu} from '@headlessui/react'
import Link from 'next/link'
import {IoIosArrowDown} from 'react-icons/io'

const buttonClass = 'inline-flex h-full items-center w-full justify-center text-white hover:text-blue-300'
const menuClass = 'outline-t-2 outline-t-black absolute left-1/2 mt-4 w-32 origin-top -translate-x-1/2 transform bg-black shadow-lg ring-1 ring-black ring-opacity-5'
const itemClass = 'text-medium flex w-full items-center justify-center rounded-md px-4 py-2 text-white hover:text-blue-300'

const NavDropdown = ({label, items}) => {
  return (
    <div>
      <Menu as="div" className="relative">
        <Menu.Button className={buttonClass}>
          {label} <IoIosArrowDown size={18} className="ml-1 mt-1" />
        </Menu.Button>
        <Menu.Items className={menuClass}>
          {items.map((item) => (
            <div key={item.label} className={itemClass}>
              <Menu.Item>
                {item.external ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                ) : (
                  <Link href={item.href}>{item.label}</Link>
                )}
              </Menu.Item>
            </div>
          ))}
        </Menu.Items>
      </Menu>
    </div>
  )
}

export default NavDropdown
