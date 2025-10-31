use anchor_lang::prelude::*;

use crate::{
    constants::*,
    events::MarketInitialized,
    state::{AssetRegistry, Market, PriceCache, PriceMode, RiskRegistry},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitMarketArgs {
    pub max_assets: u16,
    pub max_positions: u16,
    pub default_ltv_bps: u16,
    pub default_liq_threshold_bps: u16,
    pub default_liq_bonus_bps: u16,
    pub price_mode: PriceMode,
    pub pyth_max_age_secs: u64,
}

#[derive(Accounts)]
#[instruction(args: InitMarketArgs)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Market::INIT_SPACE,
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = payer,
        space = 8 + AssetRegistry::INIT_SPACE,
        seeds = [SEED_ASSET_REG, market.key().as_ref()],
        bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        init,
        payer = payer,
        space = 8 + RiskRegistry::INIT_SPACE,
        seeds = [SEED_RISK_REG, market.key().as_ref()],
        bump
    )]
    pub risk_registry: Account<'info, RiskRegistry>,

    #[account(
        init,
        payer = payer,
        space = 8 + PriceCache::INIT_SPACE,
        seeds = [SEED_PRICE_CACHE, market.key().as_ref()],
        bump
    )]
    pub price_cache: Account<'info, PriceCache>,

    pub system_program: Program<'info, System>,
}

pub fn init_market(ctx: Context<InitMarket>, args: InitMarketArgs) -> Result<()> {
    require!(
        args.max_assets as usize <= MAX_ASSETS,
        crate::error::ZodialError::ExceedsMaxAssets
    );
    require!(
        args.max_positions as usize <= MAX_POSITIONS,
        crate::error::ZodialError::ExceedsMaxPositions
    );

    let market_bump = ctx.bumps.market;
    let price_cache_bump = ctx.bumps.price_cache;

    {
        let m = &mut ctx.accounts.market;
        m.authority = ctx.accounts.authority.key();
        m.max_assets = args.max_assets;
        m.max_positions = args.max_positions;
        m.default_ltv_bps = args.default_ltv_bps;
        m.default_liq_threshold_bps = args.default_liq_threshold_bps;
        m.default_liq_bonus_bps = args.default_liq_bonus_bps;
        m.price_mode = args.price_mode;
        m.version = 1;
        m.bump = market_bump;
        m.price_cache_bump = price_cache_bump;
        m.paused = false;
        m.pyth_max_age_secs = args.pyth_max_age_secs;
    }

    {
        let ar = &mut ctx.accounts.asset_registry;
        ar.market = ctx.accounts.market.key();
        ar.bump = ctx.bumps.asset_registry;
        ar.count = 0;
        ar.assets = Vec::with_capacity(0); // Start empty; bounded by #[max_len]
    }

    // Risk registry
    {
        let rr = &mut ctx.accounts.risk_registry;
        rr.market = ctx.accounts.market.key();
        rr.bump = ctx.bumps.risk_registry;
        rr.dim = 0;
        rr.pairs = Vec::with_capacity(0); // append on asset register
    }

    // Price cache
    {
        let pc = &mut ctx.accounts.price_cache;
        pc.market = ctx.accounts.market.key();
        pc.bump = price_cache_bump;
        pc.last_slot = 0;
        pc.prices = Vec::with_capacity(0);
    }

    emit!(MarketInitialized {
        market: ctx.accounts.market.key(),
        authority: ctx.accounts.authority.key(),
        max_assets: args.max_assets,
        max_positions: args.max_positions,
    });

    Ok(())
}
