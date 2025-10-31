use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ZodialError,
    events::Repay as RepayEvent,
    state::{AssetRegistry, Market, Obligation, Pool},
    utils::accrual::accrue_pool,
    utils::math::{div_u64_by_u68_to_q60, mul_q60_by_u68_to_u64, unpack_u68f60},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RepayArgs {
    pub amount: u64, // cap to debt
}

#[derive(Accounts)]
#[instruction(args: RepayArgs)]
pub struct Repay<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [SEED_MARKET, authority.key().as_ref()],
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
        constraint = owner_token_ata.owner == owner.key() @ ZodialError::Unauthorized,
        constraint = owner_token_ata.mint == pool.mint @ ZodialError::InvalidMint
    )]
    pub owner_token_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = pool_vault.key() == pool.vault @ ZodialError::Unauthorized,
        constraint = pool_vault.mint == pool.mint @ ZodialError::InvalidMint
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority
    #[account(
        seeds = [SEED_VAULT_AUTH, pool.key().as_ref()],
        bump = pool.vault_auth_bump
    )]
    pub vault_auth: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SEED_OBLIGATION, market.key().as_ref(), owner.key().as_ref()],
        bump = obligation.bump,
        constraint = obligation.owner == owner.key() @ ZodialError::Unauthorized,
        constraint = obligation.market == market.key() @ ZodialError::Unauthorized
    )]
    pub obligation: Account<'info, Obligation>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn repay(ctx: Context<Repay>, args: RepayArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    accrue_pool(&mut ctx.accounts.pool, now);

    let pool_mint = ctx.accounts.pool.mint;
    let ob = &mut ctx.accounts.obligation;
    let pos_idx = ob
        .positions
        .iter()
        .position(|p| p.mint == pool_mint)
        .ok_or(error!(ZodialError::PoolNotFound))?;
    let pos = &mut ob.positions[pos_idx];

    require!(pos.borrow_shares_q60 > 0, ZodialError::MathOverflow); // use a dedicated error if you prefer

    let borrow_idx = unpack_u68f60(ctx.accounts.pool.borrow_fac_q60);
    let debt_underlying = mul_q60_by_u68_to_u64(pos.borrow_shares_q60, borrow_idx)?; // u64

    if debt_underlying == 0 {
        return Ok(());
    }

    let repay_amount = args.amount.min(debt_underlying);
    if repay_amount == 0 {
        return Ok(());
    }

    let shares_to_burn_q60 = div_u64_by_u68_to_q60(repay_amount, borrow_idx)?;

    let burn_q60 = shares_to_burn_q60.min(pos.borrow_shares_q60);
    pos.borrow_shares_q60 = pos
        .borrow_shares_q60
        .checked_sub(burn_q60)
        .ok_or(error!(ZodialError::MathOverflow))?;

    {
        let p = &mut ctx.accounts.pool;
        p.total_borrow_shares_q60 = p
            .total_borrow_shares_q60
            .checked_sub(burn_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
    }

    // transfer owner -> vault
    {
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token_ata.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::transfer(cpi, repay_amount)?;
    }

    // drop empty positions
    if pos.borrow_shares_q60 == 0 && pos.deposit_shares_q60 == 0 {
        ob.positions.swap_remove(pos_idx);
    }

    emit!(RepayEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        mint: pool_mint,
        amount: repay_amount,
        burned_shares_q60: burn_q60,
    });

    Ok(())
}
