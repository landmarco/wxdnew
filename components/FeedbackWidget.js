import React, {useState, useEffect, useRef} from 'react'
import { apiFetch } from '../lib/api'
import { useModal } from './ModalContext'
import { useAudio } from './AudioContext'

const COOLDOWN_SECONDS = 60
const COOLDOWN_KEY = 'feedback_cooldown_until' // localStorage key for persisting cooldown across page refreshes
const REPO_URL = 'https://github.com/landmarco/wxdnew'

// Build a curated, non-sensitive diagnostics snapshot to help the computing team
// reproduce a report. Deliberately excludes cookies/localStorage and anything
// secret — just environment + current player state. Best-effort: any failure
// yields null so it can never block a submission.
function collectClientInfo(audio) {
    if (typeof window === 'undefined') return null
    try {
        return {
            url: window.location.href,
            referrer: document.referrer || null,
            userAgent: navigator.userAgent,
            language: navigator.language,
            viewport: { w: window.innerWidth, h: window.innerHeight },
            screen: { w: window.screen?.width, h: window.screen?.height, dpr: window.devicePixelRatio },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            online: navigator.onLine,
            // Player state — the most useful signal for stream bug reports.
            player: {
                isPlaying: audio?.isPlaying ?? null,
                isHighQuality: audio?.isHighQuality ?? null,
                isStalled: audio?.isStalled ?? null,
                isRejoining: audio?.isRejoining ?? null,
                isPreloading: audio?.isPreloading ?? null,
            },
            capturedAt: new Date().toISOString(),
        }
    } catch {
        return null
    }
}

// Modal-only widget (no floating button): opened from the footer link or the "f"
// hotkey via ModalContext. Mirrors DJRequestWidget's modal shell, focus trap,
// cooldown, and status messaging, but routes free-text feedback to the computing
// team's /api/feedback endpoint instead of the on-air DJ.
export default function FeedbackWidget() {
    const { activeModal, closeModal } = useModal()
    const isOpen = activeModal === 'feedback'
    const audio = useAudio()

    const [text, setText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState(null)
    const [cooldownRemaining, setCooldownRemaining] = useState(0)
    const timerRef = useRef(null)
    const modalRef = useRef(null)
    const closeButtonRef = useRef(null)

    // on mount: restore any active cooldown from a previous submission
    useEffect(() => {
        const stored = localStorage.getItem(COOLDOWN_KEY)
        if (stored) {
            const remaining = Math.ceil((parseInt(stored) - Date.now()) / 1000)
            if (remaining > 0) setCooldownRemaining(remaining)
        }
    }, [])

    // tick the countdown timer down every second while a cooldown is active
    useEffect(() => {
        if (cooldownRemaining <= 0) {
            clearInterval(timerRef.current)
            return
        }
        timerRef.current = setInterval(() => {
            setCooldownRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timerRef.current)
    }, [cooldownRemaining > 0])

    // Keep keyboard focus inside the modal and support Escape to close.
    useEffect(() => {
        if (!isOpen) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        closeButtonRef.current?.focus()

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeModal()
                return
            }

            if (event.key !== 'Tab' || !modalRef.current) return

            const focusable = modalRef.current.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
            if (!focusable.length) return

            const first = focusable[0]
            const last = focusable[focusable.length - 1]

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = previousOverflow
        }
    }, [isOpen, closeModal])

    const handleSend = async () => {
        if (cooldownRemaining > 0) return
        const trimmed = text.trim()
        if (!trimmed) return
        setIsLoading(true)
        setStatus(null)

        try {
            // POST to the external API — throws on any non-2xx response (including 429)
            await apiFetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: trimmed, client_info: collectClientInfo(audio) })
            })

            setStatus('success')
            setText('')
            const until = Date.now() + COOLDOWN_SECONDS * 1000
            localStorage.setItem(COOLDOWN_KEY, until.toString())
            setCooldownRemaining(COOLDOWN_SECONDS)

        } catch (error) {
            // 429 = server-side rate limit hit; anything else is a generic failure
            setStatus(error.status === 429 ? 'ratelimit' : 'error')
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
            onClick={closeModal}
        >
            {/* Dialog semantics are required for screen readers. */}
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="feedback-title"
                className="w-96 rounded-lg bg-zinc-900 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="mb-4 flex items-center justify-between">
                    <h2 id="feedback-title" className="font-courierprime text-lg font-bold text-white">Send Feedback</h2>
                    <button
                        ref={closeButtonRef}
                        className="text-gray-400 hover:text-white"
                        onClick={closeModal}
                        aria-label="Close feedback modal"
                    >
                        ✕
                    </button>
                </div>

                <p className="font-courierprime mb-4 text-sm leading-relaxed text-gray-300">
                    Please let us know what bug you found, what could be better, or what you think
                    we&apos;re doing well. This will go to our computing team - if you would like to
                    send a message to the DJ on-air use the phone on the site instead.
                </p>

                <div className="mb-5">
                    <label htmlFor="feedback-text" className="font-courierprime mb-1 block text-sm text-gray-400">Feedback</label>
                    <textarea
                        id="feedback-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="font-courierprime w-full rounded bg-zinc-800 px-3 py-2 text-white"
                        rows={5}
                        maxLength={2000}
                        placeholder="The site is cool, weird, fun, busted, etc."
                    />
                    <p className="font-courierprime mt-1 text-xs text-gray-300">
                        We attach basic browser info (no personal data) to help us reproduce issues.
                    </p>
                </div>

                <button
                    className={`font-courierprime w-full py-3 font-bold text-white ${cooldownRemaining > 0 ? 'bg-zinc-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    onClick={handleSend}
                    disabled={isLoading || cooldownRemaining > 0}
                >
                    {isLoading ? 'Sending...' : cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : 'Send Feedback'}
                </button>

                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-courierprime mt-3 block w-full py-2 text-center text-sm text-gray-300 underline hover:text-white"
                >
                    or submit a PR on our github
                </a>

                {status === 'success' && (
                    <p role="status" aria-live="polite" className="font-courierprime mt-3 text-center text-sm text-green-400">
                        Sent! Thanks — our computing team will see your feedback.
                    </p>
                )}
                {status === 'ratelimit' && (
                    <p role="status" aria-live="polite" className="font-courierprime mt-3 text-center text-sm text-yellow-400">
                        Too many submissions — wait a moment and try again.
                    </p>
                )}
                {status === 'error' && (
                    <p role="status" aria-live="polite" className="font-courierprime mt-3 text-center text-sm text-red-400">
                        Something went wrong. Please try again.
                    </p>
                )}
            </div>
        </div>
    )
}
