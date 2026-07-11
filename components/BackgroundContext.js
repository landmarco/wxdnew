import React, { createContext, useContext, useEffect, useState } from 'react'

// Site-wide toggle for the animated background graphic, so a footer button can turn it
// off (and back on) and the choice sticks across visits. Persisted to localStorage.
const BackgroundContext = createContext()

const STORAGE_KEY = 'wxdu-background-enabled'

export const BackgroundProvider = ({ children }) => {
    // Default on, matching the server-rendered HTML. The stored preference is read after
    // mount (below) rather than in the initializer so the first client render agrees with
    // SSR and doesn't trip a hydration mismatch — localStorage isn't available server-side.
    const [enabled, setEnabled] = useState(true)

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY)
            if (stored !== null) setEnabled(stored === 'true')
        } catch {
            // Private mode / disabled storage — just keep the default.
        }
    }, [])

    const toggleBackground = () => {
        setEnabled((prev) => {
            const next = !prev
            try {
                window.localStorage.setItem(STORAGE_KEY, String(next))
            } catch {
                // Non-fatal: the toggle still works for this session.
            }
            return next
        })
    }

    return (
        <BackgroundContext.Provider value={{ backgroundEnabled: enabled, toggleBackground }}>
            {children}
        </BackgroundContext.Provider>
    )
}

export const useBackground = () => useContext(BackgroundContext)
