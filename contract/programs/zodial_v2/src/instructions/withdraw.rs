use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ZodialError,
    events::Withdraw as WithdrawEvent,
    signer_seeds_vault_auth,
    state::{AssetRegistry, Market, Obligation, Pool, PriceCache, RiskRegistry},
    utils::{
        accrual::accrue_pool,
        health::assert_healthy_at_least_1,
        math::{div_u64_by_u68_to_q60, mul_q60_by_u68_to_u64, unpack_u68f60},
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump = market.bump,
        has_one = authority,
        constraint = !market.paused @ ZodialError::MarketPaused
    )]
    pub market: Account<'info, Market>,

    /// CHECK: read only
    pub authority: UncheckedAccount<'info>,

    #[account(
        seeds = [SEED_ASSET_REG, market.key().as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        seeds = [SEED_RISK_REG, market.key().as_ref()],
        bump = risk_registry.bump
    )]
    pub risk_registry: Account<'info, RiskRegistry>,

    #[account(
        seeds = [SEED_PRICE_CACHE, market.key().as_ref()],
        bump = market.price_cache_bump
    )]
    pub price_cache: Option<Account<'info, PriceCache>>,

    #[account(
        mut,
        seeds = [SEED_POOL, market.key().as_ref(), pool.mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool_vault.key() == pool.vault @ ZodialError::Unauthorized,
        constraint = pool_vault.mint == pool.mint @ ZodialError::InvalidMint
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for vault
    #[account(
        seeds = [SEED_VAULT_AUTH, pool.key().as_ref()],
        bump = pool.vault_auth_bump
    )]
    pub vault_auth: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = owner_token_ata.owner == owner.key() @ ZodialError::Unauthorized,
        constraint = owner_token_ata.mint == pool.mint @ ZodialError::InvalidMint
    )]
    pub owner_token_ata: Account<'info, TokenAccount>,

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
    // remaining_accounts: all other pools for health check
}

pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    accrue_pool(&mut ctx.accounts.pool, now);

    let ob = &mut ctx.accounts.obligation;
    let pos_idx = ob
        .positions
        .iter()
        .position(|p| p.mint == ctx.accounts.pool.mint)
        .ok_or(error!(ZodialError::PositionNotFound))?;
    let mut ob_sim = (*ob).clone();
    let pos = &mut ob.positions[pos_idx];

    let d_idx = unpack_u68f60(ctx.accounts.pool.deposit_fac_q60);
    let available_underlying = mul_q60_by_u68_to_u64(pos.deposit_shares_q60, d_idx)?;
    if available_underlying == 0 {
        return Ok(());
    }
    let max_by_vault = ctx.accounts.pool_vault.amount;
    let to_withdraw = args.amount.min(available_underlying).min(max_by_vault);
    if to_withdraw == 0 {
        return Ok(());
    }

    let shares_to_burn_q60 = div_u64_by_u68_to_q60(to_withdraw, d_idx)?;
    let burn_q60 = shares_to_burn_q60.min(pos.deposit_shares_q60);

    let transfer_amount = mul_q60_by_u68_to_u64(burn_q60, d_idx)?;

    if let Some(sim_pos) = ob_sim
        .positions
        .iter_mut()
        .find(|p| p.mint == ctx.accounts.pool.mint)
    {
        sim_pos.deposit_shares_q60 = sim_pos
            .deposit_shares_q60
            .checked_sub(burn_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
    }

    let mut pools: Vec<Pool> = Vec::new();
    {
        let mut touched = (*ctx.accounts.pool).clone();
        touched.total_deposit_shares_q60 = touched
            .total_deposit_shares_q60
            .checked_sub(burn_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
        pools.push(touched);

        for ai in ctx.remaining_accounts.iter() {
            require!(ai.owner == &crate::id(), ZodialError::Unauthorized);
            let mut data: &[u8] = &ai.data.borrow();
            let pool = Pool::try_deserialize(&mut data)?;
            let (expect, _b) = Pubkey::find_program_address(
                &[
                    SEED_POOL,
                    ctx.accounts.market.key().as_ref(),
                    pool.mint.as_ref(),
                ],
                &crate::id(),
            );
            require!(expect == *ai.key, ZodialError::Unauthorized);
            pools.push(pool);
        }
    }

    let price_cache_ref = ctx.accounts.price_cache.as_ref().map(|a| &**a);
    let _health = assert_healthy_at_least_1(
        &ob_sim,
        &ctx.accounts.market,
        &ctx.accounts.asset_registry,
        &ctx.accounts.risk_registry,
        price_cache_ref,
        &pools,
    )?;

    pos.deposit_shares_q60 = pos
        .deposit_shares_q60
        .checked_sub(burn_q60)
        .ok_or(error!(ZodialError::MathOverflow))?;

    {
        let p = &mut ctx.accounts.pool;
        p.total_deposit_shares_q60 = p
            .total_deposit_shares_q60
            .checked_sub(burn_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
    }

    // drop empty position
    if pos.deposit_shares_q60 == 0 && pos.borrow_shares_q60 == 0 {
        ob.positions.swap_remove(pos_idx);
    }

    // transfer vault -> owner
    let key = ctx.accounts.pool.key();
    let seeds = signer_seeds_vault_auth!(key, ctx.accounts.pool.vault_auth_bump);
    let signer_seeds: &[&[&[u8]]] = &[&seeds[..]];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_vault.to_account_info(),
            to: ctx.accounts.owner_token_ata.to_account_info(),
            authority: ctx.accounts.vault_auth.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi, transfer_amount)?;

    emit!(WithdrawEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        mint: ctx.accounts.pool.mint,
        amount: transfer_amount,
        burned_shares_q60: burn_q60,
    });

    Ok(())
}
