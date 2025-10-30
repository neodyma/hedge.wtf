"use client"

import { publicKey as toPk } from "@metaplex-foundation/umi"
import { bytes, publicKey as publicKeySerializer } from "@metaplex-foundation/umi/serializers"
import { motion } from "framer-motion"
import { ArrowLeftRight } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { PriceCache } from "@/clients/generated/accounts/priceCache"

import { safeFetchFaucetMint } from "@/clients/generated/accounts/faucetMint"
import SwapDialog from "@/components/dialogs/SwapDialog"
import HealthScoreCard from "@/components/HealthScoreCard"
import MetricsRow from "@/components/MetricsRow"
import DataTable, { Column } from "@/components/tables/DataTable"
// import { PortfolioHistoryChart } from "@/components/base/PortfolioHistoryChart"
import PositionsTable from "@/components/tables/PositionsTable"
import TutorialFab from "@/components/TutorialFab"
import { TxOverlayProvider } from "@/components/TxOverlay"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import assetData from "@/data/combined_asset_data.json"
import { useFaucet } from "@/hooks/umi/mutations"
import { type PortfolioWalletBalance, usePortfolioSnapshot } from "@/hooks/umi/usePortfolioSnapshot"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { TutorialBar, TutorialProvider } from "@/hooks/useTutorial"
import { getHealthScoreWithLt, getProjectedApy, getPairLtFromRegistry } from "@/lib/portfolio"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { type EnrichedPool } from "@/lib/umi/pool-utils"
import { calculateCurrentApys } from "@/lib/umi/rate-calculations"
import { formatCurrency } from "@/lib/utils"
import { useProgramId, useUmi } from "@/providers/UmiContext"
import { Asset } from "@/types/asset"
export default function PortfolioPage() {
  const {
    assets,
    assetsLoading,
    enrichedPools,
    marketAuthority,
    marketPublicKey: selectedMarket,
    obligations,
    obligationsQuery,
    portfolioRefresh,
    priceCache,
    registry,
    riskRegistry,
    walletBalances,
    walletBalancesQuery,
    wrappedPositions,
  } = usePortfolioSnapshot()

  const balancesLoading = walletBalancesQuery.isFetching
  const bFetch = walletBalancesQuery.fetchStatus
  const bStatus = walletBalancesQuery.status

  const oFetch = obligationsQuery.fetchStatus
  const oStatus = obligationsQuery.status

  const balances = walletBalances
  const wrapped = wrappedPositions

  // Get liquidation threshold from on-chain RiskRegistry
  const effectiveLt = useCallback(
    (depositId?: number, borrowId?: number, defaultLt = 0.9) => {
      if (depositId == null || borrowId == null) return defaultLt

      // Map registry indices to true CoinMarketCap IDs via mint addresses
      const toCmcId = (id: number): number | null => {
        const asset = assets.find((a) => a.index === id || a.cmc_id === id)
        const mint = asset?.mint
        const info = mint ? getAssetByMint(mint) : null
        return info?.cmcId ?? null
      }

      const depCmc = toCmcId(depositId)
      const borCmc = toCmcId(borrowId)

      if (!depCmc || !borCmc) return defaultLt

      return getPairLtFromRegistry(depCmc, borCmc, registry, riskRegistry)
    },
    [assets, registry, riskRegistry],
  )

  const balancesDisabled = bStatus === "pending" && bFetch === "idle"
  const obligationsDisabled = oStatus === "pending" && oFetch === "idle"
  const queriesDisabled = balancesDisabled && obligationsDisabled

  const tutorialReady = queriesDisabled || oStatus === "success"

  const hasPositiveBalance = Array.isArray(balances) && balances.some((b) => (b.amount_ui ?? 0) > 0)

  const hasObligationPositions =
    !!obligations?.deposits?.some((d) => (d.amount_ui ?? 0) > 0) ||
    !!obligations?.borrows?.some((x) => (x.amount_ui ?? 0) > 0)

  const initialized = queriesDisabled ? false : hasPositiveBalance || hasObligationPositions

  const initForProvider: boolean | null = tutorialReady ? initialized : null

  const priceOf = useCallback(
    (id: number) => assets?.find((a) => a.cmc_id === id)?.price.latest ?? 0,
    [assets],
  )

  const dollarWorth = useMemo(
    () => balances?.reduce((sum, b) => sum + (b.amount_ui ?? 0) * priceOf(b.asset_id), 0) ?? 0,
    [balances, priceOf],
  )

  const depositWorth = useMemo(
    () =>
      obligations?.deposits.reduce((s, d) => s + (d.amount_ui ?? 0) * priceOf(d.asset_id), 0) ?? 0,
    [obligations, priceOf],
  )

  const borrowWorth = useMemo(
    () =>
      obligations?.borrows.reduce((s, b) => s + (b.amount_ui ?? 0) * priceOf(b.asset_id), 0) ?? 0,
    [obligations, priceOf],
  )

  const healthScore = useMemo(() => {
    const ltProvider = (a: number, b: number) => effectiveLt(a, b)
    const score = getHealthScoreWithLt(wrapped.deposits, wrapped.borrows, ltProvider)
    return isNaN(score) ? 0 : score
  }, [wrapped, effectiveLt])

  const poolsFormatted = useMemo(() => {
    if (!enrichedPools || enrichedPools.length === 0) return []

    return enrichedPools.map((ep: EnrichedPool) => {
      const utilizationBps = Math.round(ep.utilizationRate * 100)
      const apys = calculateCurrentApys(ep.pool.rate, utilizationBps)

      return {
        asset_id: ep.assetMeta?.index ?? 0,
        borrow_apy: apys.borrowApyPercent / 100,
        deposit_apy: apys.depositApyPercent / 100,
      }
    })
  }, [enrichedPools])

  const projectedApy = useMemo(() => {
    if (!poolsFormatted.length) return 0
    const depositYield = getProjectedApy(wrapped.deposits, "deposit", poolsFormatted)
    const borrowCost = getProjectedApy(wrapped.borrows, "borrow", poolsFormatted)

    return depositYield - borrowCost
  }, [wrapped, poolsFormatted])

  return (
    <TxOverlayProvider>
      <TutorialProvider initialized={initForProvider}>
        <TutorialBar />
        <TutorialFab />
        <div className="scrollbar-hide flex h-full w-full flex-col gap-2 pb-20">
          <MetricsRow
            borrowWorth={borrowWorth}
            depositWorth={depositWorth}
            dollarWorth={dollarWorth}
            healthScore={healthScore}
            projectedApy={projectedApy}
          />
          {/* <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
          >
            <PortfolioHistoryChart borrows={wrapped.borrows} deposits={wrapped.deposits} />
          </motion.div> */}

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mx-16 mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2"
            initial={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
          >
            <PositionsTable
              assets={assets}
              enrichedPools={enrichedPools}
              marketAuthority={marketAuthority}
              obligations={obligations}
              onSuccess={() => {
                void portfolioRefresh()
              }}
              selectedMarket={selectedMarket}
              side="deposits"
              title="Deposits"
              walletBalances={balances}
              wrapped={wrapped.deposits}
            />

            <PositionsTable
              assets={assets}
              enrichedPools={enrichedPools}
              marketAuthority={marketAuthority}
              obligations={obligations}
              onSuccess={() => {
                void portfolioRefresh()
              }}
              selectedMarket={selectedMarket}
              side="borrows"
              title="Borrows"
              walletBalances={balances}
              wrapped={wrapped.borrows}
            />

            <WalletBalances
              assets={assets}
              assetsLoading={assetsLoading}
              balances={balances}
              balancesLoading={balancesLoading}
              enrichedPools={enrichedPools}
              onSuccess={() => {
                void portfolioRefresh()
              }}
              priceCache={priceCache ?? null}
              registry={registry ?? null}
              selectedMarket={selectedMarket ?? undefined}
            />

            <HealthScoreCard
              wrapped={wrapped}
              depositWorth={depositWorth}
              borrowWorth={borrowWorth}
              assetRegistry={registry}
              riskRegistry={riskRegistry}
            />
          </motion.div>
        </div>
      </TutorialProvider>
    </TxOverlayProvider>
  )
}

function WalletBalances({
  assets,
  assetsLoading,
  balances: walletBalances,
  balancesLoading,
  enrichedPools,
  onSuccess,
  priceCache,
  registry,
  selectedMarket,
}: {
  assets: Asset[] | undefined
  assetsLoading: boolean
  balances: PortfolioWalletBalance[]
  balancesLoading: boolean
  enrichedPools: EnrichedPool[]
  onSuccess: () => Promise<void> | void
  priceCache: null | PriceCache
  registry: AssetRegistry | null
  selectedMarket: string | undefined
}) {
  const umi = useUmi()
  const pid = useProgramId()
  const { address: walletPublicKey } = useSolanaWallet()
  const faucetM = useFaucet()
  const [isInitializing, setIsInitializing] = useState(false)

  // Initialize account by minting 1M USDC from faucet
  const handleInitialize = useCallback(async () => {
    if (isInitializing) {
      console.log("Already initializing, skipping...")
      return
    }

    if (!walletPublicKey) {
      alert("Please connect your wallet first")
      return
    }

    if (!selectedMarket || !registry) {
      alert("Waiting for market data to load. Please try again in a moment.")
      return
    }

    setIsInitializing(true)
    console.log("=== USDC Faucet Initialization Started ===")

    try {
      const usdcData = assetData.usdc
      if (!usdcData?.zodial?.mint) {
        throw new Error("USDC mint not found in asset data")
      }

      const usdcMint = toPk(usdcData.zodial.mint)
      const programId = toPk(pid)
      const marketPk = toPk(selectedMarket)

      console.log("Configuration:")
      console.log("  USDC Mint:", usdcMint.toString())
      console.log("  Market:", marketPk.toString())
      console.log("  Program ID:", programId.toString())
      console.log("  Wallet:", walletPublicKey.toString())

      const SEED_FAUCET_MINT = new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116])
      const [faucetMint] = umi.eddsa.findPda(programId, [
        bytes().serialize(SEED_FAUCET_MINT),
        publicKeySerializer().serialize(marketPk),
        publicKeySerializer().serialize(usdcMint),
      ])

      console.log("Derived FaucetMint PDA:", faucetMint.toString())

      console.log("Checking if FaucetMint account exists...")
      const faucetMintAcc = await safeFetchFaucetMint(umi, faucetMint)
      if (!faucetMintAcc) {
        throw new Error(
          `USDC FaucetMint not initialized.\n\nExpected at: ${faucetMint.toString()}\n\nPlease contact admin to initialize it first.`,
        )
      }

      console.log("✓ FaucetMint account exists:", {
        decimals: faucetMintAcc.decimals,
        market: faucetMintAcc.market.toString(),
        mint: faucetMintAcc.mint.toString(),
      })

      const amount = BigInt(1_000_000 * Math.pow(10, 6))

      console.log("Calling faucet mutation with:", {
        amount: amount.toString(),
        faucetMint: faucetMint.toString(),
        mint: usdcMint.toString(),
        user: umi.identity.publicKey.toString(),
      })

      const signature = await faucetM.mutateAsync({
        amount,
        faucetMint,
        mint: usdcMint,
        user: umi.identity,
      })

      console.log("✓ Faucet transaction successful!")
      console.log("  Signature:", signature.toString())

      alert("Successfully minted 1,000,000 USDC to your wallet!")
      await onSuccess()
    } catch (error) {
      console.error("=== Initialize account failed ===")
      console.error("Error:", error)
      alert(`Failed to initialize account:\n\n${(error as Error).message}`)
    } finally {
      setIsInitializing(false)
      console.log("=== Initialization Complete ===")
    }
  }, [walletPublicKey, selectedMarket, registry, umi, pid, faucetM, onSuccess, isInitializing])

  const reset = {
    mutate: () => {
      if (isInitializing) return
      handleInitialize()
    },
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [assetFrom, setAssetFrom] = useState<Asset | null>(null)

  const rows =
    walletBalances?.reduce<{ amount_ui: number; asset: Asset }[]>((acc, b) => {
      const asset = assets?.find((a) => a.cmc_id === b.asset_id)
      if (asset) acc.push({ amount_ui: b.amount_ui, asset })
      return acc
    }, []) ?? []

  const cols: Column<{ amount_ui: number; asset: Asset }>[] = [
    { accessor: (r) => r.asset.name, className: "font-medium", header: "Asset" },
    { accessor: (r) => r.asset.symbol, header: "Symbol" },
    {
      accessor: (r) => r.amount_ui,
      className: " text-ellipsis overflow-hidden",
      header: "Amount",
    },
    {
      accessor: (r) => formatCurrency(r.amount_ui * r.asset.price.latest, 2),
      className: "hidden sm:table-cell",
      header: "Value",
    },
    {
      accessor: (r) => (
        <Button
          className="text-foreground h-8 w-8 p-0 hover:cursor-pointer"
          data-tour="swap-button"
          onClick={() => {
            setAssetFrom(r.asset)
            setTimeout(() => setDialogOpen(true), 0)
          }}
          variant={"outline"}
        >
          <ArrowLeftRight />
        </Button>
      ),
      className: "w-10 pl-1",
      header: "",
    },
  ]

  return (
    <Card className="border-foreground bg-card rounded-xs border-2 shadow-xl lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-semibold tracking-tight">Wallet Balances</CardTitle>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        {balancesLoading ? (
          <div className="py-4 text-center">Loading…</div>
        ) : rows.length ? (
          <DataTable columns={cols} data={rows} keyFn={(r) => r.asset.symbol} />
        ) : (
          <div className="text-muted-foreground py-4 text-center">
            No balances found.&nbsp;
            <Button data-tour="init" onClick={() => reset.mutate()} variant="ghost">
              Initialize account?
            </Button>
          </div>
        )}

        <SwapDialog
          allAssets={assetsLoading ? [] : assets!}
          defaultAsset={assetFrom ?? null}
          enrichedPools={enrichedPools}
          onOpenChange={setDialogOpen}
          onSuccess={onSuccess}
          open={dialogOpen}
          priceCache={priceCache ?? null}
          registry={registry ?? null}
          selectedMarket={selectedMarket ?? null}
          walletBalances={walletBalances}
        />
      </CardContent>
    </Card>
  )
}
