use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

use crate::{constants::*, events::FaucetMinted, state::FaucetMint};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FaucetArgs {
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: FaucetArgs)]
pub struct Faucet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [SEED_FAUCET_MINT, faucet_mint.market.as_ref(), mint.key().as_ref()],
        bump = faucet_mint.bump
    )]
    pub faucet_mint: Account<'info, FaucetMint>,

    /// CHECK: PDA signer
    #[account(
        seeds = [SEED_FAUCET_MINT_AUTH, faucet_mint.key().as_ref()],
        bump = faucet_mint.mint_authority_bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = mint.key() == faucet_mint.mint
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn faucet(ctx: Context<Faucet>, args: FaucetArgs) -> Result<()> {
    let faucet_mint = &ctx.accounts.faucet_mint;
    let faucet_mint_key = faucet_mint.key();

    let seeds = &[
        SEED_FAUCET_MINT_AUTH,
        faucet_mint_key.as_ref(),
        &[faucet_mint.mint_authority_bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        },
        signer,
    );

    token::mint_to(cpi_ctx, args.amount)?;

    emit!(FaucetMinted {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        amount: args.amount,
    });

    Ok(())
}
