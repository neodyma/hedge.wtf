/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

type Step = {
  body: React.ReactNode | string
  id: string
  selector: string
  title: string
}

type TutorialCtx = {
  active: boolean
  attachTo: (selector: string) => void
  goNext: () => void
  goPrev: () => void
  index: number
  rect: DOMRect | null
  restart: () => void
  skip: () => void
  steps: Step[]
}

const Ctx = createContext<null | TutorialCtx>(null)

const BASE_KEY = "hedge:tutorial:dismissed"

/** Sticky tutorial UI + spotlight overlay */
export function TutorialBar() {
  const { active, goNext, goPrev, index, rect, skip, steps } = useTutorial()
  const [mounted, setMounted] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)

  const [sidebarPx, setSidebarPx] = useState(0)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    const sel = "[data-layout-sidebar], [data-sidebar], #sidebar"
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) {
      setSidebarPx(0)
      return
    }

    const update = () => {
      const w = el.getBoundingClientRect().width
      setSidebarPx(Math.max(0, Math.floor(w)))
    }

    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(el)

    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [mounted])

  // When active, give body a top padding equal to the bar height
  useEffect(() => {
    if (!mounted) return
    if (!active) return
    const applyPadding = () => {
      const h = barRef.current?.getBoundingClientRect().height ?? 56
      // store previous to restore on cleanup
      const prev = document.body.style.paddingTop
      document.body.style.paddingTop = `${h}px`
      return () => {
        document.body.style.paddingTop = prev
      }
    }
    const cleanup = applyPadding()
    // also re-apply if window resizes (bar height might change)
    const onResize = () => applyPadding()
    window.addEventListener("resize", onResize)
    return () => {
      cleanup()
      window.removeEventListener("resize", onResize)
    }
  }, [active, mounted])

  if (!active || !mounted) return null

  const step = steps[index]

  return createPortal(
    <>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="border-border bg-popover/80 text-popover-foreground fixed top-0 right-0 z-[1000] border-b backdrop-blur"
        initial={{ opacity: 0, y: -24 }}
        ref={barRef}
        style={{ left: sidebarPx }}
      >
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-3 text-sm">
          {/* text area */}
          <div className="min-w-0 flex-1">
            <div className="text-foreground font-medium break-words whitespace-normal">
              {step.title}
            </div>
            <div className="text-muted-foreground break-words whitespace-normal">{step.body}</div>
          </div>

          {/* dots (md+) */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Dots current={index} total={steps.length} />
          </div>

          {/* actions */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="border-border text-foreground hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-1 disabled:opacity-50"
              disabled={index === 0}
              onClick={goPrev}
            >
              Back
            </button>
            <button
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 font-semibold"
              onClick={goNext}
            >
              {index === steps.length - 1 ? "Finish" : "Next"}
            </button>
            <button
              className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1"
              onClick={skip}
            >
              Skip
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>{rect && <Spotlight rect={rect} />}</AnimatePresence>
    </>,
    document.body,
  )
}

export function TutorialProvider({
  children,
  initialized,
  stepsOverride,
}: {
  children: React.ReactNode
  initialized: boolean | null
  stepsOverride?: Step[]
}) {
  const pathname = usePathname()
  const PAGE_KEY = `${BASE_KEY}:${pathname}`

  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const currentSelectorRef = useRef<null | string>(null)

  const [forced, setForced] = useState(false)

  // Define steps once. Use simple selectors via data-tour attributes.
  const defaultSteps: Step[] = useMemo(
    () => [
      {
        body: 'Click "Initialize account" (or use "Reset Account" if you’ve already played around) to create your on-chain state.',
        id: "init",
        selector: '[data-tour="init"]',
        title: "Initialize your account",
      },
      {
        body: "Pick an asset and enter an amount. Deposits boost your health score.",
        id: "deposit",
        selector: '[data-tour="deposit-add"]',
        title: "Make your first deposit",
      },
      {
        body: "Add a borrow draft to see the live health impact before applying.",
        id: "borrow",
        selector: '[data-tour="borrow-add"]',
        title: "Try borrowing",
      },
      {
        body: "Use the swap action to rebalance quickly.",
        id: "swap",
        selector: '[data-tour="swap-button"]',
        title: "Swap from your wallet",
      },
    ],
    [],
  )

  const steps: Step[] = useMemo(() => stepsOverride ?? defaultSteps, [stepsOverride, defaultSteps])

  const latestInitRef = useRef<boolean | null>(null)
  const openTimerRef = useRef<null | number>(null)

  useEffect(() => {
    latestInitRef.current = initialized
  }, [initialized])

  useEffect(() => {
    if (initialized === null) return

    const isDismissed = () =>
      (typeof window !== "undefined" ? localStorage.getItem(PAGE_KEY) : null) === "1"

    const clearTimer = () => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current!)
        openTimerRef.current = null
      }
    }

    // If user manually restarted, don't auto-close/open here.
    if (forced) {
      clearTimer()
      setActive(true)
      return
    }

    // Respect per-page dismissal
    if (isDismissed()) {
      clearTimer()
      setActive(false)
      return
    }

    // Show only for uninitialized users
    if (initialized === true) {
      clearTimer()
      setActive(false)
      return
    }

    // initialized === false → delayed open to avoid flicker
    clearTimer()
    openTimerRef.current = window.setTimeout(() => {
      if (latestInitRef.current === false && !isDismissed()) {
        setActive(true)
      }
      openTimerRef.current = null
    }, 500)

    return () => clearTimer()
  }, [initialized, forced, PAGE_KEY])

  const attachTo = useCallback((selector: string) => {
    currentSelectorRef.current = selector
    const r = findRect(selector)
    setRect(r)
    if (r) {
      const el = document.querySelector(selector) as HTMLElement | null
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
    }
  }, [])

  // Recompute spotlight on scroll/resize/route changes.
  useEffect(() => {
    if (!active) return
    const update = () => {
      if (currentSelectorRef.current) setRect(findRect(currentSelectorRef.current))
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    const id = setInterval(update, 250) // cheap guard for dynamic layouts
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
      clearInterval(id)
    }
  }, [active])

  // Whenever step index changes, move spotlight.
  useEffect(() => {
    if (!active) return
    attachTo(steps[index]?.selector)
  }, [active, index, steps, attachTo])

  const goNext = useCallback(() => {
    setIndex((i) => {
      const next = i + 1
      if (next >= steps.length) {
        // Per-page dismissal
        localStorage.setItem(PAGE_KEY, "1")
        setForced(false)
        setActive(false)
        return i
      }
      return next
    })
  }, [steps.length, PAGE_KEY])

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  const skip = useCallback(() => {
    localStorage.setItem(PAGE_KEY, "1")
    setForced(false)
    setActive(false)
  }, [PAGE_KEY])

  // NEW: public restart
  const restart = useCallback(() => {
    localStorage.removeItem(PAGE_KEY)
    setIndex(0)
    setForced(true)
    setActive(true)
    // optional: immediately re-attach spotlight to the first step
    // attachTo(steps[0]?.selector)
  }, [PAGE_KEY /*, attachTo, steps*/])

  const value: TutorialCtx = {
    active,
    attachTo,
    goNext,
    goPrev,
    index,
    rect,
    restart, // NEW
    skip,
    steps,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTutorial() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useTutorial must be used inside <TutorialProvider>")
  return ctx
}

function Dots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          className={`h-2 w-2 rounded-full ${i === current ? "bg-primary" : "bg-muted-foreground/40"}`}
          key={i}
        />
      ))}
    </div>
  )
}

function findRect(selector: string): DOMRect | null {
  if (typeof document === "undefined") return null
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return null
  return el.getBoundingClientRect()
}

function Spotlight({ rect }: { rect: DOMRect }) {
  const pad = 8
  const style: React.CSSProperties = {
    "--overlay-color": "color-mix(in oklab, var(--background), black 60%)",
    borderRadius: "12px",
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
    height: rect.height + pad * 2,
    left: rect.left - pad,
    pointerEvents: "none",
    position: "fixed",
    top: rect.top - pad,
    width: rect.width + pad * 2,
    zIndex: 900,
  } as React.CSSProperties
  return (
    <motion.div
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      style={style}
    />
  )
}
