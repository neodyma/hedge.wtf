use anchor_lang::prelude::*;
use fixed::types::U68F60;

use crate::{
    constants::BPS_DENOM,
    error::ZodialError,
    state::risk_registry::tri_index,
    state::{AssetRegistry, Market, Obligation, Pool, PriceCache, RiskRegistry},
    utils::math::{mul_q60_by_u68_to_u64, unpack_u68f60},
};

#[inline]
fn amount_to_usd_q60(amount_atomic: u64, decimals: u8, price_q60: u128) -> u128 {
    // value = (amount / 10^decimals) * price
    let base = U68F60::from_num(amount_atomic as u128);
    let denom = U68F60::from_num(10u128.pow(decimals as u32));
    let units = base.saturating_div(denom);
    let price = U68F60::from_bits(price_q60);
    let v = units.saturating_mul(price);
    v.to_bits()
}

#[inline]
fn price_for_index_q60(
    market: &Market,
    price_cache: Option<&PriceCache>,
    idx: u16,
) -> Result<u128> {
    match market.price_mode {
        crate::state::PriceMode::Mock => Ok(U68F60::from_num(1u64).to_bits()),
        crate::state::PriceMode::Cache => {
            let pc = price_cache.ok_or(error!(ZodialError::PriceStale))?;
            let found = pc
                .prices
                .iter()
                .find(|p| p.asset_index == idx)
                .ok_or(error!(ZodialError::PriceStale))?;
            Ok(found.price_q60)
        }
    }
}

#[inline]
fn ltv_for_pair_bps(market: &Market, risk: &RiskRegistry, i: u16, j: u16) -> u16 {
    if risk.dim == 0 {
        return market.default_ltv_bps;
    }
    if i >= risk.dim || j >= risk.dim {
        return market.default_ltv_bps;
    }
    let k = tri_index(i, j, risk.dim);
    if let Some(p) = risk.pairs.get(k) {
        if p.ltv_bps == 0 {
            market.default_ltv_bps
        } else {
            p.ltv_bps
        }
    } else {
        market.default_ltv_bps
    }
}

#[inline]
fn liq_threshold_for_pair_bps(market: &Market, risk: &RiskRegistry, i: u16, j: u16) -> u16 {
    if risk.dim == 0 {
        return market.default_liq_threshold_bps;
    }
    if i >= risk.dim || j >= risk.dim {
        return market.default_liq_threshold_bps;
    }
    let k = tri_index(i, j, risk.dim);
    if let Some(p) = risk.pairs.get(k) {
        if p.liq_threshold_bps == 0 {
            market.default_liq_threshold_bps
        } else {
            p.liq_threshold_bps
        }
    } else {
        market.default_liq_threshold_bps
    }
}

/// health = ( sum_deposits[ value_d * sum_borrows[ share_b * LTV(d,b) ] ] ) / total_borrow_value
/// with share_b = borrow_value / total_borrow_value.
/// >=1000 = healthy
pub fn compute_health_score_q3(
    obligation: &Obligation,
    market: &Market,
    assets: &AssetRegistry,
    risk: &RiskRegistry,
    price_cache: Option<&PriceCache>,
    // all pool mints present in obligation.positions
    pools: &[Pool],
) -> Result<u128> {
    let find_asset = |mint: &Pubkey| -> Option<(u16, u8)> {
        assets
            .assets
            .iter()
            .find(|a| a.mint == *mint)
            .map(|a| (a.index, a.decimals))
    };
    let find_pool = |mint: &Pubkey| -> Option<&Pool> { pools.iter().find(|p| p.mint == *mint) };

    let mut deposit_values: Vec<(u16 /*i*/, u128 /*price*/)> = Vec::new();
    let mut borrow_values: Vec<(u16, u128)> = Vec::new();
    let mut total_deposit_q60: u128 = 0;
    let mut total_borrow_q60: u128 = 0;

    for pos in &obligation.positions {
        let (asset_idx, decimals) =
            find_asset(&pos.mint).ok_or(error!(ZodialError::AssetNotRegistered))?;
        let pool = find_pool(&pos.mint).ok_or(error!(ZodialError::PoolNotFound))?;

        let d_idx = unpack_u68f60(pool.deposit_fac_q60);
        let b_idx = unpack_u68f60(pool.borrow_fac_q60);

        let dep_atomic = if pos.deposit_shares_q60 > 0 {
            mul_q60_by_u68_to_u64(pos.deposit_shares_q60, d_idx)?
        } else {
            0
        };
        let bor_atomic = if pos.borrow_shares_q60 > 0 {
            mul_q60_by_u68_to_u64(pos.borrow_shares_q60, b_idx)?
        } else {
            0
        };

        let price_q60 = price_for_index_q60(market, price_cache, asset_idx)?;

        if dep_atomic > 0 {
            let v = amount_to_usd_q60(dep_atomic, decimals, price_q60);
            total_deposit_q60 = total_deposit_q60.saturating_add(v);
            deposit_values.push((asset_idx, v));
        }
        if bor_atomic > 0 {
            let v = amount_to_usd_q60(bor_atomic, decimals, price_q60);
            total_borrow_q60 = total_borrow_q60.saturating_add(v);
            borrow_values.push((asset_idx, v));
        }
    }

    if borrow_values.is_empty() {
        return Ok(u128::MAX);
    }
    if total_borrow_q60 == 0 {
        return Ok(u128::MAX);
    }

    let mut weighted_collateral_q60: u128 = 0;

    for (dep_idx, dep_val_q60) in &deposit_values {
        // Sum over borrows: share_b * LTV(dep, b)  (ltv in bps)
        let mut deposit_risk_sum_bps: u128 = 0;
        for (bor_idx, bor_val_q60) in &borrow_values {
            let ltv_bps = ltv_for_pair_bps(market, risk, *dep_idx, *bor_idx) as u128;
            // share_b = bor_val / total_borrow
            let share_b = (*bor_val_q60).saturating_mul(BPS_DENOM as u128) / total_borrow_q60; // in bps
            let contrib_bps = (ltv_bps.saturating_mul(share_b)) / (BPS_DENOM as u128); // bps
            deposit_risk_sum_bps = deposit_risk_sum_bps.saturating_add(contrib_bps);
        }
        let weighted = (*dep_val_q60).saturating_mul(deposit_risk_sum_bps) / (BPS_DENOM as u128);
        weighted_collateral_q60 = weighted_collateral_q60.saturating_add(weighted);
    }

    // health = weighted_collateral / total_borrow; scale by 1000
    if weighted_collateral_q60 == 0 {
        return Ok(0);
    }
    let health_q3 = weighted_collateral_q60
        .saturating_mul(1000)
        .checked_div(total_borrow_q60)
        .unwrap_or(0);

    Ok(health_q3)
}

pub fn assert_healthy_at_least_1(
    obligation: &Obligation,
    market: &Market,
    assets: &AssetRegistry,
    risk: &RiskRegistry,
    price_cache: Option<&PriceCache>,
    pools: &[Pool],
) -> Result<u128> {
    let health = super::health::compute_health_score_q3(
        obligation,
        market,
        assets,
        risk,
        price_cache,
        pools,
    )?;
    require!(health >= 1000, ZodialError::HealthCheckFailed);
    Ok(health)
}

/// Compute health score using liquidation thresholds instead of LTV
/// This is used for liquidation checks - position is unhealthy when < 1000
pub fn compute_liquidation_health_score_q3(
    obligation: &Obligation,
    market: &Market,
    assets: &AssetRegistry,
    risk: &RiskRegistry,
    price_cache: Option<&PriceCache>,
    pools: &[Pool],
) -> Result<u128> {
    let find_asset = |mint: &Pubkey| -> Option<(u16, u8)> {
        assets
            .assets
            .iter()
            .find(|a| a.mint == *mint)
            .map(|a| (a.index, a.decimals))
    };
    let find_pool = |mint: &Pubkey| -> Option<&Pool> { pools.iter().find(|p| p.mint == *mint) };

    let mut deposit_values: Vec<(u16, u128)> = Vec::new();
    let mut borrow_values: Vec<(u16, u128)> = Vec::new();
    let mut total_deposit_q60: u128 = 0;
    let mut total_borrow_q60: u128 = 0;

    for pos in &obligation.positions {
        let (asset_idx, decimals) =
            find_asset(&pos.mint).ok_or(error!(ZodialError::AssetNotRegistered))?;
        let pool = find_pool(&pos.mint).ok_or(error!(ZodialError::PoolNotFound))?;

        let d_idx = unpack_u68f60(pool.deposit_fac_q60);
        let b_idx = unpack_u68f60(pool.borrow_fac_q60);

        let dep_atomic = if pos.deposit_shares_q60 > 0 {
            mul_q60_by_u68_to_u64(pos.deposit_shares_q60, d_idx)?
        } else {
            0
        };
        let bor_atomic = if pos.borrow_shares_q60 > 0 {
            mul_q60_by_u68_to_u64(pos.borrow_shares_q60, b_idx)?
        } else {
            0
        };

        let price_q60 = price_for_index_q60(market, price_cache, asset_idx)?;

        if dep_atomic > 0 {
            let v = amount_to_usd_q60(dep_atomic, decimals, price_q60);
            total_deposit_q60 = total_deposit_q60.saturating_add(v);
            deposit_values.push((asset_idx, v));
        }
        if bor_atomic > 0 {
            let v = amount_to_usd_q60(bor_atomic, decimals, price_q60);
            total_borrow_q60 = total_borrow_q60.saturating_add(v);
            borrow_values.push((asset_idx, v));
        }
    }

    if borrow_values.is_empty() {
        return Ok(u128::MAX);
    }
    if total_borrow_q60 == 0 {
        return Ok(u128::MAX);
    }

    let mut weighted_collateral_q60: u128 = 0;

    // Use liquidation threshold instead of LTV
    for (dep_idx, dep_val_q60) in &deposit_values {
        let mut deposit_risk_sum_bps: u128 = 0;
        for (bor_idx, bor_val_q60) in &borrow_values {
            let liq_threshold_bps = liq_threshold_for_pair_bps(market, risk, *dep_idx, *bor_idx) as u128;
            let share_b = (*bor_val_q60).saturating_mul(BPS_DENOM as u128) / total_borrow_q60;
            let contrib_bps = (liq_threshold_bps.saturating_mul(share_b)) / (BPS_DENOM as u128);
            deposit_risk_sum_bps = deposit_risk_sum_bps.saturating_add(contrib_bps);
        }
        let weighted = (*dep_val_q60).saturating_mul(deposit_risk_sum_bps) / (BPS_DENOM as u128);
        weighted_collateral_q60 = weighted_collateral_q60.saturating_add(weighted);
    }

    if weighted_collateral_q60 == 0 {
        return Ok(0);
    }
    let health_q3 = weighted_collateral_q60
        .saturating_mul(1000)
        .checked_div(total_borrow_q60)
        .unwrap_or(0);

    Ok(health_q3)
}
