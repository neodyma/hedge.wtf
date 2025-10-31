use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use fixed::types::U68F60;

use crate::{
    constants::*,
    error::ZodialError,
    events::PoolInitialized,
    state::{AssetRegistry, Market, Pool, RateModel},
    utils::math::pack_u68f60,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitPoolArgs {
    pub rate: RateModel,
    pub mint: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitPoolArgs)]
pub struct InitPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Admin = market.authority
    pub authority: Signer<'info>,

    #[account(
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [SEED_ASSET_REG, market.key().as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        init,
        payer = payer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [SEED_POOL, market.key().as_ref(), args.mint.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub mint: Account<'info, Mint>,

    /// CHECK: PDA authority
    #[account(
        seeds = [SEED_VAULT_AUTH, pool.key().as_ref()],
        bump
    )]
    pub vault_auth: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = vault_auth,
        seeds = [SEED_VAULT, pool.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn init_pool(ctx: Context<InitPool>, args: InitPoolArgs) -> Result<()> {
    let exists = ctx
        .accounts
        .asset_registry
        .assets
        .iter()
        .any(|a| a.mint == args.mint);
    require!(exists, ZodialError::AssetNotRegistered);

    let pool_bump = ctx.bumps.pool;
    let vault_auth_bump = ctx.bumps.vault_auth;

    let p = &mut ctx.accounts.pool;
    p.market = ctx.accounts.market.key();
    p.mint = args.mint;
    p.vault = ctx.accounts.vault.key();
    p.borrow_fac_q60 = pack_u68f60(U68F60::from_num(1u64));
    p.deposit_fac_q60 = pack_u68f60(U68F60::from_num(1u64));
    p.total_borrow_shares_q60 = 0;
    p.total_deposit_shares_q60 = 0;
    p.last_timestamp = Clock::get()?.unix_timestamp;
    p.rate = args.rate;
    p.bump = pool_bump;
    p.vault_auth_bump = vault_auth_bump;

    require!(
        ctx.accounts.vault.mint == args.mint,
        ZodialError::InvalidMint
    );
    require!(
        ctx.accounts.vault.owner == ctx.accounts.vault_auth.key(),
        ZodialError::Unauthorized
    );

    emit!(PoolInitialized {
        market: ctx.accounts.market.key(),
        mint: args.mint,
        pool: ctx.accounts.pool.key(),
    });

    Ok(())
}
