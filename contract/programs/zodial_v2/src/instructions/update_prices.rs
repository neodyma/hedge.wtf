use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ZodialError,
    events::PricesUpdated,
    state::{AssetRegistry, Market, PriceCache, PriceEntry, PriceMode},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PriceUpdate {
    pub mint: Pubkey,
    pub price_q60: u128,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdatePricesArgs {
    pub updates: Vec<PriceUpdate>,
}

#[derive(Accounts)]
#[instruction(args: UpdatePricesArgs)]
pub struct UpdatePrices<'info> {
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
        seeds = [SEED_PRICE_CACHE, market.key().as_ref()],
        bump = market.price_cache_bump
    )]
    pub price_cache: Account<'info, PriceCache>,
}

pub fn update(ctx: Context<UpdatePrices>, args: UpdatePricesArgs) -> Result<()> {
    require!(
        matches!(ctx.accounts.market.price_mode, PriceMode::Cache),
        ZodialError::UnsupportedMode
    );

    let ar = &ctx.accounts.asset_registry;
    let pc = &mut ctx.accounts.price_cache;

    for u in args.updates.iter() {
        let idx = ar
            .assets
            .iter()
            .find(|a| a.mint == u.mint)
            .map(|a| a.index)
            .ok_or(error!(ZodialError::AssetNotRegistered))?;

        if let Some(entry) = pc.prices.iter_mut().find(|e| e.asset_index == idx) {
            entry.price_q60 = u.price_q60;
        } else {
            pc.prices.push(PriceEntry {
                asset_index: idx,
                price_q60: u.price_q60,
            });
        }
    }

    pc.last_slot = Clock::get()?.slot;

    emit!(PricesUpdated {
        market: ctx.accounts.market.key(),
        count: args.updates.len() as u16,
        slot: pc.last_slot,
    });

    Ok(())
}
