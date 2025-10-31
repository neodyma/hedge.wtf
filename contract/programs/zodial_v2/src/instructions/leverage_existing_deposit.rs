use anchor_lang::prelude::*;
use fixed::types::U68F60;

use crate::{
    constants::*,
    error::ZodialError,
    events::Deposit as DepositEvent,
    state::{AssetRegistry, Market, Obligation, Pool, Position, PriceCache, RiskRegistry},
    utils::{
        accrual::accrue_pool,
        health::compute_health_score_q3,
        math::{div_u64_by_u68_to_q60, unpack_u68f60},
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LeverageExistingDepositArgs {
    pub borrow_amount: u64,
}

#[derive(Accounts)]
#[instruction(args: LeverageExistingDepositArgs)]
pub struct LeverageExistingDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [SEED_MARKET, market.authority.as_ref()],
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
        seeds = [SEED_POOL, market.key().as_ref(), borrow_pool.mint.as_ref()],
        bump = borrow_pool.bump
    )]
    pub borrow_pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [SEED_POOL, market.key().as_ref(), deposit_pool.mint.as_ref()],
        bump = deposit_pool.bump
    )]
    pub deposit_pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [SEED_OBLIGATION, market.key().as_ref(), owner.key().as_ref()],
        bump = obligation.bump,
        constraint = obligation.owner == owner.key() @ ZodialError::Unauthorized,
        constraint = obligation.market == market.key() @ ZodialError::Unauthorized
    )]
    pub obligation: Account<'info, Obligation>,

    pub system_program: Program<'info, System>,
    // remaining_accounts: All pools for existing positions in obligation
}

#[inline]
fn price_for_index_q60(
    market: &Market,
    price_cache: Option<&PriceCache>,
    idx: u16,
) -> Result<u128> {
    match market.price_mode {
        crate::state::PriceMode::Mock => Ok(U68F60::from_num(1u64).to_bits()),
        crate::state::PriceMode::Cache => {
            let pc = price_cache.ok_or(error!(ZodialError::PriceStale))?;
            let found = pc
                .prices
                .iter()
                .find(|p| p.asset_index == idx)
                .ok_or(error!(ZodialError::PriceStale))?;
            Ok(found.price_q60)
        }
    }
}

fn calculate_swap_output(
    market: &Market,
    price_cache: Option<&PriceCache>,
    asset_registry: &AssetRegistry,
    from_mint: &Pubkey,
    to_mint: &Pubkey,
    amount: u64,
) -> Result<u64> {
    let from_asset = asset_registry
        .assets
        .iter()
        .find(|a| a.mint == *from_mint)
        .ok_or(error!(ZodialError::AssetNotRegistered))?;

    let to_asset = asset_registry
        .assets
        .iter()
        .find(|a| a.mint == *to_mint)
        .ok_or(error!(ZodialError::AssetNotRegistered))?;

    let from_price_q60 = price_for_index_q60(market, price_cache, from_asset.index)?;
    let to_price_q60 = price_for_index_q60(market, price_cache, to_asset.index)?;

    // Convert amount to base units, apply price conversion
    let from_base = U68F60::from_num(amount as u128)
        .saturating_div(U68F60::from_num(10u128.pow(from_asset.decimals as u32)));

    let from_price = U68F60::from_bits(from_price_q60);
    let to_price = U68F60::from_bits(to_price_q60);

    let value_usd = from_base.saturating_mul(from_price);
    let to_base = value_usd.saturating_div(to_price);
    let to_amount = to_base.saturating_mul(U68F60::from_num(10u128.pow(to_asset.decimals as u32)));

    Ok(to_amount.to_num::<u64>())
}

pub fn leverage_existing_deposit(
    ctx: Context<LeverageExistingDeposit>,
    args: LeverageExistingDepositArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    accrue_pool(&mut ctx.accounts.borrow_pool, now);
    accrue_pool(&mut ctx.accounts.deposit_pool, now);

    // Build pools list similar to borrow.rs
    let mut pools: Vec<Pool> = Vec::new();

    // Calculate borrow shares
    let borrow_index = unpack_u68f60(ctx.accounts.borrow_pool.borrow_fac_q60);
    let new_borrow_shares = div_u64_by_u68_to_q60(args.borrow_amount, borrow_index)?;

    // Calculate swap output
    let swap_output = calculate_swap_output(
        &ctx.accounts.market,
        ctx.accounts.price_cache.as_ref().map(|a| &**a),
        &ctx.accounts.asset_registry,
        &ctx.accounts.borrow_pool.mint,
        &ctx.accounts.deposit_pool.mint,
        args.borrow_amount,
    )?;

    // Calculate deposit shares from swap
    let deposit_index = unpack_u68f60(ctx.accounts.deposit_pool.deposit_fac_q60);
    let new_deposit_shares = div_u64_by_u68_to_q60(swap_output, deposit_index)?;

    // Build pools list with updated totals (same pattern as borrow.rs)
    {
        let mut touched_borrow = (*ctx.accounts.borrow_pool).clone();
        touched_borrow.total_borrow_shares_q60 = touched_borrow
            .total_borrow_shares_q60
            .checked_add(new_borrow_shares)
            .ok_or(error!(ZodialError::MathOverflow))?;
        pools.push(touched_borrow);

        if ctx.accounts.borrow_pool.mint != ctx.accounts.deposit_pool.mint {
            let mut touched_deposit = (*ctx.accounts.deposit_pool).clone();
            touched_deposit.total_deposit_shares_q60 = touched_deposit
                .total_deposit_shares_q60
                .checked_add(new_deposit_shares)
                .ok_or(error!(ZodialError::MathOverflow))?;
            pools.push(touched_deposit);
        }

        for ai in ctx.remaining_accounts.iter() {
            // Only accept accounts owned by this program
            require!(ai.owner == &crate::id(), ZodialError::Unauthorized);
            // Deserialize Pool
            let mut data: &[u8] = &ai.data.borrow();
            let pool = Pool::try_deserialize(&mut data)?;
            // Seed re-derivation for safety
            let (expect, _b) = Pubkey::find_program_address(
                &[
                    SEED_POOL,
                    ctx.accounts.market.key().as_ref(),
                    pool.mint.as_ref(),
                ],
                &crate::id(),
            );
            require!(expect == *ai.key, ZodialError::Unauthorized);

            // Skip if it's one of our touched pools
            if pool.mint != ctx.accounts.borrow_pool.mint
                && pool.mint != ctx.accounts.deposit_pool.mint
            {
                pools.push(pool);
            }
        }
    }

    // Simulate changes for health check
    let mut obligation_sim = ctx.accounts.obligation.clone();

    // Add borrow to simulation
    if let Some(pos) = obligation_sim
        .positions
        .iter_mut()
        .find(|p| p.mint == ctx.accounts.borrow_pool.mint)
    {
        pos.borrow_shares_q60 = pos
            .borrow_shares_q60
            .checked_add(new_borrow_shares)
            .ok_or(error!(ZodialError::MathOverflow))?;
    } else {
        obligation_sim.positions.push(Position {
            mint: ctx.accounts.borrow_pool.mint,
            deposit_shares_q60: 0,
            borrow_shares_q60: new_borrow_shares,
        });
    }

    // Add deposit to simulation
    if let Some(pos) = obligation_sim
        .positions
        .iter_mut()
        .find(|p| p.mint == ctx.accounts.deposit_pool.mint)
    {
        pos.deposit_shares_q60 = pos
            .deposit_shares_q60
            .checked_add(new_deposit_shares)
            .ok_or(error!(ZodialError::MathOverflow))?;
    } else {
        obligation_sim.positions.push(Position {
            mint: ctx.accounts.deposit_pool.mint,
            deposit_shares_q60: new_deposit_shares,
            borrow_shares_q60: 0,
        });
    }

    // Health check BEFORE applying changes (using pools like borrow.rs)
    let health = compute_health_score_q3(
        &obligation_sim,
        &ctx.accounts.market,
        &ctx.accounts.asset_registry,
        &ctx.accounts.risk_registry,
        ctx.accounts.price_cache.as_ref().map(|a| &**a),
        &pools,
    )?;

    require!(health >= 1000, ZodialError::HealthCheckFailed);

    // Apply actual changes
    let ob = &mut ctx.accounts.obligation;

    // Add borrow position
    if let Some(pos) = ob
        .positions
        .iter_mut()
        .find(|p| p.mint == ctx.accounts.borrow_pool.mint)
    {
        pos.borrow_shares_q60 = pos
            .borrow_shares_q60
            .checked_add(new_borrow_shares)
            .ok_or(error!(ZodialError::MathOverflow))?;
    } else {
        ob.positions.push(Position {
            mint: ctx.accounts.borrow_pool.mint,
            deposit_shares_q60: 0,
            borrow_shares_q60: new_borrow_shares,
        });
    }

    // Add deposit position
    if let Some(pos) = ob
        .positions
        .iter_mut()
        .find(|p| p.mint == ctx.accounts.deposit_pool.mint)
    {
        pos.deposit_shares_q60 = pos
            .deposit_shares_q60
            .checked_add(new_deposit_shares)
            .ok_or(error!(ZodialError::MathOverflow))?;
    } else {
        ob.positions.push(Position {
            mint: ctx.accounts.deposit_pool.mint,
            deposit_shares_q60: new_deposit_shares,
            borrow_shares_q60: 0,
        });
    }

    // Update pool totals
    ctx.accounts.borrow_pool.total_borrow_shares_q60 = ctx
        .accounts
        .borrow_pool
        .total_borrow_shares_q60
        .checked_add(new_borrow_shares)
        .ok_or(error!(ZodialError::MathOverflow))?;

    ctx.accounts.deposit_pool.total_deposit_shares_q60 = ctx
        .accounts
        .deposit_pool
        .total_deposit_shares_q60
        .checked_add(new_deposit_shares)
        .ok_or(error!(ZodialError::MathOverflow))?;

    emit!(DepositEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        mint: ctx.accounts.deposit_pool.mint,
        amount: swap_output,
        shares_q60: new_deposit_shares,
    });

    Ok(())
}
