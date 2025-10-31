use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FaucetMint {
    pub market: Pubkey,
    pub mint: Pubkey,
    pub mint_authority_bump: u8,
    pub decimals: u8,
    pub bump: u8,
}
