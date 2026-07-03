import Link from 'next/link'
import Image from 'next/image'

// Reusable CD component, which takes an image, label, and link destination as
// props. `boxClassName` / `labelClassName` let callers resize it — the defaults
// are the large homepage tiles; the footer nav passes smaller ones.
const CDLink = ({
    image,
    label,
    href,
    boxClassName = 'w-28 h-28 lg:w-64 lg:h-64',
    labelClassName = 'text-xs',
}) => {
    return (
        // Render a real anchor so keyboard + screen-reader navigation is consistent.
        <Link href={href} legacyBehavior>
            <a className="flex flex-col items-center cursor-pointer group">
                <div className={`${boxClassName} relative overflow-hidden`}>
                    <Image
                        src={image}
                        alt={label}
                        layout="fill"
                        // cover the box at any size without distorting the CD art
                        objectFit="cover"
                        className="group-hover:opacity-80 transition-opacity"
                    />
                </div>
                <p className={`kallistobold text-white ${labelClassName} mt-1 group-hover:text-red-400 transition-colors`}>
                    {label}
                </p>
            </a>
        </Link>
    )
}

export default CDLink
