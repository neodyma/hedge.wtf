use anchor_lang::prelude::*;

use crate::{error::ZodialError, state::*};

#[derive(Accounts)]
pub struct ClosePriceCache<'info> {
    #[account(
        mut,
        has_one = authority @ ZodialError::Unauthorized
    )]
    pub market: Account<'info, Market>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        close = receiver,
        seeds = [b"price-cache", market.key().as_ref()],
        bump = price_cache.bump
    )]
    pub price_cache: Account<'info, PriceCache>,

    /// Receiver of the reclaimed rent
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
}

pub fn close_price_cache(ctx: Context<ClosePriceCache>) -> Result<()> {
    msg!("Closing PriceCache: {}", ctx.accounts.price_cache.key());
    msg!("Rent receiver: {}", ctx.accounts.receiver.key());
    Ok(())
}
