use crate::constants::{BPS_DENOM, MAX_BORROW_APY_BPS_HARD, SECS_YEAR};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct RateModel {
    pub kink_util_bps: u16,       // 0..10000
    pub base_borrow_apy_bps: u16, // at 0% util
    pub slope1_bps: u16,          // up to kink
    pub slope2_bps: u16,          // past kink
    pub reserve_factor_bps: u16,  // platform take, 0..10000
    pub max_borrow_apy_bps: u16,  // soft cap
}

impl RateModel {
    /// utilization -> borrow apy
    pub fn borrow_apy_bps(&self, util_bps: u16) -> u16 {
        let util = util_bps as u64;
        let kink = self.kink_util_bps as u64;
        let mut apy = self.base_borrow_apy_bps as u64;

        if util <= kink {
            apy = apy.saturating_add((util.saturating_mul(self.slope1_bps as u64)) / BPS_DENOM);
        } else {
            // -> kink
            apy = apy.saturating_add((kink.saturating_mul(self.slope1_bps as u64)) / BPS_DENOM);
            // kink ->
            let extra = util.saturating_sub(kink);
            apy = apy.saturating_add((extra.saturating_mul(self.slope2_bps as u64)) / BPS_DENOM);
        }

        let soft = self.max_borrow_apy_bps as u64;
        let hard = MAX_BORROW_APY_BPS_HARD as u64;
        apy = apy.min(soft).min(hard);
        apy as u16
    }

    /// deposit apy = borrow apy * utilization * (1 - reserve)
    pub fn deposit_apy_bps(&self, util_bps: u16) -> u16 {
        let borrow = self.borrow_apy_bps(util_bps) as u64;
        let util = util_bps as u64;
        let take = self.reserve_factor_bps as u64;

        // borrow * (util/1e4) * (1 - take/1e4)
        let net = borrow
            .saturating_mul(util)
            .saturating_mul(BPS_DENOM.saturating_sub(take))
            / (BPS_DENOM * BPS_DENOM);

        net as u16
    }

    /// apy(bps) to per-second rate (q16.16)
    /// then advance factor ~= 1 + r * dt (simple accrual for now)
    pub fn advance_factor_simple(
        &self,
        factor_q60: u128,
        util_bps: u16,
        elapsed_secs: u64,
        is_borrow: bool,
    ) -> u128 {
        let apy_bps = if is_borrow {
            self.borrow_apy_bps(util_bps)
        } else {
            self.deposit_apy_bps(util_bps)
        } as u128;

        if apy_bps == 0 || elapsed_secs == 0 {
            return factor_q60;
        }

        // r_per_sec ~= apy / 10000 / SECS_YEAR
        // factor *= (1 + r_per_sec * dt) in Q60
        // -> factor_new = factor + factor * apy_bps * dt / (10000 * SECS_YEAR)
        let num = (factor_q60)
            .saturating_mul(apy_bps)
            .saturating_mul(elapsed_secs as u128);

        let denom = (crate::constants::BPS_DENOM as u128) * (SECS_YEAR as u128);
        factor_q60.saturating_add(num / denom)
    }
}
