"use client"

import { base58, publicKey as toPk, transactionBuilder } from "@metaplex-foundation/umi"
import { bytes, publicKey as publicKeySerializer } from "@metaplex-foundation/umi/serializers"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"

import type { Position } from "@/types/portfolio"

import {
  type BorrowInstructionAccounts,
  type BorrowInstructionArgs,
  borrow as borrowIx,
} from "@/clients/generated/instructions/borrow"
import {
  type DepositInstructionAccounts,
  type DepositInstructionArgs,
  deposit as depositIx,
} from "@/clients/generated/instructions/deposit"
import {
  type FaucetInstructionAccounts,
  type FaucetInstructionArgs,
  faucet as faucetIx,
} from "@/clients/generated/instructions/faucet"
import {
  type FaucetSwapInstructionAccounts,
  type FaucetSwapInstructionArgs,
  faucetSwap as faucetSwapIx,
} from "@/clients/generated/instructions/faucetSwap"
import { HedgeDialog, type HedgePlan } from "@/components/discover/HedgeDialog"
import { SelectionIndicators } from "@/components/discover/SelectionIndicators"
import { SwipeableAssetCard } from "@/components/discover/SwipeableAssetCard"
import { TxOverlayProvider, useTxOverlay } from "@/components/TxOverlay"
import { Button } from "@/components/ui/button"
import assetData from "@/data/combined_asset_data.json"
import { usePortfolioSnapshot } from "@/hooks/umi/usePortfolioSnapshot"
import { type DiscoverAsset, useDiscoverAssets } from "@/hooks/useDiscoverAssets"
import { getBorrowAmount } from "@/lib/portfolio"
import { deriveAta, uiToRawU64 } from "@/lib/umi/pda-utils"
import { getPoolAvailableLiquidity } from "@/lib/umi/pool-utils"
import { useProgramId, useUmi } from "@/providers/UmiContext"

const USDC_SYMBOL = "USDC"
const INITIAL_USDC_AIRDROP = 1_000_000
const TARGET_HEALTH = 1.5
const BORROW_HEADROOM = 0.75
const MIN_BORROW_USD = 100

type ExecuteOptions = {
  baseDepositUsd: number
  borrowLegs: HedgeLeg[]
  depositLongs: HedgeLeg[]
  mode: "existing" | "new"
  plan: HedgePlan
  swaps: SwapStep[]
}

type HedgeLeg = {
  amount: number
  asset: DiscoverAsset
}

type SwapStep = {
  from: HedgeLeg
  fromAmount: number
  to: HedgeLeg
  toAmount: number
}

export default function DiscoverPage() {
  return (
    <TxOverlayProvider>
      <DiscoverPageContent />
    </TxOverlayProvider>
  )
}

function buildDefaultHedgePlan({
  longTokens,
  portfolio,
  shortTokens,
}: {
  longTokens: DiscoverAsset[]
  portfolio: ReturnType<typeof usePortfolioSnapshot>
  shortTokens: DiscoverAsset[]
}): HedgePlan | null {
  const longCount = longTokens.length
  const shortCount = shortTokens.length
  if (longCount === 0 || shortCount === 0) return null

  const hasObligationAccount = Boolean(portfolio.obligationsQuery.data?.length)
  const mode: "existing" | "new" = hasObligationAccount ? "existing" : "new"
  const baseDepositUsd = mode === "new" ? INITIAL_USDC_AIRDROP : 0

  const assetMap = new Map(portfolio.assets.map((asset) => [asset.cmc_id, asset]))

  const usdcAsset = portfolio.assets.find((asset) => asset.symbol.toUpperCase() === USDC_SYMBOL)

  if (!usdcAsset) {
    console.warn("[Discover] USDC asset not found in registry")
  }

  const existingDeposits = portfolio.wrappedPositions.deposits
  const existingBorrows = portfolio.wrappedPositions.borrows

  const hypotheticalDeposits: Position[] = [...existingDeposits]
  const simulatedBorrows: Position[] = [...existingBorrows]

  if (mode === "new" && usdcAsset) {
    const usdcPrice = usdcAsset.price?.latest ?? 1
    const usdcAmount = usdcPrice > 0 ? baseDepositUsd / usdcPrice : baseDepositUsd
    hypotheticalDeposits.push({
      amount: usdcAmount,
      asset: usdcAsset,
    })
  }

  const viableShorts: HedgeLeg[] = []
  let totalShortUsd = 0

  for (const token of shortTokens) {
    const assetMeta = token.assetMeta
    if (!assetMeta) continue
    const asset = assetMap.get(assetMeta.index)
    if (!asset) continue

    const price = token.price ?? asset.price?.latest ?? 0
    if (!price || price <= 0) continue

    const safeBorrowRaw = getBorrowAmount(
      hypotheticalDeposits,
      simulatedBorrows,
      asset,
      TARGET_HEALTH,
    )

    if (!Number.isFinite(safeBorrowRaw) || safeBorrowRaw <= 0) continue

    const liquidity = getPoolAvailableLiquidity(token)
    if (liquidity <= 0) continue

    const bufferedTokens = Math.min(safeBorrowRaw * BORROW_HEADROOM, liquidity)
    if (bufferedTokens <= 0) continue

    const usdValue = bufferedTokens * price
    if (usdValue < MIN_BORROW_USD) continue

    const normalizedAmount = Number.parseFloat(bufferedTokens.toFixed(6))
    viableShorts.push({
      amount: normalizedAmount,
      asset: token,
    })
    simulatedBorrows.push({
      amount: normalizedAmount,
      asset,
    })
    totalShortUsd += normalizedAmount * price
  }

  if (!viableShorts.length || totalShortUsd <= 0) {
    return null
  }

  const pricedLongs = longTokens.filter((token) => (token.price ?? 0) > 0)
  const pricedLongCount = pricedLongs.length

  if (pricedLongCount === 0) {
    return null
  }

  const longUsdPerAsset = totalShortUsd / pricedLongCount

  const longLegs: HedgeLeg[] = longTokens.map((token) => {
    const price = token.price ?? 0
    const amount = price > 0 ? Number.parseFloat((longUsdPerAsset / price).toFixed(6)) : 0
    return { amount, asset: token }
  })

  return {
    baseDepositUsd,
    longs: longLegs,
    mode,
    shorts: viableShorts,
  }
}

function computeExecutionSteps(plan: HedgePlan) {
  const swaps: SwapStep[] = []
  const swapDeposited = new Map<string, number>()

  const shorts = plan.shorts
    .filter((leg) => leg.amount > 0)
    .map((leg) => ({
      asset: leg.asset,
      remaining: leg.amount,
    }))

  const longs = plan.longs
    .filter((leg) => leg.amount > 0)
    .map((leg) => ({
      asset: leg.asset,
      remaining: leg.amount,
    }))

  for (const short of shorts) {
    if (short.remaining <= 0) continue
    const shortPrice = short.asset.price ?? 0
    if (shortPrice <= 0) continue

    for (const long of longs) {
      if (short.remaining <= 0) break
      if (long.remaining <= 0) continue

      const longPrice = long.asset.price ?? 0
      if (longPrice <= 0) continue

      const shortUsd = short.remaining * shortPrice
      const longUsdNeeded = long.remaining * longPrice
      const usdToUse = Math.min(shortUsd, longUsdNeeded)
      if (usdToUse <= 0) continue

      const fromAmount = usdToUse / shortPrice
      const toAmount = usdToUse / longPrice

      swaps.push({
        from: { amount: fromAmount, asset: short.asset },
        fromAmount,
        to: { amount: toAmount, asset: long.asset },
        toAmount,
      })

      const longKey = long.asset.pool.mint.toString()
      swapDeposited.set(longKey, (swapDeposited.get(longKey) ?? 0) + toAmount)

      short.remaining -= fromAmount
      long.remaining -= toAmount
    }
  }

  const depositLongs = plan.longs
    .map((leg) => {
      const key = leg.asset.pool.mint.toString()
      const bySwap = swapDeposited.get(key) ?? 0
      const remaining = Math.max(0, leg.amount - bySwap)
      return {
        amount: Number.parseFloat(remaining.toFixed(6)),
        asset: leg.asset,
      }
    })
    .filter((leg) => leg.amount > 0)

  return {
    borrowLegs: plan.shorts.filter((leg) => leg.amount > 0),
    depositLongs,
    swaps,
  }
}

function DiscoverPageContent() {
  const router = useRouter()
  const { assets, isLoading } = useDiscoverAssets()
  const portfolio = usePortfolioSnapshot()
  const umi = useUmi()
  const pid = useProgramId()
  const notify = useTxOverlay()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [longTokens, setLongTokens] = useState<DiscoverAsset[]>([])
  const [shortTokens, setShortTokens] = useState<DiscoverAsset[]>([])
  const [hedgePlan, setHedgePlan] = useState<HedgePlan | null>(null)
  const [hedgeDialogOpen, setHedgeDialogOpen] = useState(false)
  const [hedgeError, setHedgeError] = useState<null | string>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  const currentAsset = assets[currentIndex]

  const isAssetSelected = (asset: DiscoverAsset) =>
    longTokens.some((token) => token.pool.mint == asset.pool.mint) ||
    shortTokens.some((token) => token.pool.mint == asset.pool.mint)

  const findNextIndex: (start: number) => number = (start: number) => {
    if (assets.length === 0) return 0
    for (let offset = 1; offset <= assets.length; offset++) {
      const candidate = (start + offset) % assets.length
      if (!isAssetSelected(assets[candidate])) return candidate
    }
    return start
  }

  const findPrevIndex = (start: number) => {
    if (assets.length === 0) return 0
    for (let offset = 1; offset <= assets.length; offset++) {
      const candidate = (start - offset + assets.length) % assets.length
      if (!isAssetSelected(assets[candidate])) return candidate
    }
    return start
  }

  const handleSwipeUp = () => setCurrentIndex((prev) => findNextIndex(prev))
  const handleSwipeDown = () => setCurrentIndex((prev) => findPrevIndex(prev))

  const handleAdd = (asset: DiscoverAsset, side: "long" | "short") => {
    if (isAssetSelected(asset)) {
      handleSwipeUp()
      return
    }

    if (side === "long") {
      setLongTokens((prev) => (prev.length >= 2 ? prev : [...prev, asset]))
    } else {
      setShortTokens((prev) => (prev.length >= 2 ? prev : [...prev, asset]))
    }
    handleSwipeUp()
  }

  const handleRemoveLong = (index: number) => {
    setLongTokens((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveShort = (index: number) => {
    setShortTokens((prev) => prev.filter((_, i) => i !== index))
  }

  const canHedge = useMemo(
    () => longTokens.length > 0 && shortTokens.length > 0,
    [longTokens.length, shortTokens.length],
  )

  const handleHedge = useCallback(() => {
    setHedgeDialogOpen(true)
    if (!canHedge) return
    if (!portfolio.marketPublicKey || !portfolio.registry || !portfolio.priceCache) {
      setHedgeError("Market resources are still loading. Please try again in a moment.")
      return
    }
    const plan = buildDefaultHedgePlan({
      longTokens,
      portfolio,
      shortTokens,
    })
    if (!plan) {
      setHedgeError("Unable to build a hedge plan with the current selections.")
      return
    }
    setHedgePlan(plan)
    setHedgeError(null)
  }, [canHedge, longTokens, shortTokens, portfolio])

  const performHedge = useCallback(
    async (plan: HedgePlan) => {
      if (!portfolio.marketPublicKey || !portfolio.registry || !portfolio.priceCache) {
        throw new Error("Market data unavailable. Please try again.")
      }

      const { borrowLegs, depositLongs, swaps } = computeExecutionSteps(plan)

      const executeOptions: ExecuteOptions = {
        baseDepositUsd: plan.baseDepositUsd,
        borrowLegs,
        depositLongs,
        mode: plan.mode,
        plan,
        swaps,
      }

      await executeHedge({
        executeOptions,
        notify,
        pid,
        portfolio,
        umi,
      })

      await portfolio.portfolioRefresh()
      router.push("/portfolio")
    },
    [portfolio, umi, pid, notify, router],
  )

  const handleSubmitHedge = useCallback(
    async (plan: HedgePlan) => {
      try {
        setIsExecuting(true)
        await performHedge(plan)
        setHedgeDialogOpen(false)
      } catch (error) {
        console.error("[handleHedge] execution failed", error)
        if (error instanceof Error) {
          setHedgeError(error.message)
        } else {
          setHedgeError("Failed to execute hedge.")
        }
      } finally {
        setIsExecuting(false)
      }
    },
    [performHedge],
  )

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-12 w-12 animate-spin" />
          <p className="text-muted-foreground text-sm">Loading assets from devnet...</p>
        </div>
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-center text-sm">
          No assets available for discovery. Ensure combined_asset_data.json includes CMC IDs.
        </p>
        <Button onClick={() => router.push("/market")}>Go to Market</Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-border/50 bg-background/80 fixed top-0 right-0 left-0 z-30 flex items-center justify-between border-b p-4 backdrop-blur-md">
        <Button onClick={() => router.back()} size="icon" variant="ghost">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="text-sm font-medium">
          {currentIndex + 1} / {assets.length}
        </div>
        <Button onClick={() => router.push("/market")} size="sm" variant="ghost">
          Market
        </Button>
      </div>

      <div className="relative flex-1 overflow-hidden" style={{ height: "90vh" }}>
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0"
            exit={{ opacity: 0, scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.9 }}
            key={currentIndex}
            transition={{ duration: 0.3 }}
          >
            <SwipeableAssetCard
              asset={currentAsset}
              onSwipeDown={handleSwipeDown}
              onSwipeLeft={() => handleAdd(currentAsset, "short")}
              onSwipeRight={() => handleAdd(currentAsset, "long")}
              onSwipeUp={handleSwipeUp}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ height: "10vh" }}>
        <SelectionIndicators
          longTokens={longTokens}
          onHedge={handleHedge}
          onRemoveLong={handleRemoveLong}
          onRemoveShort={handleRemoveShort}
          shortTokens={shortTokens}
        />
      </div>

      <HedgeDialog
        error={hedgeError}
        isExecuting={isExecuting}
        onClose={() => {
          if (isExecuting) return
          setHedgeDialogOpen(false)
        }}
        onSubmit={handleSubmitHedge}
        open={hedgeDialogOpen}
        plan={hedgePlan}
      />
    </div>
  )
}

async function executeHedge({
  executeOptions,
  notify,
  pid,
  portfolio,
  umi,
}: {
  executeOptions: ExecuteOptions
  notify: ReturnType<typeof useTxOverlay>
  pid: string
  portfolio: ReturnType<typeof usePortfolioSnapshot>
  umi: ReturnType<typeof useUmi>
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { baseDepositUsd, borrowLegs, depositLongs, mode, plan: _plan, swaps } = executeOptions

  if (!portfolio.marketPublicKey || !portfolio.marketAuthority) {
    throw new Error("Market details are unavailable.")
  }

  const registry = portfolio.registry
  const priceCache = portfolio.priceCache

  if (!registry || !priceCache) {
    throw new Error("Registry or price cache not loaded.")
  }

  const programId = toPk(pid)
  const marketPk = toPk(portfolio.marketPublicKey)
  const authorityPk = toPk(portfolio.marketAuthority)
  const owner = umi.identity

  const usdcMintStr = (assetData as Record<string, { zodial?: { mint?: string } }>).usdc?.zodial
    ?.mint
  const usdcMint = usdcMintStr ? toPk(usdcMintStr) : null

  const preBorrowDeposits = mode === "existing" ? depositLongs : []
  const postSwapDeposits = mode === "existing" ? [] : depositLongs

  let combined = transactionBuilder()

  if (mode === "new") {
    if (!usdcMint) {
      throw new Error("Unable to locate USDC mint for faucet airdrop.")
    }
    if (baseDepositUsd <= 0) {
      throw new Error("Base deposit amount must be positive for new accounts.")
    }

    const faucetMintPda = umi.eddsa.findPda(programId, [
      bytes().serialize(new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116])),
      publicKeySerializer().serialize(marketPk),
      publicKeySerializer().serialize(usdcMint),
    ])[0]

    combined = combined.add(
      faucetIx(umi, {
        amount: BigInt(baseDepositUsd) * BigInt(1_000_000),
        faucetMint: faucetMintPda,
        mint: usdcMint,
        user: owner,
      } satisfies FaucetInstructionAccounts & FaucetInstructionArgs),
    )

    const usdcPool = portfolio.enrichedPools.find(
      (pool) => pool.pool.mint.toString() === usdcMint.toString(),
    )

    if (!usdcPool) {
      throw new Error("USDC pool not found.")
    }

    const usdcRaw = uiToRawU64(baseDepositUsd.toString(), usdcPool.assetMeta?.decimals ?? 6)
    if (!usdcRaw) {
      throw new Error("Failed to compute USDC deposit amount.")
    }

    combined = combined.add(
      depositIx(umi, {
        amount: usdcRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, usdcPool.pool.mint),
        pool: usdcPool.pool.publicKey,
        poolVault: usdcPool.pool.vault,
      } satisfies DepositInstructionAccounts & DepositInstructionArgs),
    )
  }

  for (const leg of preBorrowDeposits) {
    if (leg.amount <= 0) continue
    const pool = leg.asset
    const decimals = pool.assetMeta?.decimals ?? 6
    const amountRaw = uiToRawU64(leg.amount.toString(), decimals)
    if (!amountRaw) continue
    combined = combined.add(
      depositIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      } satisfies DepositInstructionAccounts & DepositInstructionArgs),
    )
  }

  for (const leg of borrowLegs) {
    if (leg.amount <= 0) continue
    const pool = leg.asset
    const decimals = pool.assetMeta?.decimals ?? 6
    const amountRaw = uiToRawU64(leg.amount.toString(), decimals)
    if (!amountRaw) continue

    combined = combined.add(
      borrowIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        mint: pool.pool.mint,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      } satisfies BorrowInstructionAccounts & BorrowInstructionArgs),
    )
  }

  const SEED_FAUCET_MINT = new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116])

  for (const swap of swaps) {
    const fromPool = swap.from.asset
    const toPool = swap.to.asset
    const fromDecimals = fromPool.assetMeta?.decimals ?? 6
    const toDecimals = toPool.assetMeta?.decimals ?? 6
    const fromAmountRaw = uiToRawU64(swap.fromAmount.toString(), fromDecimals)
    if (!fromAmountRaw) continue

    const faucetMintFrom = umi.eddsa.findPda(programId, [
      bytes().serialize(SEED_FAUCET_MINT),
      publicKeySerializer().serialize(marketPk),
      publicKeySerializer().serialize(fromPool.pool.mint),
    ])[0]

    const faucetMintTo = umi.eddsa.findPda(programId, [
      bytes().serialize(SEED_FAUCET_MINT),
      publicKeySerializer().serialize(marketPk),
      publicKeySerializer().serialize(toPool.pool.mint),
    ])[0]

    combined = combined.add(
      faucetSwapIx(umi, {
        amount: fromAmountRaw,
        assetRegistry: registry.publicKey,
        faucetMintFrom,
        faucetMintTo,
        mintFrom: fromPool.pool.mint,
        mintTo: toPool.pool.mint,
        priceCache: priceCache.publicKey,
        user: owner,
        userTokenFrom: deriveAta(umi, owner.publicKey, fromPool.pool.mint),
        userTokenTo: deriveAta(umi, owner.publicKey, toPool.pool.mint),
      } satisfies FaucetSwapInstructionAccounts & FaucetSwapInstructionArgs),
    )

    const depositAmountRaw = uiToRawU64(swap.toAmount.toString(), toDecimals)
    if (!depositAmountRaw) continue

    combined = combined.add(
      depositIx(umi, {
        amount: depositAmountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, toPool.pool.mint),
        pool: toPool.pool.publicKey,
        poolVault: toPool.pool.vault,
      } satisfies DepositInstructionAccounts & DepositInstructionArgs),
    )
  }

  for (const depositLeg of postSwapDeposits) {
    if (depositLeg.amount <= 0) continue
    const pool = depositLeg.asset
    const decimals = pool.assetMeta?.decimals ?? 6
    const amountRaw = uiToRawU64(depositLeg.amount.toString(), decimals)
    if (!amountRaw) continue
    combined = combined.add(
      depositIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      } satisfies DepositInstructionAccounts & DepositInstructionArgs),
    )
  }

  try {
    const signature = await combined.sendAndConfirm(umi)
    const sig58 = base58.deserialize(signature.signature)[0]
    notify({
      label: "Execute Hedge",
      signature: sig58,
    })
  } catch (error) {
    console.warn("[executeHedge] Combined transaction failed, falling back to sequential", error)
    await executeSequential({
      baseDepositUsd,
      borrowLegs,
      depositLongs,
      mode,
      notify,
      pid,
      portfolio,
      swaps,
      umi,
    })
  }
}

async function executeSequential({
  baseDepositUsd,
  borrowLegs,
  depositLongs,
  mode,
  notify,
  pid,
  portfolio,
  swaps,
  umi,
}: {
  baseDepositUsd: number
  borrowLegs: HedgeLeg[]
  depositLongs: HedgeLeg[]
  mode: "existing" | "new"
  notify: ReturnType<typeof useTxOverlay>
  pid: string
  portfolio: ReturnType<typeof usePortfolioSnapshot>
  swaps: SwapStep[]
  umi: ReturnType<typeof useUmi>
}) {
  const programId = toPk(pid)
  const marketPk = toPk(portfolio.marketPublicKey!)
  const authorityPk = toPk(portfolio.marketAuthority!)
  const owner = umi.identity

  const registry = portfolio.registry!
  const priceCache = portfolio.priceCache!

  const preDeposits = mode === "existing" ? depositLongs : []
  const postDeposits = mode === "existing" ? [] : depositLongs

  const sendStep = async (label: string, builder: ReturnType<typeof transactionBuilder>) => {
    const sig = await builder.sendAndConfirm(umi)
    const sig58 = base58.deserialize(sig.signature)[0]
    notify({ label, signature: sig58 })
  }

  if (mode === "new") {
    const usdcMintStr = (assetData as Record<string, { zodial?: { mint?: string } }>).usdc?.zodial
      ?.mint
    if (!usdcMintStr) throw new Error("USDC mint not found in asset metadata")
    if (baseDepositUsd <= 0) throw new Error("Invalid base deposit amount for new account")
    const usdcMint = toPk(usdcMintStr)

    const faucetMint = umi.eddsa.findPda(programId, [
      bytes().serialize(new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116])),
      publicKeySerializer().serialize(marketPk),
      publicKeySerializer().serialize(usdcMint),
    ])[0]

    await sendStep(
      "Faucet USDC",
      faucetIx(umi, {
        amount: BigInt(baseDepositUsd) * BigInt(1_000_000),
        faucetMint,
        mint: usdcMint,
        user: owner,
      }),
    )

    const pool = portfolio.enrichedPools.find((p) => p.pool.mint.toString() === usdcMint.toString())
    if (!pool) throw new Error("USDC pool not found")
    const amountRaw = uiToRawU64(baseDepositUsd.toString(), pool.assetMeta?.decimals ?? 6)
    if (!amountRaw) throw new Error("Invalid USDC amount")
    await sendStep(
      "Deposit USDC",
      depositIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      }),
    )
  }

  for (const leg of preDeposits) {
    if (leg.amount <= 0) continue
    const pool = leg.asset
    const amountRaw = uiToRawU64(leg.amount.toString(), pool.assetMeta?.decimals ?? 6)
    if (!amountRaw) continue
    await sendStep(
      `Deposit ${pool.assetSymbol}`,
      depositIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      }),
    )
  }

  for (const leg of borrowLegs) {
    if (leg.amount <= 0) continue
    const pool = leg.asset
    const amountRaw = uiToRawU64(leg.amount.toString(), pool.assetMeta?.decimals ?? 6)
    if (!amountRaw) continue
    await sendStep(
      `Borrow ${leg.asset.assetSymbol}`,
      borrowIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        mint: pool.pool.mint,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      }),
    )
  }

  const SEED_FAUCET_MINT = new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116])

  for (const swap of swaps) {
    const fromPool = swap.from.asset
    const toPool = swap.to.asset
    const fromAmountRaw = uiToRawU64(swap.fromAmount.toString(), fromPool.assetMeta?.decimals ?? 6)
    if (!fromAmountRaw) continue

    const faucetMintFrom = umi.eddsa.findPda(programId, [
      bytes().serialize(SEED_FAUCET_MINT),
      publicKeySerializer().serialize(marketPk),
      publicKeySerializer().serialize(fromPool.pool.mint),
    ])[0]

    const faucetMintTo = umi.eddsa.findPda(programId, [
      bytes().serialize(SEED_FAUCET_MINT),
      publicKeySerializer().serialize(marketPk),
      publicKeySerializer().serialize(toPool.pool.mint),
    ])[0]

    await sendStep(
      `Swap ${swap.from.asset.assetSymbol} → ${swap.to.asset.assetSymbol}`,
      faucetSwapIx(umi, {
        amount: fromAmountRaw,
        assetRegistry: registry.publicKey,
        faucetMintFrom,
        faucetMintTo,
        mintFrom: fromPool.pool.mint,
        mintTo: toPool.pool.mint,
        priceCache: priceCache.publicKey,
        user: owner,
        userTokenFrom: deriveAta(umi, owner.publicKey, fromPool.pool.mint),
        userTokenTo: deriveAta(umi, owner.publicKey, toPool.pool.mint),
      }),
    )

    const toAmountRaw = uiToRawU64(swap.toAmount.toString(), toPool.assetMeta?.decimals ?? 6)
    if (!toAmountRaw) continue

    await sendStep(
      `Deposit ${swap.to.asset.assetSymbol}`,
      depositIx(umi, {
        amount: toAmountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, toPool.pool.mint),
        pool: toPool.pool.publicKey,
        poolVault: toPool.pool.vault,
      }),
    )
  }

  for (const leg of postDeposits) {
    if (leg.amount <= 0) continue
    const pool = leg.asset
    const amountRaw = uiToRawU64(leg.amount.toString(), pool.assetMeta?.decimals ?? 6)
    if (!amountRaw) continue
    await sendStep(
      `Deposit ${pool.assetSymbol}`,
      depositIx(umi, {
        amount: amountRaw,
        authority: authorityPk,
        market: marketPk,
        owner,
        ownerTokenAta: deriveAta(umi, owner.publicKey, pool.pool.mint),
        pool: pool.pool.publicKey,
        poolVault: pool.pool.vault,
      }),
    )
  }
}
