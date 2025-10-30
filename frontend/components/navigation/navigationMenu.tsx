"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef } from "react"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { useOverflowCollapse } from "@/hooks/useOverflowCollapse"
import { cn } from "@/lib/utils"

export type NavRenderItem = React.ReactElement<React.ComponentProps<typeof NavigationMenuItem>>

export type OverflowEntry = {
  href?: string
  key: string
  priority?: number
  render: () => NavRenderItem // <NavigationMenuItem>..</NavigationMenuItem>
  renderOverflow?: () => React.ReactNode
  title: string
}

type OverflowNavigationMenuProps = {
  className?: string
  items: OverflowEntry[]
  moreLabel?: string
  viewport?: boolean
}

export function OverflowNavigationMenu({
  className,
  items,
  moreLabel = "More",
  viewport = true,
}: OverflowNavigationMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const moreRef = useRef<HTMLLIElement | null>(null)

  const pathName = usePathname()

  const { overflowKeys, setItemWidth, setMoreWidth, visibleKeys } = useOverflowCollapse({
    containerRef,
    forceMoreTrigger: true,
    items: items.map((i) => ({ key: i.key, priority: i.priority })),
  })

  const measureAll = useCallback(() => {
    for (const it of items) {
      const node = itemRefs.current.get(it.key)
      if (!node) continue
      const rect = node.getBoundingClientRect()
      const styles = window.getComputedStyle(node)
      const ml = parseFloat(styles.marginLeft || "0")
      const mr = parseFloat(styles.marginRight || "0")
      setItemWidth(it.key, Math.ceil(rect.width + ml + mr))
    }
    if (moreRef.current) {
      const rect = moreRef.current.getBoundingClientRect()
      const styles = window.getComputedStyle(moreRef.current)
      const ml = parseFloat(styles.marginLeft || "0")
      const mr = parseFloat(styles.marginRight || "0")
      setMoreWidth(Math.ceil(rect.width + ml + mr))
    }
  }, [items, setItemWidth, setMoreWidth])

  useEffect(() => {
    measureAll()
    const ro = new ResizeObserver(measureAll)
    if (containerRef.current) ro.observe(containerRef.current)

    const observers: ResizeObserver[] = []
    for (const it of items) {
      const node = itemRefs.current.get(it.key)
      if (!node) continue
      const r = new ResizeObserver(measureAll)
      r.observe(node)
      observers.push(r)
    }
    if (moreRef.current) {
      const r = new ResizeObserver(measureAll)
      r.observe(moreRef.current)
      observers.push(r)
    }
    return () => {
      ro.disconnect()
      observers.forEach((r) => r.disconnect())
    }
  }, [items, measureAll])

  const visibleSet = visibleKeys
  const byKey = useMemo(() => new Map(items.map((x) => [x.key, x])), [items])

  return (
    <NavigationMenu className={className} viewport={viewport}>
      <div className="max-w-full" ref={containerRef}>
        <NavigationMenuList className="flex-nowrap">
          {items.map((entry) => {
            const node = entry.render()
            return (
              <NavigationMenuItem
                className={cn(
                  !visibleSet.has(entry.key) && "invisible absolute -z-10",
                  node.props.className,
                  entry.href === pathName && "underline underline-offset-3",
                )}
                key={entry.key}
                ref={(el) => {
                  if (el) itemRefs.current.set(entry.key, el)
                  else itemRefs.current.delete(entry.key)
                }}
                {...node.props}
              >
                {node.props.children}
              </NavigationMenuItem>
            )
          })}

          <NavigationMenuItem
            className={cn(overflowKeys.length === 0 && "invisible")}
            ref={moreRef}
          >
            <NavigationMenuTrigger>
              <span className="mr-1">{moreLabel}</span>
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[240px] gap-1 p-1">
                {overflowKeys.map((k) => {
                  const item = byKey.get(k)!
                  return (
                    <li key={k}>
                      {item.renderOverflow ? (
                        item.renderOverflow()
                      ) : item.href ? (
                        <NavigationMenuLink asChild>
                          <Link className="rounded-sm px-2 py-1.5" href={item.href}>
                            {item.title}
                          </Link>
                        </NavigationMenuLink>
                      ) : (
                        <div className="text-muted-foreground rounded-sm px-2 py-1.5">
                          {item.title}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </div>
    </NavigationMenu>
  )
}
