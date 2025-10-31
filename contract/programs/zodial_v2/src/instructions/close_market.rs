use anchor_lang::prelude::*;

use crate::{error::ZodialError, state::*};

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(
        mut,
        close = receiver,
        has_one = authority @ ZodialError::Unauthorized,
        seeds = [b"market", authority.key().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    pub authority: Signer<'info>,

    /// Receiver of the reclaimed rent
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
}

pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
    msg!("Closing Market: {}", ctx.accounts.market.key());
    msg!("Rent receiver: {}", ctx.accounts.receiver.key());
    Ok(())
}
