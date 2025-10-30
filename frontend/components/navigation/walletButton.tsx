"use client"

import { useIsMobile } from "@/hooks/use-mobile"

export default function WalletButton() {
  const mobile = useIsMobile()

  return mobile ? (
    <div>
      <appkit-button balance="hide" label="" loadingLabel="" namespace="solana" size="sm" />
    </div>
  ) : (
    <div>
      <appkit-button
        balance="show"
        label="Connect"
        loadingLabel="Loading.."
        namespace="solana"
        size="md"
      />
    </div>
  )
}
