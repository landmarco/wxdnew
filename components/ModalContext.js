import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

// Coordinates which site-wide modal is currently open so that anything — a footer
// link, a floating button, or a global keyboard shortcut — can open or close it.
// Also hosts the "p" (phone in a request) and "f" (feedback) hotkeys, mirroring the
// "k"/"r"/"e" audio hotkeys in AudioContext.
const ModalContext = createContext()

export const ModalProvider = ({ children }) => {
    // null | 'dj' | 'feedback'
    const [activeModal, setActiveModal] = useState(null)

    // Keep the latest setter in a ref so the global key listener (bound once)
    // never goes stale.
    const setActiveModalRef = useRef(setActiveModal)
    setActiveModalRef.current = setActiveModal

    // Global hotkeys: "p" opens the DJ request ("phone in a request") modal, "f"
    // opens feedback. Ignored while the user is typing in a field or holding a
    // modifier, so they never hijack text entry or browser shortcuts (e.g. Ctrl/Cmd+F find).
    useEffect(() => {
        const handleKeyDown = (event) => {
            const key = event.key.toLowerCase()
            if (key !== 'p' && key !== 'f') return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            const el = event.target
            const tag = el?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
            event.preventDefault()
            setActiveModalRef.current(key === 'p' ? 'dj' : 'feedback')
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [])

    const openModal = (name) => setActiveModal(name)
    const closeModal = () => setActiveModal(null)

    return (
        <ModalContext.Provider value={{ activeModal, openModal, closeModal }}>
            {children}
        </ModalContext.Provider>
    )
}

export const useModal = () => useContext(ModalContext)
