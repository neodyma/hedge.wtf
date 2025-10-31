use anchor_lang::prelude::*;

use crate::{error::ZodialError, state::*};

#[derive(Accounts)]
pub struct CloseObligation<'info> {
    /// Either the obligation owner OR the market authority can close
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(has_one = authority)]
    pub market: Account<'info, Market>,

    /// CHECK: Market authority for admin cleanup
    pub authority: SystemAccount<'info>,

    #[account(
        mut,
        close = receiver,
        has_one = market,
        seeds = [b"obligation", market.key().as_ref(), owner.key().as_ref()],
        bump = obligation.bump
    )]
    pub obligation: Account<'info, Obligation>,

    /// CHECK: Owner of the obligation (PDA seed component)
    pub owner: SystemAccount<'info>,

    /// Receiver of the reclaimed rent
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
}

pub fn close_obligation(ctx: Context<CloseObligation>) -> Result<()> {
    let signer = ctx.accounts.signer.key();
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    // Authorization: owner OR market authority
    require!(
        signer == owner || signer == authority,
        ZodialError::Unauthorized
    );

    // DEVNET: No validation - allows closing obligations with active positions
    // MAINNET TODO: Add validation to prevent closing obligations with non-zero positions:
    //
    // for pos in &ctx.accounts.obligation.positions {
    //     require!(
    //         pos.deposit_shares_q60 == 0 && pos.borrow_shares_q60 == 0,
    //         ZodialError::ObligationNotEmpty
    //     );
    // }
    //
    // This ensures users can't accidentally close obligations with active deposits/borrows.
    // For devnet testing, we allow force-closing to clean up stale PDAs.

    msg!("Closing Obligation: {}", ctx.accounts.obligation.key());
    msg!("Owner: {}", owner);
    msg!("Positions count: {}", ctx.accounts.obligation.positions.len());

    // Clear positions and reset owner to prevent reuse issues on devnet
    ctx.accounts.obligation.positions.clear();
    ctx.accounts.obligation.owner = Pubkey::default();

    msg!("Rent receiver: {}", ctx.accounts.receiver.key());

    Ok(())
}
