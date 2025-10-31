use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount},
};

use crate::{
    constants::*,
    error::ZodialError,
    events::FaucetSwapped,
    state::{AssetRegistry, FaucetMint, PriceCache},
    utils::math::unpack_u68f60,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FaucetSwapArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: FaucetSwapArgs)]
pub struct FaucetSwap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// The faucet mint config for the token being burned
    #[account(
        seeds = [SEED_FAUCET_MINT, faucet_mint_from.market.as_ref(), mint_from.key().as_ref()],
        bump = faucet_mint_from.bump
    )]
    pub faucet_mint_from: Account<'info, FaucetMint>,

    /// The faucet mint config for the token being minted
    #[account(
        seeds = [SEED_FAUCET_MINT, faucet_mint_to.market.as_ref(), mint_to.key().as_ref()],
        bump = faucet_mint_to.bump,
        constraint = faucet_mint_from.market == faucet_mint_to.market @ ErrorCode::MarketMismatch
    )]
    pub faucet_mint_to: Account<'info, FaucetMint>,

    /// CHECK: PDA signer for minting
    #[account(
        seeds = [SEED_FAUCET_MINT_AUTH, faucet_mint_to.key().as_ref()],
        bump = faucet_mint_to.mint_authority_bump
    )]
    pub mint_to_authority: UncheckedAccount<'info>,

    /// Mint account to burn from
    #[account(
        mut,
        constraint = mint_from.key() == faucet_mint_from.mint
    )]
    pub mint_from: Account<'info, Mint>,

    /// Mint account to mint to
    #[account(
        mut,
        constraint = mint_to.key() == faucet_mint_to.mint
    )]
    pub mint_to: Account<'info, Mint>,

    /// User's token account for the "from" token (will be burned from)
    #[account(
        mut,
        constraint = user_token_from.owner == user.key(),
        constraint = user_token_from.mint == mint_from.key()
    )]
    pub user_token_from: Account<'info, TokenAccount>,

    /// User's token account for the "to" token (will be minted to)
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_to,
        associated_token::authority = user
    )]
    pub user_token_to: Account<'info, TokenAccount>,

    /// Asset registry to look up asset indices
    #[account(
        seeds = [SEED_ASSET_REG, faucet_mint_from.market.as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    /// Price cache to get current prices
    #[account(
        seeds = [SEED_PRICE_CACHE, faucet_mint_from.market.as_ref()],
        bump = price_cache.bump
    )]
    pub price_cache: Account<'info, PriceCache>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Faucet mints must be from the same market")]
    MarketMismatch,
}

pub fn faucet_swap(ctx: Context<FaucetSwap>, args: FaucetSwapArgs) -> Result<()> {
    let faucet_mint_to = &ctx.accounts.faucet_mint_to;
    let faucet_mint_from = &ctx.accounts.faucet_mint_from;
    let faucet_mint_to_key = faucet_mint_to.key();

    // Step 1: Find asset indices for both mints
    let asset_from = ctx
        .accounts
        .asset_registry
        .assets
        .iter()
        .find(|a| a.mint == ctx.accounts.mint_from.key())
        .ok_or(ZodialError::AssetNotRegistered)?;

    let asset_to = ctx
        .accounts
        .asset_registry
        .assets
        .iter()
        .find(|a| a.mint == ctx.accounts.mint_to.key())
        .ok_or(ZodialError::AssetNotRegistered)?;

    // Step 2: Get prices from cache
    let price_from_entry = ctx
        .accounts
        .price_cache
        .prices
        .iter()
        .find(|p| p.asset_index == asset_from.index)
        .ok_or(ZodialError::PriceNotFound)?;

    let price_to_entry = ctx
        .accounts
        .price_cache
        .prices
        .iter()
        .find(|p| p.asset_index == asset_to.index)
        .ok_or(ZodialError::PriceNotFound)?;

    let price_from = unpack_u68f60(price_from_entry.price_q60);
    let price_to = unpack_u68f60(price_to_entry.price_q60);

    // Step 3: Calculate swap amount based on prices
    // Formula: amount_to = (amount_from * price_from / price_to) * (10^decimals_to / 10^decimals_from)
    //
    // Convert amount_from to USD value: amount_from * price_from / 10^decimals_from
    // Convert USD value to amount_to: (usd_value * 10^decimals_to) / price_to

    // Convert input amount to Q60 fixed-point
    let amount_from_fixed = unpack_u68f60((args.amount as u128) << 60);

    // Calculate USD value: amount_from * price_from
    let usd_value = amount_from_fixed
        .checked_mul(price_from)
        .ok_or(ZodialError::MathOverflow)?;

    // Adjust for decimals difference
    let decimals_from = faucet_mint_from.decimals;
    let decimals_to = faucet_mint_to.decimals;

    let adjusted_value = if decimals_from > decimals_to {
        // Need to divide
        let diff = decimals_from - decimals_to;
        let divisor = 10u64.pow(diff as u32);
        usd_value
            .checked_div(unpack_u68f60((divisor as u128) << 60))
            .ok_or(ZodialError::MathOverflow)?
    } else if decimals_to > decimals_from {
        // Need to multiply
        let diff = decimals_to - decimals_from;
        let multiplier = 10u64.pow(diff as u32);
        usd_value
            .checked_mul(unpack_u68f60((multiplier as u128) << 60))
            .ok_or(ZodialError::MathOverflow)?
    } else {
        usd_value
    };

    // Divide by price_to to get amount in target token
    let amount_to_fixed = adjusted_value
        .checked_div(price_to)
        .ok_or(ZodialError::MathOverflow)?;

    // Convert back to u64 - shift right 60 bits to get integer part
    let amount_to_u128 = (amount_to_fixed.to_bits() >> 60) as u64;
    let amount_to = amount_to_u128;

    msg!(
        "Swap calculation: {} atoms @ ${} -> {} atoms @ ${}",
        args.amount,
        price_from,
        amount_to,
        price_to
    );

    // Step 4: Burn the "from" tokens
    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.mint_from.to_account_info(),
            from: ctx.accounts.user_token_from.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::burn(burn_ctx, args.amount)?;

    // Step 5: Mint the "to" tokens
    let seeds = &[
        SEED_FAUCET_MINT_AUTH,
        faucet_mint_to_key.as_ref(),
        &[faucet_mint_to.mint_authority_bump],
    ];
    let signer = &[&seeds[..]];

    let mint_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint_to.to_account_info(),
            to: ctx.accounts.user_token_to.to_account_info(),
            authority: ctx.accounts.mint_to_authority.to_account_info(),
        },
        signer,
    );
    token::mint_to(mint_ctx, amount_to)?;

    emit!(FaucetSwapped {
        user: ctx.accounts.user.key(),
        mint_from: ctx.accounts.mint_from.key(),
        mint_to: ctx.accounts.mint_to.key(),
        amount: amount_to,
    });

    Ok(())
}
