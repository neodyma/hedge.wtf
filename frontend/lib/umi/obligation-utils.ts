import type { Pool } from "@/clients/generated/accounts/pool"

import { q60ToNumber } from "./pool-utils"

/**
 * Calculate user's actual borrow amount from their borrow shares
 * Formula: (userBorrowShares × borrowFactor / 2^60) / 2^60 / 10^decimals
 *
 * @param userSharesQ60 - User's borrow shares in Q60 format
 * @param pool - Pool account containing the borrow factor
 * @param decimals - Token decimals from AssetMeta
 * @returns Actual borrow amount in UI units (human-readable)
 */
export function calculateUserBorrowAmount(
  userSharesQ60: bigint,
  pool: Pool,
  decimals: number,
): number {
  const shares = userSharesQ60
  const factor = pool.borrowFacQ60
  // shares × factor gives us Q120, divide by Q60 to get Q60
  const totalQ60 = (shares * factor) / 2n ** 60n
  // Convert Q60 to number
  const atomic = q60ToNumber(totalQ60)
  return atomic / Math.pow(10, decimals)
}

/**
 * Calculate user's actual deposit amount from their deposit shares
 * Formula: (userDepositShares × depositFactor / 2^60) / 2^60 / 10^decimals
 *
 * @param userSharesQ60 - User's deposit shares in Q60 format
 * @param pool - Pool account containing the deposit factor
 * @param decimals - Token decimals from AssetMeta
 * @returns Actual deposit amount in UI units (human-readable)
 */
export function calculateUserDepositAmount(
  userSharesQ60: bigint,
  pool: Pool,
  decimals: number,
): number {
  const shares = userSharesQ60
  const factor = pool.depositFacQ60
  const totalQ60 = (shares * factor) / 2n ** 60n
  const atomic = q60ToNumber(totalQ60)
  return atomic / Math.pow(10, decimals)
}
