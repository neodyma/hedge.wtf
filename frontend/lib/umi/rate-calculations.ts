import type { RateModel } from "@/clients/generated/types/rateModel"

const BPS_DENOM = 10000
const MAX_BORROW_APY_BPS_HARD = 50000 // 500% hard cap

/**
 * Convert basis points to percentage
 * @param bps - Value in basis points
 * @returns Percentage as number (e.g., 1234 bps -> 12.34%)
 */
export function bpsToPercent(bps: number): number {
  return bps / 100
}

/**
 * Calculate borrow APY based on utilization and rate model
 * @param rateModel - Pool's rate model
 * @param utilizationBps - Current utilization in basis points (0-10000)
 * @returns Borrow APY in basis points
 */
export function calculateBorrowApyBps(rateModel: RateModel, utilizationBps: number): number {
  const util = utilizationBps
  const kink = rateModel.kinkUtilBps
  let apy = rateModel.baseBorrowApyBps

  if (util <= kink) {
    // Before kink: apy = base + (util × slope1) / 10000
    apy = apy + Math.floor((util * rateModel.slope1Bps) / BPS_DENOM)
  } else {
    // After kink: apy = base + (kink × slope1) / 10000 + (extra × slope2) / 10000
    apy = apy + Math.floor((kink * rateModel.slope1Bps) / BPS_DENOM)
    const extra = util - kink
    apy = apy + Math.floor((extra * rateModel.slope2Bps) / BPS_DENOM)
  }

  // Apply soft and hard caps
  const soft = rateModel.maxBorrowApyBps
  const hard = MAX_BORROW_APY_BPS_HARD
  apy = Math.min(apy, soft, hard)

  return apy
}

/**
 * Calculate current APYs for a pool
 * @param rateModel - Pool's rate model
 * @param utilizationBps - Current utilization in basis points
 * @returns Object with borrow and deposit APYs as percentages
 */
export function calculateCurrentApys(
  rateModel: RateModel,
  utilizationBps: number,
): {
  borrowApyBps: number
  borrowApyPercent: number
  depositApyBps: number
  depositApyPercent: number
} {
  const borrowApyBps = calculateBorrowApyBps(rateModel, utilizationBps)
  const depositApyBps = calculateDepositApyBps(rateModel, utilizationBps)

  return {
    borrowApyBps,
    borrowApyPercent: bpsToPercent(borrowApyBps),
    depositApyBps,
    depositApyPercent: bpsToPercent(depositApyBps),
  }
}

/**
 * Calculate deposit APY based on utilization and rate model
 * deposit_apy = borrow_apy × utilization × (1 - reserve_factor)
 *
 * @param rateModel - Pool's rate model
 * @param utilizationBps - Current utilization in basis points (0-10000)
 * @returns Deposit APY in basis points
 */
export function calculateDepositApyBps(rateModel: RateModel, utilizationBps: number): number {
  const borrowApy = calculateBorrowApyBps(rateModel, utilizationBps)
  const util = utilizationBps
  const reserveFactor = rateModel.reserveFactorBps

  const net = Math.floor((borrowApy * util * (BPS_DENOM - reserveFactor)) / (BPS_DENOM * BPS_DENOM))

  return net
}

/**
 * Generate APY curve data points for visualization
 * @param rateModel - Pool's rate model
 * @param points - Number of data points to generate (default: 100)
 * @returns Array of {utilization, borrowApy, depositApy} objects
 */
export function generateApyCurve(
  rateModel: RateModel,
  points: number = 100,
): Array<{
  borrowApyPercent: number
  depositApyPercent: number
  utilizationPercent: number
}> {
  const curve: Array<{
    borrowApyPercent: number
    depositApyPercent: number
    utilizationPercent: number
  }> = []

  for (let i = 0; i <= points; i++) {
    const utilizationBps = Math.floor((i * BPS_DENOM) / points)
    const { borrowApyPercent, depositApyPercent } = calculateCurrentApys(rateModel, utilizationBps)

    curve.push({
      borrowApyPercent,
      depositApyPercent,
      utilizationPercent: bpsToPercent(utilizationBps),
    })
  }

  return curve
}

/**
 * Get APY at specific utilization points (0%, kink%, 100%)
 */
export function getKeyApyPoints(rateModel: RateModel): {
  atKink: { borrow: number; deposit: number }
  atMaxUtil: { borrow: number; deposit: number }
  atZeroUtil: { borrow: number; deposit: number }
} {
  const atZero = calculateCurrentApys(rateModel, 0)
  const atKink = calculateCurrentApys(rateModel, rateModel.kinkUtilBps)
  const atMax = calculateCurrentApys(rateModel, BPS_DENOM)

  return {
    atKink: {
      borrow: atKink.borrowApyPercent,
      deposit: atKink.depositApyPercent,
    },
    atMaxUtil: {
      borrow: atMax.borrowApyPercent,
      deposit: atMax.depositApyPercent,
    },
    atZeroUtil: {
      borrow: atZero.borrowApyPercent,
      deposit: atZero.depositApyPercent,
    },
  }
}
