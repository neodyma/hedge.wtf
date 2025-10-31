pub const MAX_ASSETS: usize = 33;
pub const MAX_POSITIONS: usize = 16; // Match MAX_ASSETS to allow position in every asset

pub const MAX_RISK_PAIRS: usize = (MAX_ASSETS * (MAX_ASSETS + 1)) / 2;

pub const SEED_MARKET: &[u8] = b"market";
pub const SEED_ASSET_REG: &[u8] = b"asset-reg";
pub const SEED_RISK_REG: &[u8] = b"risk-reg";
pub const SEED_PRICE_CACHE: &[u8] = b"price-cache";
pub const SEED_POOL: &[u8] = b"pool";
pub const SEED_VAULT: &[u8] = b"vault";
pub const SEED_VAULT_AUTH: &[u8] = b"vault-auth";
pub const SEED_OBLIGATION: &[u8] = b"obligation";
pub const SEED_FAUCET_MINT: &[u8] = b"faucet-mint";
pub const SEED_FAUCET_MINT_AUTH: &[u8] = b"faucet-mint-auth";

pub const SECS_YEAR: u64 = 365 * 24 * 60 * 60;

pub const BPS_DENOM: u64 = 10_000;

pub const MAX_BORROW_APY_BPS_HARD: u16 = 100_00; // 100% APY
