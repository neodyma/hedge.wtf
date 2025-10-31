use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PriceCache {
    pub market: Pubkey,
    pub bump: u8,
    pub last_slot: u64,
    #[max_len(64)]
    pub prices: Vec<PriceEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PriceEntry {
    pub asset_index: u16,
    pub price_q60: u128,
}
