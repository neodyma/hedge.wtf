use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    constants::*,
    error::ZodialError,
    events::Borrow as BorrowEvent,
    signer_seeds_vault_auth,
    state::{AssetRegistry, Market, Obligation, Pool, Position, PriceCache, RiskRegistry},
    utils::{
        accrual::accrue_pool,
        health::assert_healthy_at_least_1,
        math::{div_u64_by_u68_to_q60, unpack_u68f60},
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BorrowArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: BorrowArgs)]
pub struct Borrow<'info> {
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

    /// The mint for this pool
    #[account(
        mut,
        constraint = mint.key() == pool.mint @ ZodialError::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [SEED_POOL, market.key().as_ref(), mint.key().as_ref()],
        bump = pool.bump,
        constraint = pool.mint == mint.key() @ ZodialError::InvalidMint
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool_vault.key() == pool.vault @ ZodialError::Unauthorized,
        constraint = pool_vault.mint == mint.key() @ ZodialError::InvalidMint
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for vault
    #[account(
        seeds = [SEED_VAULT_AUTH, pool.key().as_ref()],
        bump = pool.vault_auth_bump
    )]
    pub vault_auth: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = owner
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
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // other Pool accounts for assets in `obligation.positions`
    // should be passed in remaining_accounts
}

pub fn borrow(ctx: Context<Borrow>, args: BorrowArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    accrue_pool(&mut ctx.accounts.pool, now);

    let b_idx = unpack_u68f60(ctx.accounts.pool.borrow_fac_q60);
    let add_borrow_shares_q60 = div_u64_by_u68_to_q60(args.amount, b_idx)?;

    let mut ob_sim = ctx.accounts.obligation.clone();
    if let Some(pos) = ob_sim
        .positions
        .iter_mut()
        .find(|p| p.mint == ctx.accounts.pool.mint)
    {
        pos.borrow_shares_q60 = pos
            .borrow_shares_q60
            .checked_add(add_borrow_shares_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
    } else {
        ob_sim.positions.push(Position {
            mint: ctx.accounts.pool.mint,
            deposit_shares_q60: 0,
            borrow_shares_q60: add_borrow_shares_q60,
        });
    }

    let mut pools: Vec<Pool> = Vec::new();
    {
        let mut touched = (*ctx.accounts.pool).clone();
        touched.total_borrow_shares_q60 = touched
            .total_borrow_shares_q60
            .checked_add(add_borrow_shares_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
        pools.push(touched);

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
            pools.push(pool);
        }
    }

    // Health check
    let price_cache_ref = ctx.accounts.price_cache.as_ref().map(|a| &**a);
    let _health = assert_healthy_at_least_1(
        &ob_sim,
        &ctx.accounts.market,
        &ctx.accounts.asset_registry,
        &ctx.accounts.risk_registry,
        price_cache_ref,
        &pools,
    )?;

    {
        let ob = &mut ctx.accounts.obligation;
        if let Some(pos) = ob
            .positions
            .iter_mut()
            .find(|p| p.mint == ctx.accounts.pool.mint)
        {
            pos.borrow_shares_q60 = pos
                .borrow_shares_q60
                .checked_add(add_borrow_shares_q60)
                .ok_or(error!(ZodialError::MathOverflow))?;
        } else {
            ob.positions.push(Position {
                mint: ctx.accounts.pool.mint,
                deposit_shares_q60: 0,
                borrow_shares_q60: add_borrow_shares_q60,
            });
        }

        let p = &mut ctx.accounts.pool;
        p.total_borrow_shares_q60 = p
            .total_borrow_shares_q60
            .checked_add(add_borrow_shares_q60)
            .ok_or(error!(ZodialError::MathOverflow))?;
    }

    // Liquidity check + transfer
    require!(
        ctx.accounts.pool_vault.amount >= args.amount,
        ZodialError::InsufficientLiquidity
    );

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
    token::transfer(cpi, args.amount)?;

    emit!(BorrowEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        mint: ctx.accounts.pool.mint,
        amount: args.amount,
        minted_shares_q60: add_borrow_shares_q60,
    });

    Ok(())
}
