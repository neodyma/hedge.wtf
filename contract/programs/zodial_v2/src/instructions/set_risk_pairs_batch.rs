use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ZodialError,
    events::RiskPairsBatchSet,
    state::risk_registry::tri_index,
    state::{AssetRegistry, Market, RiskPair, RiskRegistry},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RiskPairEntry {
    pub a_index: u16,
    pub b_index: u16,
    pub ltv_bps: u16,
    pub liq_threshold_bps: u16,
    pub liq_bonus_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetRiskPairsBatchArgs {
    pub pairs: Vec<RiskPairEntry>,
}

#[derive(Accounts)]
pub struct SetRiskPairsBatch<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [SEED_ASSET_REG, market.key().as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        mut,
        seeds = [SEED_RISK_REG, market.key().as_ref()],
        bump = risk_registry.bump
    )]
    pub risk_registry: Account<'info, RiskRegistry>,
}

pub fn set_batch(
    ctx: Context<SetRiskPairsBatch>,
    args: SetRiskPairsBatchArgs,
) -> Result<()> {
    let ar = &ctx.accounts.asset_registry;
    let rr = &mut ctx.accounts.risk_registry;
    let mkt = &ctx.accounts.market;

    // Ensure dim matches registry count
    let dim = ar.count;
    if rr.dim != dim {
        rr.dim = dim;
    }

    // Expand triangular storage if needed
    let needed = (dim as usize * (dim as usize + 1)) / 2;
    if rr.pairs.len() < needed {
        let fill = RiskPair {
            ltv_bps: mkt.default_ltv_bps,
            liq_threshold_bps: mkt.default_liq_threshold_bps,
            liq_bonus_bps: mkt.default_liq_bonus_bps,
        };
        while rr.pairs.len() < needed {
            rr.pairs.push(fill.clone());
        }
    }

    // Validate and set all pairs in batch
    for entry in args.pairs.iter() {
        // Validate indices are within bounds
        require!(
            entry.a_index < dim && entry.b_index < dim,
            ZodialError::AssetNotRegistered
        );

        let k = tri_index(entry.a_index, entry.b_index, dim);
        rr.pairs[k] = RiskPair {
            ltv_bps: entry.ltv_bps,
            liq_threshold_bps: entry.liq_threshold_bps,
            liq_bonus_bps: entry.liq_bonus_bps,
        };
    }

    emit!(RiskPairsBatchSet {
        market: mkt.key(),
        count: args.pairs.len() as u16,
    });

    Ok(())
}
