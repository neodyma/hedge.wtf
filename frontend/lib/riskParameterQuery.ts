import assetData from "@/data/combined_asset_data.json"

export interface AssetInfo {
  averageRiskParameters?: {
    avgLtv: number
    avgPenalty: number
    avgThreshold: number
  }
  cmcId: number
  mint: string
  name: string
  pythfeed: string
  riskParameters: RiskParameters[]
  symbol: string
}

export interface RiskParameters {
  liquidationPenalty: number
  liquidationThreshold: number
  ltv: number
  pairedAssetId: string
  pairedAssetName?: string
}

export function formatAssetInfo(asset: AssetInfo): string {
  let output = `
Asset: ${asset.name} (${asset.symbol})
Mint: ${asset.mint}
Pyth Feed: ${asset.pythfeed}
CMC ID: ${asset.cmcId}

Average Risk Parameters:
- LTV: ${asset.averageRiskParameters?.avgLtv}%
- Liquidation Threshold: ${asset.averageRiskParameters?.avgThreshold}%
- Liquidation Penalty: ${asset.averageRiskParameters?.avgPenalty}%

Risk Parameters by Paired Asset:
`

  asset.riskParameters.forEach((rp) => {
    output += `
  ${rp.pairedAssetName}:
    - LTV: ${rp.ltv}%
    - Liquidation Threshold: ${rp.liquidationThreshold}%
    - Liquidation Penalty: ${rp.liquidationPenalty}%
`
  })

  return output
}

export function getAllAssets(): AssetInfo[] {
  const assets: AssetInfo[] = []

  for (const [key, asset] of Object.entries(assetData)) {
    if (key === "_market") continue

    const assetObj = asset
    if ("zodial" in assetObj && assetObj.zodial?.mint) {
      assets.push(parseAssetData(key, assetObj))
    }
  }

  return assets
}

export function getAssetByCmcId(cmcId: number): AssetInfo | null {
  for (const [key, asset] of Object.entries(assetData)) {
    if (key === "_market") continue

    const assetObj = asset
    if ("cmc_id" in assetObj && assetObj.cmc_id === cmcId && assetObj.zodial?.mint) {
      return parseAssetData(key, assetObj)
    }
  }

  return null
}

export function getAssetByMint(mintAddress: string): AssetInfo | null {
  for (const [key, asset] of Object.entries(assetData)) {
    if (key === "_market") continue

    const assetObj = asset

    if ("zodial" in assetObj && assetObj.zodial?.mint === mintAddress) {
      return parseAssetData(key, assetObj)
    }
  }

  return null
}

export function getMintByCmcId(cmcId: number): null | string {
  const asset = getAssetByCmcId(cmcId)
  return asset ? asset.mint : null
}

export function getRiskParametersForPair(
  mintAddress: string,
  pairedAssetCmcId: number,
): null | RiskParameters {
  const asset = getAssetByMint(mintAddress)
  if (!asset) return null

  const params = asset.riskParameters.find((rp) => rp.pairedAssetId === pairedAssetCmcId.toString())

  return params || null
}

export function queryByMint(mintAddress: string): void {
  const asset = getAssetByMint(mintAddress)

  if (asset) {
    console.log(formatAssetInfo(asset))
  } else {
    console.log(`Asset with mint ${mintAddress} not found`)
  }
}

function getCmcIdName(cmcId: string): string {
  const cmcIdMap: { [key: string]: string } = {
    "825": "Tether (USDT)",
    "1027": "Ethereum (ETH)",
    "3408": "USD Coin (USDC)",
    "3717": "Wrapped Bitcoin (WBTC)",
    "5426": "Solana (SOL)",
    "8526": "Tesla (TSLA)",
    "11461": "NVIDIA (NVDA)",
    "22533": "MicroStrategy (MSTR)",
    "23095": "SP500",
    "26081": "Circle (CRCL)",
    "27772": "Apple (AAPL)",
  }

  return cmcIdMap[cmcId] || `CMC ID: ${cmcId}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAssetData(key: string, assetObj: any): AssetInfo {
  const riskParameters: RiskParameters[] = []

  // Extract risk parameters for each paired asset
  const ltvMatrix = assetObj.ltv_matrix || {}
  const thresholdMatrix = assetObj.threshold_matrix || {}
  const penaltyMatrix = assetObj.penalty_matrix || {}

  // Get all unique CMC IDs from the matrices
  const cmcIds = new Set([
    ...Object.keys(ltvMatrix),
    ...Object.keys(penaltyMatrix),
    ...Object.keys(thresholdMatrix),
  ])

  // Build risk parameters for each pair
  for (const cmcId of cmcIds) {
    const ltv = ltvMatrix[cmcId] || 0
    const threshold = thresholdMatrix[cmcId] || 0
    const penalty = penaltyMatrix[cmcId] || 0

    riskParameters.push({
      liquidationPenalty: penalty,
      liquidationThreshold: threshold,
      ltv: ltv,
      pairedAssetId: cmcId,
      pairedAssetName: getCmcIdName(cmcId),
    })
  }

  // Calculate averages
  const avgLtv =
    riskParameters.length > 0
      ? riskParameters.reduce((sum, rp) => sum + rp.ltv, 0) / riskParameters.length
      : 0
  const avgThreshold =
    riskParameters.length > 0
      ? riskParameters.reduce((sum, rp) => sum + rp.liquidationThreshold, 0) / riskParameters.length
      : 0
  const avgPenalty =
    riskParameters.length > 0
      ? riskParameters.reduce((sum, rp) => sum + rp.liquidationPenalty, 0) / riskParameters.length
      : 0

  return {
    averageRiskParameters: {
      avgLtv: Math.round(avgLtv * 100) / 100,
      avgPenalty: Math.round(avgPenalty * 100) / 100,
      avgThreshold: Math.round(avgThreshold * 100) / 100,
    },
    cmcId: assetObj.cmc_id,
    mint: assetObj.zodial.mint,
    name: assetObj.name,
    pythfeed: assetObj.pythfeed || "",
    riskParameters,
    symbol: assetObj.symbol,
  }
}
