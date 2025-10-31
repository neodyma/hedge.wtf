use anchor_lang::prelude::*;

#[error_code]
pub enum ZodialError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Market is paused")]
    MarketPaused,
    #[msg("Exceeded max assets")]
    ExceedsMaxAssets,
    #[msg("Exceeded max positions")]
    ExceedsMaxPositions,
    #[msg("Asset not registered")]
    AssetNotRegistered,
    #[msg("Pool not found")]
    PoolNotFound,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math underflow")]
    MathUnderflow,
    #[msg("Price is stale or unavailable")]
    PriceStale,
    #[msg("Insufficient liquidity in the pool vault")]
    InsufficientLiquidity,
    #[msg("Health check failed")]
    HealthCheckFailed,
    #[msg("Position not found")]
    PositionNotFound,
    #[msg("Unsupported mode")]
    UnsupportedMode,
    #[msg("Position is healthy and cannot be liquidated")]
    PositionHealthy,
    #[msg("Insufficient collateral to seize")]
    InsufficientCollateral,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Too many positions")]
    TooManyPositions,
    #[msg("Invalid risk pair")]
    InvalidRiskPair,
    #[msg("Pyth feed ID is not valid UTF-8")]
    InvalidPythFeedId,
    #[msg("Asset has no Pyth feed ID configured")]
    PythFeedNotSet,
    #[msg("Pyth price cannot be negative")]
    NegativePythPrice,
    #[msg("Price not found in cache")]
    PriceNotFound,
    #[msg("Pool has active positions and cannot be closed")]
    PoolNotEmpty,
}
