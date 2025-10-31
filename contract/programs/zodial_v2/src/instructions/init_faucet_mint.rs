use anchor_lang::prelude::*;
use anchor_spl::token::Token;

use crate::{
    constants::*,
    events::FaucetMintCreated,
    state::{FaucetMint, Market},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitFaucetMintArgs {
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(args: InitFaucetMintArgs)]
pub struct InitFaucetMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    #[account(
        seeds = [SEED_MARKET, authority.key().as_ref()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = payer,
        space = 8 + FaucetMint::INIT_SPACE,
        seeds = [SEED_FAUCET_MINT, market.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub faucet_mint: Account<'info, FaucetMint>,

    /// CHECK: PDA that will be mint authority
    #[account(
        seeds = [SEED_FAUCET_MINT_AUTH, faucet_mint.key().as_ref()],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub mint: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn init_faucet_mint(ctx: Context<InitFaucetMint>, args: InitFaucetMintArgs) -> Result<()> {
    use anchor_spl::token;

    let faucet_mint = &mut ctx.accounts.faucet_mint;
    faucet_mint.market = ctx.accounts.market.key();
    faucet_mint.mint = ctx.accounts.mint.key();
    faucet_mint.mint_authority_bump = ctx.bumps.mint_authority;
    faucet_mint.decimals = args.decimals;
    faucet_mint.bump = ctx.bumps.faucet_mint;

    let cpi_accounts = token::InitializeMint2 {
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::initialize_mint2(
        cpi_ctx,
        args.decimals,
        &ctx.accounts.mint_authority.key(),
        None,
    )?;

    emit!(FaucetMintCreated {
        market: ctx.accounts.market.key(),
        mint: ctx.accounts.mint.key(),
        decimals: args.decimals,
    });

    Ok(())
}
