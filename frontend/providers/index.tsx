"use client"

import { createDefaultUmi } from "@/lib/umi"

import AppKitProvider from "./appKitProvider"
import QueryProvider from "./queryProvider"
import { UmiProvider } from "./UmiContext"

export default function Providers({ children }: { children: React.ReactNode }) {
  const umi = createDefaultUmi(process.env.NEXT_PUBLIC_RPC ?? undefined)

  return (
    <AppKitProvider>
      <UmiProvider umi={umi}>
        <QueryProvider>{children}</QueryProvider>
      </UmiProvider>
    </AppKitProvider>
  )
}
