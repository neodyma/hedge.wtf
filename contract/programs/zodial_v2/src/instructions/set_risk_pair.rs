use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ZodialError,
    events::RiskPairSet,
    state::risk_registry::tri_index,
    state::{AssetRegistry, Market, RiskPair, RiskRegistry},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetRiskPairArgs {
    pub a_mint: Pubkey,
    pub b_mint: Pubkey,
    pub ltv_bps: u16,
    pub liq_threshold_bps: u16,
    pub liq_bonus_bps: u16,
}

#[derive(Accounts)]
pub struct SetRiskPair<'info> {
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

pub fn set(ctx: Context<SetRiskPair>, args: SetRiskPairArgs) -> Result<()> {
    let ar = &ctx.accounts.asset_registry;
    let rr = &mut ctx.accounts.risk_registry;
    let mkt = &ctx.accounts.market;

    // map mints -> indices
    let ai = ar
        .assets
        .iter()
        .find(|a| a.mint == args.a_mint)
        .map(|a| a.index)
        .ok_or(error!(ZodialError::AssetNotRegistered))?;
    let bi = ar
        .assets
        .iter()
        .find(|a| a.mint == args.b_mint)
        .map(|a| a.index)
        .ok_or(error!(ZodialError::AssetNotRegistered))?;

    // ensure dim matches registry count
    let dim = ar.count;
    if rr.dim != dim {
        rr.dim = dim;
    }

    // expand triangular storage
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

    let k = tri_index(ai, bi, dim);
    rr.pairs[k] = RiskPair {
        ltv_bps: args.ltv_bps,
        liq_threshold_bps: args.liq_threshold_bps,
        liq_bonus_bps: args.liq_bonus_bps,  
    };

    emit!(RiskPairSet {
        market: mkt.key(),
        a_mint: args.a_mint,
        b_mint: args.b_mint,
        a_index: ai,
        b_index: bi,
        ltv_bps: args.ltv_bps,
        liq_threshold_bps: args.liq_threshold_bps,
        liq_bonus_bps: args.liq_bonus_bps,
    });

    Ok(())
}
