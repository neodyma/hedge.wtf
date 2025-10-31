use anchor_lang::prelude::*;

use crate::constants::MAX_POSITIONS;

#[account]
#[derive(InitSpace)]
pub struct Obligation {
    pub market: Pubkey,
    pub owner: Pubkey,
    #[max_len(MAX_POSITIONS)]
    pub positions: Vec<Position>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Position {
    pub mint: Pubkey,
    pub deposit_shares_q60: u128,
    pub borrow_shares_q60: u128,
}
