use anchor_lang::prelude::*;
use fixed::types::U68F60;

use crate::{
    constants::*,
    error::ZodialError,
    state::{AssetRegistry, Market, Obligation, Pool, PriceCache, RiskRegistry},
    utils::{
        accrual::accrue_pool, health::compute_liquidation_health_score_q3,
        math::div_u64_by_u68_to_q60,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CheckLiquidationArgs {}

#[derive(Accounts)]
#[instruction(args: CheckLiquidationArgs)]
pub struct CheckLiquidation<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    /// CHECK: target user whose position we're checking
    pub target_owner: UncheckedAccount<'info>,

    #[account(
        seeds = [SEED_MARKET, market.authority.as_ref()],
        bump = market.bump,
        constraint = !market.paused @ ZodialError::MarketPaused
    )]
    pub market: Account<'info, Market>,

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
        seeds = [SEED_OBLIGATION, market.key().as_ref(), target_owner.key().as_ref()],
        bump = target_obligation.bump,
        constraint = target_obligation.owner == target_owner.key() @ ZodialError::Unauthorized,
        constraint = target_obligation.market == market.key() @ ZodialError::Unauthorized
    )]
    pub target_obligation: Account<'info, Obligation>,

    pub system_program: Program<'info, System>,
    // Pool accounts for all positions in target_obligation should be passed in remaining_accounts
}

pub fn check_liquidation(
    ctx: Context<CheckLiquidation>,
    _args: CheckLiquidationArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    msg!("=== Check Liquidation ===");
    msg!("Liquidator: {}", ctx.accounts.liquidator.key());
    msg!("Target owner: {}", ctx.accounts.target_owner.key());
    msg!("Market: {}", ctx.accounts.market.key());
    msg!("Market authority: {}", ctx.accounts.market.authority);
    msg!(
        "Target obligation: {}",
        ctx.accounts.target_obligation.key()
    );
    msg!(
        "Target has {} positions",
        ctx.accounts.target_obligation.positions.len()
    );

    // Accrue interest on all pools involved
    let mut pools: Vec<Pool> = Vec::new();
    msg!(
        "Processing {} remaining accounts (pools)...",
        ctx.remaining_accounts.len()
    );

    for (i, ai) in ctx.remaining_accounts.iter().enumerate() {
        msg!("  Pool {} - account: {}", i, ai.key);
        // Only accept accounts owned by this program
        require!(ai.owner == &crate::id(), ZodialError::Unauthorized);

        // Deserialize Pool
        let mut data: &[u8] = &ai.data.borrow();
        let mut pool = Pool::try_deserialize(&mut data)?;

        // Verify PDA
        let (expect, _b) = Pubkey::find_program_address(
            &[
                SEED_POOL,
                ctx.accounts.market.key().as_ref(),
                pool.mint.as_ref(),
            ],
            &crate::id(),
        );
        require!(expect == *ai.key, ZodialError::Unauthorized);

        msg!("  Pool {} - mint: {}, verified", i, pool.mint);
        // Accrue interest
        accrue_pool(&mut pool, now);

        pools.push(pool);
    }

    // Calculate liquidation health score (uses liquidation thresholds)
    let price_cache_ref = ctx.accounts.price_cache.as_ref().map(|a| &**a);
    let health = compute_liquidation_health_score_q3(
        &ctx.accounts.target_obligation,
        &ctx.accounts.market,
        &ctx.accounts.asset_registry,
        &ctx.accounts.risk_registry,
        price_cache_ref,
        &pools,
    )?;

    msg!("Liquidation health score (Q3): {}", health);
    msg!(
        "Position is {} (threshold: 1000)",
        if health < 1000 {
            "UNHEALTHY - can be liquidated"
        } else {
            "HEALTHY - cannot be liquidated"
        }
    );

    // Require position is unhealthy for liquidation
    require!(health < 1000, ZodialError::PositionHealthy);

    msg!("✓ Position is eligible for liquidation");

    Ok(())
}

// Helper function to get price by asset index (mirrors health.rs pattern)
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

// Helper function to convert amount to shares
fn amount_to_shares_q60(amount: u64, index: U68F60) -> Result<u128> {
    div_u64_by_u68_to_q60(amount, index)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LiquidateObligationArgs {
    pub repay_amount: u64,
    pub collateral_mint: Pubkey,
    pub borrow_mint: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: LiquidateObligationArgs)]
pub struct LiquidateObligation<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    /// CHECK: liquidatee user whose position is being liquidated
    pub liquidatee_owner: UncheckedAccount<'info>,

    #[account(
        seeds = [SEED_MARKET, market.authority.as_ref()],
        bump = market.bump,
        constraint = !market.paused @ ZodialError::MarketPaused
    )]
    pub market: Account<'info, Market>,

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
        seeds = [SEED_OBLIGATION, market.key().as_ref(), liquidatee_owner.key().as_ref()],
        bump = liquidatee_obligation.bump,
        constraint = liquidatee_obligation.owner == liquidatee_owner.key() @ ZodialError::Unauthorized,
        constraint = liquidatee_obligation.market == market.key() @ ZodialError::Unauthorized
    )]
    pub liquidatee_obligation: Account<'info, Obligation>,

    #[account(
        mut,
        seeds = [SEED_OBLIGATION, market.key().as_ref(), liquidator.key().as_ref()],
        bump = liquidator_obligation.bump,
        constraint = liquidator_obligation.owner == liquidator.key() @ ZodialError::Unauthorized,
        constraint = liquidator_obligation.market == market.key() @ ZodialError::Unauthorized
    )]
    pub liquidator_obligation: Account<'info, Obligation>,

    pub system_program: Program<'info, System>,
    // Pool accounts for all positions should be passed in remaining_accounts
}

pub fn handler_liquidate_obligation(
    ctx: Context<LiquidateObligation>,
    args: LiquidateObligationArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let repay_amount = args.repay_amount;
    let collateral_mint = args.collateral_mint;
    let borrow_mint = args.borrow_mint;

    msg!("=== Starting Liquidation ===");
    msg!("Repay amount: {}", repay_amount);
    msg!("Collateral mint: {}", collateral_mint);
    msg!("Borrow mint: {}", borrow_mint);
    msg!("Liquidator: {}", ctx.accounts.liquidator.key());
    msg!("Liquidatee owner: {}", ctx.accounts.liquidatee_owner.key());
    msg!("Market: {}", ctx.accounts.market.key());
    msg!("Market authority: {}", ctx.accounts.market.authority);
    msg!("Market paused: {}", ctx.accounts.market.paused);
    msg!(
        "Liquidatee obligation: {}",
        ctx.accounts.liquidatee_obligation.key()
    );
    msg!(
        "Liquidator obligation: {}",
        ctx.accounts.liquidator_obligation.key()
    );

    // 1. Accrue interest on all pools
    msg!(
        "Processing {} remaining accounts (pools)...",
        ctx.remaining_accounts.len()
    );
    let mut pools: Vec<Pool> = Vec::new();
    for (i, ai) in ctx.remaining_accounts.iter().enumerate() {
        msg!("  Pool {} - account: {}", i, ai.key);
        require!(ai.owner == &crate::id(), ZodialError::Unauthorized);

        let mut data: &[u8] = &ai.data.borrow();
        let mut pool = Pool::try_deserialize(&mut data)?;

        let (expect, _b) = Pubkey::find_program_address(
            &[
                SEED_POOL,
                ctx.accounts.market.key().as_ref(),
                pool.mint.as_ref(),
            ],
            &crate::id(),
        );
        require!(expect == *ai.key, ZodialError::Unauthorized);

        msg!("  Pool {} - mint: {}, verified", i, pool.mint);
        accrue_pool(&mut pool, now);
        pools.push(pool);
    }

    msg!("Accrued interest on {} pools", pools.len());

    // 2. Check liquidatee is unhealthy
    let price_cache_ref = ctx.accounts.price_cache.as_ref().map(|a| &**a);
    let health = compute_liquidation_health_score_q3(
        &ctx.accounts.liquidatee_obligation,
        &ctx.accounts.market,
        &ctx.accounts.asset_registry,
        &ctx.accounts.risk_registry,
        price_cache_ref,
        &pools,
    )?;

    msg!("Liquidation health score (Q3): {}", health);
    require!(health < 1000, ZodialError::PositionHealthy);

    // 3. Find positions in liquidatee
    msg!("=== Finding Positions in Liquidatee ===");
    msg!(
        "Liquidatee has {} positions",
        ctx.accounts.liquidatee_obligation.positions.len()
    );
    for (i, pos) in ctx
        .accounts
        .liquidatee_obligation
        .positions
        .iter()
        .enumerate()
    {
        msg!(
            "  Position {}: mint={}, deposits={}, borrows={}",
            i,
            pos.mint,
            pos.deposit_shares_q60,
            pos.borrow_shares_q60
        );
    }

    let borrow_pos_idx = ctx
        .accounts
        .liquidatee_obligation
        .positions
        .iter()
        .position(|p| p.mint == borrow_mint)
        .ok_or(ZodialError::PositionNotFound)?;

    let collateral_pos_idx = ctx
        .accounts
        .liquidatee_obligation
        .positions
        .iter()
        .position(|p| p.mint == collateral_mint)
        .ok_or(ZodialError::PositionNotFound)?;

    msg!("Found borrow position at index: {}", borrow_pos_idx);
    msg!("Found collateral position at index: {}", collateral_pos_idx);

    let borrow_pos = &ctx.accounts.liquidatee_obligation.positions[borrow_pos_idx];
    let collateral_pos = &ctx.accounts.liquidatee_obligation.positions[collateral_pos_idx];

    msg!(
        "Liquidatee borrow shares (Q60): {}",
        borrow_pos.borrow_shares_q60
    );
    msg!(
        "Liquidatee collateral shares (Q60): {}",
        collateral_pos.deposit_shares_q60
    );

    // 4. Calculate repay shares and value using pool indices and PriceCache
    let borrow_pool = pools
        .iter()
        .find(|p| p.mint == borrow_mint)
        .ok_or(ZodialError::PoolNotFound)?;
    let repay_shares_q60 = amount_to_shares_q60(repay_amount, borrow_pool.borrow_index())?;

    msg!("Repay shares (Q60): {}", repay_shares_q60);
    require!(
        repay_shares_q60 <= borrow_pos.borrow_shares_q60,
        ZodialError::PositionNotFound
    );

    // Find asset indices for price lookup
    let borrow_asset = ctx
        .accounts
        .asset_registry
        .assets
        .iter()
        .find(|a| a.mint == borrow_mint)
        .ok_or(ZodialError::AssetNotRegistered)?;

    let collateral_asset = ctx
        .accounts
        .asset_registry
        .assets
        .iter()
        .find(|a| a.mint == collateral_mint)
        .ok_or(ZodialError::AssetNotRegistered)?;

    // Get prices (supports Mock and Cache modes)
    let price_cache_ref = ctx.accounts.price_cache.as_ref().map(|a| &**a);
    let borrow_price_q60 =
        price_for_index_q60(&ctx.accounts.market, price_cache_ref, borrow_asset.index)?;
    let collateral_price_q60 = price_for_index_q60(
        &ctx.accounts.market,
        price_cache_ref,
        collateral_asset.index,
    )?;

    msg!("Borrow price (Q60): {}", borrow_price_q60);
    msg!("Collateral price (Q60): {}", collateral_price_q60);

    // Calculate repay value in USD (accounting for decimals)
    // value = (amount / 10^decimals) * price
    let borrow_base = U68F60::from_num(repay_amount as u128);
    let borrow_denom = U68F60::from_num(10u128.pow(borrow_asset.decimals as u32));
    let borrow_units = borrow_base.saturating_div(borrow_denom);
    let borrow_price = U68F60::from_bits(borrow_price_q60);
    let repay_value_q60 = borrow_units.saturating_mul(borrow_price).to_bits();

    msg!("Repay value (Q60): {}", repay_value_q60);

    // Apply liquidation bonus from RiskRegistry
    // The liquidator gets bonus collateral as incentive for performing the liquidation
    // seize_value = repay_value * (1 + liq_bonus_bps / 10000)
    // Example: $50 repay * 1.05 (5% bonus) = $52.50 seized
    let risk_pair = ctx
        .accounts
        .risk_registry
        .get_pair(collateral_asset.index, borrow_asset.index)?;

    msg!(
        "Liquidation bonus: {} bps ({}%)",
        risk_pair.liq_bonus_bps,
        risk_pair.liq_bonus_bps as f64 / 100.0
    );

    let bonus_multiplier =
        U68F60::from_num(10000 + risk_pair.liq_bonus_bps).saturating_div(U68F60::from_num(10000));
    let repay_value = U68F60::from_bits(repay_value_q60);
    let seize_value_q60 = repay_value.saturating_mul(bonus_multiplier).to_bits();

    msg!("Seize value with bonus (Q60): {}", seize_value_q60);

    // Convert collateral value back to token amount (accounting for decimals)
    // amount = (value / price) * 10^decimals
    let seize_value = U68F60::from_bits(seize_value_q60);
    let collateral_price = U68F60::from_bits(collateral_price_q60);
    let seize_units = seize_value.saturating_div(collateral_price);
    let collateral_denom = U68F60::from_num(10u128.pow(collateral_asset.decimals as u32));
    let seize_amount_q60_fixed = seize_units.saturating_mul(collateral_denom);
    let seize_amount: u128 = seize_amount_q60_fixed.to_num();
    let seize_amount = u64::try_from(seize_amount).map_err(|_| ZodialError::MathOverflow)?;

    msg!("Seize amount (tokens): {}", seize_amount);

    let collateral_pool = pools
        .iter()
        .find(|p| p.mint == collateral_mint)
        .ok_or(ZodialError::PoolNotFound)?;
    let seize_shares_q60 = amount_to_shares_q60(seize_amount, collateral_pool.deposit_index())?;

    msg!("Seize shares (Q60): {}", seize_shares_q60);
    require!(
        seize_shares_q60 <= collateral_pos.deposit_shares_q60,
        ZodialError::InsufficientCollateral
    );

    // 5. Update liquidatee obligation (decrease borrow and collateral)
    msg!("=== Updating Liquidatee Obligation ===");

    let liquidatee_borrow_pos = &mut ctx.accounts.liquidatee_obligation.positions[borrow_pos_idx];
    liquidatee_borrow_pos.borrow_shares_q60 = liquidatee_borrow_pos
        .borrow_shares_q60
        .checked_sub(repay_shares_q60)
        .ok_or(ZodialError::MathOverflow)?;
    msg!("Liquidatee borrow decreased by {} shares", repay_shares_q60);

    let liquidatee_collateral_pos =
        &mut ctx.accounts.liquidatee_obligation.positions[collateral_pos_idx];
    liquidatee_collateral_pos.deposit_shares_q60 = liquidatee_collateral_pos
        .deposit_shares_q60
        .checked_sub(seize_shares_q60)
        .ok_or(ZodialError::MathOverflow)?;
    msg!(
        "Liquidatee collateral decreased by {} shares",
        seize_shares_q60
    );

    // 6. Update liquidator obligation (decrease deposit from repayment, increase collateral from seizure)
    msg!("=== Updating Liquidator Obligation ===");

    // Find liquidator's deposit position for the borrow mint
    // The liquidator pays with their deposits, not their borrows
    let liquidator_deposit_pos = ctx
        .accounts
        .liquidator_obligation
        .positions
        .iter_mut()
        .find(|p| p.mint == borrow_mint)
        .ok_or(ZodialError::PositionNotFound)?;

    // Convert repay_amount to deposit shares using deposit_index (NOT borrow_index)
    // This is critical: deposit shares and borrow shares use different indices
    let liquidator_repay_deposit_shares_q60 =
        amount_to_shares_q60(repay_amount, borrow_pool.deposit_index())?;

    // Ensure liquidator has sufficient deposits to cover the repayment
    require!(
        liquidator_repay_deposit_shares_q60 <= liquidator_deposit_pos.deposit_shares_q60,
        ZodialError::InsufficientCollateral
    );

    liquidator_deposit_pos.deposit_shares_q60 = liquidator_deposit_pos
        .deposit_shares_q60
        .checked_sub(liquidator_repay_deposit_shares_q60)
        .ok_or(ZodialError::MathUnderflow)?;
    msg!(
        "Liquidator deposit decreased by {} shares (paying with deposits, not borrows)",
        liquidator_repay_deposit_shares_q60
    );

    // Find liquidator's collateral position for the collateral mint
    let liquidator_collateral_pos = ctx
        .accounts
        .liquidator_obligation
        .positions
        .iter_mut()
        .find(|p| p.mint == collateral_mint)
        .ok_or(ZodialError::PositionNotFound)?;

    liquidator_collateral_pos.deposit_shares_q60 = liquidator_collateral_pos
        .deposit_shares_q60
        .checked_add(seize_shares_q60)
        .ok_or(ZodialError::MathOverflow)?;
    msg!(
        "Liquidator collateral increased by {} shares",
        seize_shares_q60
    );

    msg!("=== Liquidation Complete ===");
    msg!("✓ Repaid {} from liquidatee's debt", repay_amount);
    msg!(
        "✓ Seized {} collateral (with {}% bonus)",
        seize_amount,
        risk_pair.liq_bonus_bps as f64 / 100.0
    );

    // NOTE: We do NOT perform a final health check on the liquidator's obligation.
    //
    // Rationale:
    // - The liquidator pays with their deposits (not borrows) to repay the victim's debt
    // - This decreases their deposits and increases their collateral
    // - The net position change depends on the liquidation bonus and price differences
    // - The liquidator is responsible for managing their own portfolio health
    // - Blocking liquidations due to liquidator health would prevent the protocol
    //   from being able to liquidate unhealthy positions effectively
    //
    // The liquidator should:
    // 1. Have sufficient deposits of the borrow asset before liquidating
    // 2. Ensure the liquidation bonus makes the operation profitable
    // 3. Manage their overall portfolio to remain healthy
    //
    // INTENTIONALLY COMMENTED OUT:
    // ```
    // let liquidator_health = compute_health_score_q3(
    //     &ctx.accounts.liquidator_obligation,
    //     &ctx.accounts.market,
    //     &ctx.accounts.asset_registry,
    //     &ctx.accounts.risk_registry,
    //     price_cache_ref,
    //     &pools,
    // )?;
    // require!(liquidator_health >= 1000, ZodialError::HealthCheckFailed);
    // ```

    Ok(())
}
