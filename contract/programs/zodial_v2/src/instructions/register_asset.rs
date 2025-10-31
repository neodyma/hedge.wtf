use crate::{
    constants::*,
    error::ZodialError,
    events::AssetRegistered,
    state::{AssetMeta, AssetRegistry, Market, RiskRegistry},
};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterAssetArgs {
    pub mint: Pubkey,
    pub decimals: u8,
    pub pyth_price: Pubkey, // optional; or Pubkey::default()
    pub pyth_feed_id: Option<[u8; 66]>, // Optional Pyth Pull oracle feed ID
    pub enabled_as_collateral: bool,
}

#[derive(Accounts)]
pub struct RegisterAsset<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
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

    pub system_program: Program<'info, System>,
}

pub fn register_asset(ctx: Context<RegisterAsset>, args: RegisterAssetArgs) -> Result<()> {
    let ar = &mut ctx.accounts.asset_registry;
    let rr = &mut ctx.accounts.risk_registry;
    let mkt = &ctx.accounts.market;

    require!(ar.count < mkt.max_assets, ZodialError::ExceedsMaxAssets);

    let index = ar.count;
    ar.assets.push(AssetMeta {
        mint: args.mint,
        pyth_price: args.pyth_price,
        pyth_feed_id: args.pyth_feed_id.unwrap_or([0u8; 66]),
        decimals: args.decimals,
        enabled_as_collateral: args.enabled_as_collateral,
        index,
    });
    ar.count = ar
        .count
        .checked_add(1)
        .ok_or(error!(ZodialError::MathOverflow))?;

    rr.dim = ar.count;

    emit!(AssetRegistered {
        market: mkt.key(),
        mint: args.mint,
        index,
    });

    Ok(())
}
