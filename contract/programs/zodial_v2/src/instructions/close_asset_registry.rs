use anchor_lang::prelude::*;

use crate::{error::ZodialError, state::*};

#[derive(Accounts)]
pub struct CloseAssetRegistry<'info> {
    #[account(
        mut,
        has_one = authority @ ZodialError::Unauthorized
    )]
    pub market: Account<'info, Market>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        close = receiver,
        seeds = [b"asset-reg", market.key().as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    /// Receiver of the reclaimed rent
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
}

pub fn close_asset_registry(ctx: Context<CloseAssetRegistry>) -> Result<()> {
    msg!("Closing AssetRegistry: {}", ctx.accounts.asset_registry.key());
    msg!("Rent receiver: {}", ctx.accounts.receiver.key());
    Ok(())
}
