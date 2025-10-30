import type { Metadata } from "next"

import { Electrolize, Jersey_15, Oxygen_Mono } from "next/font/google"

import { AppNavbar } from "@/components/navigation/appNavBar"
import Logo from "@/components/navigation/logo"
import WalletButton from "@/components/navigation/walletButton"

import "./globals.css"
import Providers from "@/providers"

const jersey10 = Jersey_15({
  subsets: ["latin"],
  variable: "--font-jersey-10",
  weight: "400",
})

const electrolize = Electrolize({
  subsets: ["latin"],
  variable: "--font-electrolize",
  weight: "400",
})

const oxygenMono = Oxygen_Mono({
  subsets: ["latin"],
  variable: "--font-oxygen-mono",
  weight: "400",
})

export const metadata: Metadata = {
  description: "hedge.xyt",
  title: "hedge.xyz Solana Lending Protocol",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html className="scrollbar-hide" lang="en">
      <body
        className={`${jersey10.variable} ${electrolize.variable} ${oxygenMono.variable} antialiased`}
      >
        <Providers>
          <AppNavbar logo={<Logo />} rightSlot={<WalletButton />} />
          <div className="scrollbar-hide flex min-h-screen flex-col overflow-y-auto">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}
