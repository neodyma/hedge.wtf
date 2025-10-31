use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, CloseAccount, Token, TokenAccount};

use crate::{constants::*, error::ZodialError, state::*};

#[derive(Accounts)]
pub struct ClosePool<'info> {
    /// Market authority (only admin can close pools)
    pub authority: Signer<'info>,

    #[account(
        has_one = authority @ ZodialError::Unauthorized,
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// The pool to close
    #[account(
        mut,
        close = receiver,
        has_one = market,
        seeds = [SEED_POOL, market.key().as_ref(), pool.mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    /// The pool's vault (token account)
    #[account(
        mut,
        seeds = [SEED_VAULT, pool.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Vault authority PDA
    #[account(
        seeds = [SEED_VAULT_AUTH, pool.key().as_ref()],
        bump = pool.vault_auth_bump
    )]
    pub vault_auth: UncheckedAccount<'info>,

    /// The token mint (needed for burning)
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,

    /// Receiver of the reclaimed rent (from both pool and vault)
    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let vault = &ctx.accounts.vault;

    msg!("Closing Pool: {}", pool.key());
    msg!("Mint: {}", pool.mint);
    msg!("Vault: {}", vault.key());

    // DEVNET: No validation - allows closing pools with balances for testing cleanup
    // MAINNET TODO: Add validation to prevent closing pools with active positions:
    //
    // require!(
    //     vault.amount == 0,
    //     ZodialError::PoolNotEmpty
    // );
    // require!(
    //     pool.total_borrow_shares_q60 == 0,
    //     ZodialError::PoolNotEmpty
    // );
    // require!(
    //     pool.total_deposit_shares_q60 == 0,
    //     ZodialError::PoolNotEmpty
    // );
    //
    // This ensures pools can't be accidentally closed with active deposits/borrows.
    // For devnet testing, we allow force-closing to clean up stale PDAs.

    msg!("Vault balance: {} tokens", vault.amount);
    msg!("Total borrow shares: {}", pool.total_borrow_shares_q60);
    msg!("Total deposit shares: {}", pool.total_deposit_shares_q60);

    // Setup PDA seeds for signing
    let pool_key = pool.key();
    let seeds = &[
        SEED_VAULT_AUTH,
        pool_key.as_ref(),
        &[pool.vault_auth_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Burn any remaining tokens in the vault (required before closing token account)
    if vault.amount > 0 {
        msg!("Burning {} tokens from vault before closing", vault.amount);

        let burn_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.vault_auth.to_account_info(),
        };

        let burn_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            burn_accounts,
            signer_seeds,
        );

        token::burn(burn_ctx, vault.amount)?;
        msg!("✓ Tokens burned successfully");
    }

    // Close the vault token account (returns rent to receiver)
    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.receiver.to_account_info(),
        authority: ctx.accounts.vault_auth.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    token::close_account(cpi_ctx)?;

    msg!("Vault closed successfully");
    msg!("Rent receiver: {}", ctx.accounts.receiver.key());

    // Pool account will be closed automatically by Anchor's `close` constraint

    Ok(())
}
