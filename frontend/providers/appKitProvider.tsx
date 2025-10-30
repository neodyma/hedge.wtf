"use client"

import { SolanaAdapter } from "@reown/appkit-adapter-solana"
import { solanaDevnet } from "@reown/appkit/networks"
import { createAppKit } from "@reown/appkit/react"

const solanaWeb3JsAdapter = new SolanaAdapter({
  registerWalletStandard: true,
})

const metadata = {
  description: "hedge.wtf Lending Protocol",
  icons: [],
  name: "hedge.wtf",
  url: process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://hedge.wtf",
}

export const projectId = process.env["NEXT_PUBLIC_PROJECT_ID"] ?? "d5b42095aee2669c6889578955b3fb5c"

const devnetRpc = process.env["NEXT_PUBLIC_RPC"] ?? "https://api.devnet.solana.com"

export const modal = createAppKit({
  adapters: [solanaWeb3JsAdapter],
  customRpcUrls: {
    [solanaDevnet.caipNetworkId]: [{ url: devnetRpc }],
  },
  defaultNetwork: solanaDevnet,
  enableReconnect: true,
  features: { analytics: true, email: false, socials: [] },
  metadata: metadata,
  networks: [solanaDevnet],
  projectId,
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "var(--accent)",
    "--w3m-border-radius-master": "2px",
    "--w3m-color-mix": "#FFBB7F",
    "--w3m-font-family": "Oxygen Mono",
  },
})

export default function AppKitProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
