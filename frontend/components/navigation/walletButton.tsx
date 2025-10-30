"use client"

export default function WalletButton() {
  return (
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
