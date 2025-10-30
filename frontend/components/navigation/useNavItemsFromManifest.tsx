"use client"

import { BookOpen, Boxes, Home, Layers, List, type LucideIcon, Sparkles } from "lucide-react"
import Link from "next/link"

import type { OverflowEntry } from "@/components/navigation/navigationMenu"

import { NAV_MANIFEST } from "@/components/navigation/manifest"
import {
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

const ICONS = {
  BookOpen,
  Boxes,
  Home,
  Layers,
  List,
  Sparkles,
} satisfies Record<string, LucideIcon>

type IconName = keyof typeof ICONS

export function useNavItemsFromManifest(): OverflowEntry[] {
  return NAV_MANIFEST.filter((r) => r.meta.includeInNav && !r.meta.hidden).map((r) => {
    const Icn = iconFromName(r.meta.icon)
    const title = r.meta.title ?? (r.path.replace(/^\//, "") || "Home")
    const href = r.path || "/"

    return {
      href,
      key: href || title,
      priority: r.meta.priority ?? 0,
      render: () => (
        <NavigationMenuItem>
          <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
            <Link href={href}>
              {Icn ? <Icn className="mr-2 size-4" /> : null}
              {title}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      ),
      title,
    }
  })
}

function iconFromName(name?: string): LucideIcon | null {
  if (!name) return null
  if (name in ICONS) return ICONS[name as IconName]
  return null
}
