/// Market
#[macro_export]
macro_rules! signer_seeds_market {
    ($authority:expr, $bump:expr) => {
        &[
            $crate::constants::SEED_MARKET,
            $authority.as_ref(),
            &[$bump],
        ]
    };
}

/// Asset registry
#[macro_export]
macro_rules! signer_seeds_asset_reg {
    ($market:expr, $bump:expr) => {
        &[
            $crate::constants::SEED_ASSET_REG,
            $market.as_ref(),
            &[$bump],
        ]
    };
}

/// Risk registry
#[macro_export]
macro_rules! signer_seeds_risk_reg {
    ($market:expr, $bump:expr) => {
        &[$crate::constants::SEED_RISK_REG, $market.as_ref(), &[$bump]]
    };
}

/// Price cache
#[macro_export]
macro_rules! signer_seeds_price_cache {
    ($market:expr, $bump:expr) => {
        &[
            $crate::constants::SEED_PRICE_CACHE,
            $market.as_ref(),
            &[$bump],
        ]
    };
}

/// Pool
#[macro_export]
macro_rules! signer_seeds_pool {
    ($market:expr, $mint:expr, $bump:expr) => {
        &[
            $crate::constants::SEED_POOL,
            $market.as_ref(),
            $mint.as_ref(),
            &[$bump],
        ]
    };
}

/// Vault authority
#[macro_export]
macro_rules! signer_seeds_vault_auth {
    ($pool:expr, $bump:expr) => {
        &[$crate::constants::SEED_VAULT_AUTH, $pool.as_ref(), &[$bump]]
    };
}

/// Obligation
#[macro_export]
macro_rules! signer_seeds_obligation {
    ($market:expr, $owner:expr, $bump:expr) => {
        &[
            $crate::constants::SEED_OBLIGATION,
            $market.as_ref(),
            $owner.as_ref(),
            &[$bump],
        ]
    };
}
