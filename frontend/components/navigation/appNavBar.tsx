"use client"

import { OverflowNavigationMenu } from "@/components/navigation/navigationMenu"
import { cn } from "@/lib/utils"

import { useNavItemsFromManifest } from "./useNavItemsFromManifest"

type AppNavbarProps = {
  className?: string
  logo?: React.ReactNode
  rightSlot?: React.ReactNode // <WalletButton /> <ThemeToggle />
  viewport?: boolean
}

export function AppNavbar({ className, logo, rightSlot, viewport }: AppNavbarProps) {
  const items = useNavItemsFromManifest()

  return (
    <header
      className={cn(
        "border-muted-foreground bg-background sticky top-0 flex w-full border-spacing-4 items-center gap-3 border-b px-2 py-2 md:px-12",
        className,
      )}
    >
      {logo ? <div className="shrink-0 pr-2">{logo}</div> : null}
      <div className="min-w-0 flex-1">
        <OverflowNavigationMenu items={items} viewport={viewport} />
      </div>
      {rightSlot ? <>{rightSlot}</> : null}
    </header>
  )
}
