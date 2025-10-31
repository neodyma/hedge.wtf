use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ZodialError,
    events::Deposit as DepositEvent,
    state::{AssetRegistry, Market, Obligation, Pool, Position},
    utils::{
        accrual::accrue_pool,
        math::{div_u64_by_u68_to_q60, unpack_u68f60},
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DepositArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: DepositArgs)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [SEED_MARKET, market.authority.as_ref()],
        bump = market.bump,
        has_one = authority,
        constraint = !market.paused @ ZodialError::MarketPaused
    )]
    pub market: Account<'info, Market>,

    /// CHECK: read-only
    pub authority: UncheckedAccount<'info>,

    #[account(
        seeds = [SEED_ASSET_REG, market.key().as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        mut,
        seeds = [SEED_POOL, market.key().as_ref(), pool.mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = owner_token_ata.owner == owner.key(),
        constraint = owner_token_ata.mint == pool.mint
    )]
    pub owner_token_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = pool_vault.key() == pool.vault,
        constraint = pool_vault.mint == pool.mint
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for vault; signer seeds used only if ever needed
    #[account(
        seeds = [SEED_VAULT_AUTH, pool.key().as_ref()],
        bump = pool.vault_auth_bump
    )]
    pub vault_auth: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Obligation::INIT_SPACE,
        seeds = [SEED_OBLIGATION, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub obligation: Account<'info, Obligation>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn deposit(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    accrue_pool(&mut ctx.accounts.pool, now);

    let deposit_idx = unpack_u68f60(ctx.accounts.pool.deposit_fac_q60);
    let shares_q60 = div_u64_by_u68_to_q60(args.amount, deposit_idx)?;

    {
        let ob = &mut ctx.accounts.obligation;
        // Check if this is a fresh initialization or reuse with stale data
        let is_fresh_init = ob.owner == Pubkey::default() || ob.market != ctx.accounts.market.key();

        if is_fresh_init {
            ob.owner = ctx.accounts.owner.key();
            ob.market = ctx.accounts.market.key();
            ob.bump = ctx.bumps.obligation;
            ob.positions.clear(); // Clear stale positions from previous close or market change
        } else {
            require!(
                ob.owner == ctx.accounts.owner.key(),
                ZodialError::Unauthorized
            );
            require!(
                ob.market == ctx.accounts.market.key(),
                ZodialError::Unauthorized
            );

            // DEVNET SAFETY: Remove positions with mints not in asset registry (stale data cleanup)
            // This handles cases where obligations have stale positions from previous test runs
            let asset_registry = &ctx.accounts.asset_registry;
            ob.positions.retain(|pos| {
                asset_registry.assets.iter().any(|a| a.mint == pos.mint)
            });
        }

        if let Some(pos) = ob
            .positions
            .iter_mut()
            .find(|p| p.mint == ctx.accounts.pool.mint)
        {
            pos.deposit_shares_q60 = pos
                .deposit_shares_q60
                .checked_add(shares_q60)
                .ok_or(error!(ZodialError::MathOverflow))?;
        } else {
            require!(
                ob.positions.len() < ctx.accounts.market.max_positions as usize,
                ZodialError::ExceedsMaxPositions
            );

            ob.positions.push(Position {
                mint: ctx.accounts.pool.mint,
                deposit_shares_q60: shares_q60,
                borrow_shares_q60: 0u128,
            });
        }
    }

    {
        let p = &mut ctx.accounts.pool;
        p.total_deposit_shares_q60 = p
            .total_deposit_shares_q60
            .checked_add(shares_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
    }

    // transfer -> vault
    {
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token_ata.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::transfer(cpi, args.amount)?;
    }

    emit!(DepositEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        mint: ctx.accounts.pool.mint,
        amount: args.amount,
        shares_q60,
    });

    Ok(())
}
