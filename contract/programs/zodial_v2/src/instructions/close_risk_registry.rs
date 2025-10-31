use anchor_lang::prelude::*;

use crate::{error::ZodialError, state::*};

#[derive(Accounts)]
pub struct CloseRiskRegistry<'info> {
    #[account(
        mut,
        has_one = authority @ ZodialError::Unauthorized
    )]
    pub market: Account<'info, Market>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        close = receiver,
        seeds = [b"risk-reg", market.key().as_ref()],
        bump = risk_registry.bump
    )]
    pub risk_registry: Account<'info, RiskRegistry>,

    /// Receiver of the reclaimed rent
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
}

pub fn close_risk_registry(ctx: Context<CloseRiskRegistry>) -> Result<()> {
    msg!("Closing RiskRegistry: {}", ctx.accounts.risk_registry.key());
    msg!("Rent receiver: {}", ctx.accounts.receiver.key());
    Ok(())
}
