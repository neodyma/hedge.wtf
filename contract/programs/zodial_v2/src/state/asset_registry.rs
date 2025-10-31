use crate::constants::MAX_ASSETS;
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AssetRegistry {
    pub market: Pubkey,
    pub bump: u8,
    pub count: u16,
    #[max_len(MAX_ASSETS)]
    pub assets: Vec<AssetMeta>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct AssetMeta {
    pub mint: Pubkey,
    pub pyth_price: Pubkey, // 0 if unused (for Push oracle or other uses)
    pub pyth_feed_id: [u8; 66], // Hex string "0xef0d8b..." for Pull oracle, [0u8; 66] if unused
    pub decimals: u8,
    pub enabled_as_collateral: bool,
    pub index: u16,
}
