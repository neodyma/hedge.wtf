"use client"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import * as React from "react"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      className={cn("flex flex-col gap-2", className)}
      data-slot="tabs"
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "text-muted-foreground border-foreground/30 bg-background/40 flex w-fit items-center justify-start gap-2 rounded-xs border-2 p-1 backdrop-blur",
        className,
      )}
      data-slot="tabs-list"
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "text-foreground focus-visible:border-foreground inline-flex items-center justify-center gap-1.5 rounded-xs border-2 border-transparent px-4 py-2 text-sm font-medium whitespace-nowrap transition-[border,color] outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-[state=active]:border-foreground data-[state=active]:bg-card/80 data-[state=active]:text-foreground",
        "data-[state=inactive]:hover:border-foreground/60",
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
