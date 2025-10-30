"use client"

import { useEffect, useMemo, useState } from "react"

export type OverflowItem = {
  key: OverflowKey
  priority?: number // higher = kept visible longer
}

export type OverflowKey = string

type UseOverflowCollapseOpts = {
  containerRef: React.RefObject<HTMLElement | null>
  /** Always reserve space for the "More" trigger. */
  forceMoreTrigger?: boolean
  items: OverflowItem[]
  measure?: Map<OverflowKey, number>
  moreWidth?: number
}

export function useOverflowCollapse({
  containerRef,
  forceMoreTrigger,
  items,
  measure,
  moreWidth,
}: UseOverflowCollapseOpts) {
  const [measures, setMeasures] = useState<Map<OverflowKey, number>>(measure ?? new Map())
  const [moreW, setMoreW] = useState<number>(moreWidth ?? 0)
  const [containerW, setContainerW] = useState<number>(0)

  // Observe container width (external system) -> safe to set state in RO callback.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let prev = -1

    const ro = new ResizeObserver((entries) => {
      const w = Math.max(0, Math.round(entries[0].contentRect.width))
      if (w !== prev) {
        prev = w
        setContainerW(w)
      }
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  // Derived visible / overflow sets (no setState in effects).
  const { overflowKeys, visibleKeys } = useMemo(() => {
    // If we don't know widths yet, show everything.
    const haveAllMeasures = items.every((i) => (measures.get(i.key) ?? 0) > 0)
    const haveMore = !forceMoreTrigger ? moreW > 0 : true
    if (!haveAllMeasures || !haveMore || containerW <= 0) {
      const all = new Set(items.map((i) => i.key))
      return { overflowKeys: [] as OverflowKey[], visibleKeys: all }
    }

    const total = items.reduce((s, it) => s + (measures.get(it.key) ?? 0), 0)
    const needsMore = Boolean(forceMoreTrigger) || total > containerW
    const capacity = Math.max(0, containerW - (needsMore ? moreW : 0))

    type Row = { idx: number; key: OverflowKey; p: number; w: number }
    const sorted: Row[] = items
      .map((i, idx) => ({ idx, key: i.key, p: i.priority ?? 0, w: measures.get(i.key) ?? 0 }))
      .sort((a, b) => b.p - a.p || a.idx - b.idx)

    let used = 0
    const keep = new Set<OverflowKey>()
    for (const it of sorted) {
      if (it.w <= 0) continue
      if (used + it.w <= capacity) {
        used += it.w
        keep.add(it.key)
      }
    }

    const overflow = items.map((i) => i.key).filter((k) => !keep.has(k))
    return { overflowKeys: overflow, visibleKeys: keep }
  }, [items, measures, moreW, containerW, forceMoreTrigger])

  // Public setters used by the measuring wrapper
  const setItemWidth = (key: OverflowKey, width: number) => {
    if (width <= 0) return
    setMeasures((m) => {
      const next = new Map(m)
      const w = Math.round(width)
      if (next.get(key) === w) return m
      next.set(key, w)
      return next
    })
  }

  const setMoreWidth = (width: number) => {
    const w = Math.max(0, Math.round(width))
    setMoreW((prev) => (prev === w ? prev : w))
  }

  return { overflowKeys, setItemWidth, setMoreWidth, visibleKeys }
}
