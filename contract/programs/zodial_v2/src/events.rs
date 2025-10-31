use anchor_lang::prelude::*;

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub max_assets: u16,
    pub max_positions: u16,
}

#[event]
pub struct AssetRegistered {
    pub market: Pubkey,
    pub mint: Pubkey,
    pub index: u16,
}

#[event]
pub struct PoolInitialized {
    pub market: Pubkey,
    pub mint: Pubkey,
    pub pool: Pubkey,
}

#[event]
pub struct Deposit {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub shares_q60: u128,
}

#[event]
pub struct Repay {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub burned_shares_q60: u128,
}

#[event]
pub struct Borrow {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub minted_shares_q60: u128,
}

#[event]
pub struct Withdraw {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub burned_shares_q60: u128,
}

#[event]
pub struct RiskPairSet {
    pub market: Pubkey,
    pub a_mint: Pubkey,
    pub b_mint: Pubkey,
    pub a_index: u16,
    pub b_index: u16,
    pub ltv_bps: u16,
    pub liq_threshold_bps: u16,
    pub liq_bonus_bps: u16,
}

#[event]
pub struct RiskPairsBatchSet {
    pub market: Pubkey,
    pub count: u16,
}

#[event]
pub struct PricesUpdated {
    pub market: Pubkey,
    pub count: u16,
    pub slot: u64,
}

#[event]
pub struct LiquidationExecuted {
    pub liquidator: Pubkey,
    pub target: Pubkey,
    pub borrow_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub repay_amount: u64,
    pub collateral_amount: u64,
    pub health_before: u128,
}

#[event]
pub struct FaucetMintCreated {
    pub market: Pubkey,
    pub mint: Pubkey,
    pub decimals: u8,
}

#[event]
pub struct FaucetMinted {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FaucetSwapped {
    pub user: Pubkey,
    pub mint_from: Pubkey,
    pub mint_to: Pubkey,
    pub amount: u64,
}
