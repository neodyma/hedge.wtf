use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub authority: Pubkey,
    pub max_assets: u16,
    pub max_positions: u16,
    pub default_ltv_bps: u16,
    pub default_liq_threshold_bps: u16,
    pub default_liq_bonus_bps: u16,
    pub price_mode: PriceMode,
    pub version: u8,
    pub bump: u8,
    pub price_cache_bump: u8,
    pub paused: bool,
    pub pyth_max_age_secs: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub enum PriceMode {
    Mock,
    Cache,
}
