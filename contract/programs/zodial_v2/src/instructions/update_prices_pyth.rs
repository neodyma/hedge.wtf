use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

use crate::{
    constants::*,
    error::ZodialError,
    events::PricesUpdated,
    state::{AssetRegistry, Market, PriceCache, PriceEntry},
    utils::price::{q60_from_pyth, q60_to_f64, format_pyth_price},
};

/// Update price for a single asset using Pyth Pull oracle
/// This instruction is permissionless - anyone can call it with valid Pyth data
/// The asset is identified by its mint address
/// The price feed ID is looked up from the asset registry
pub fn update_prices_pyth(ctx: Context<UpdatePricesPyth>, mint: Pubkey) -> Result<()> {
    let registry = &ctx.accounts.asset_registry;
    let cache = &mut ctx.accounts.price_cache;
    let price_update = &ctx.accounts.price_update;
    let market = &ctx.accounts.market;

    // 1. Find asset by mint
    let asset = registry
        .assets
        .iter()
        .find(|a| a.mint == mint)
        .ok_or(error!(ZodialError::AssetNotRegistered))?;

    msg!("Updating price for asset index {} (mint: {})", asset.index, mint);

    // 2. Check if Pyth feed ID is configured
    let is_empty = asset.pyth_feed_id.iter().all(|&b| b == 0);
    require!(!is_empty, ZodialError::PythFeedNotSet);

    // 3. Convert hex feed_id bytes to string (e.g., "0xef0d8b6fda2ceba...")
    let feed_id_str = core::str::from_utf8(&asset.pyth_feed_id)
        .map_err(|_| error!(ZodialError::InvalidPythFeedId))?;

    msg!("Feed ID: {}", feed_id_str);

    // 4. Get price from PriceUpdateV2 using get_feed_id_from_hex
    // If price is not available, skip this asset
    let price = match price_update.get_price_no_older_than(
        &Clock::get()?,
        market.pyth_max_age_secs,
        &get_feed_id_from_hex(feed_id_str)?,
    ) {
        Ok(p) => p,
        Err(e) => {
            msg!("Skipping asset {}: price not available or stale ({})", asset.index, e);
            return Ok(());
        }
    };

    // 5. Convert to Q60
    let price_q60 = q60_from_pyth(price.price, price.exponent)?;

    // 6. Upsert into cache
    if let Some(entry) = cache.prices.iter_mut().find(|e| e.asset_index == asset.index) {
        // Update existing entry
        entry.price_q60 = price_q60;
        msg!("Updated existing price entry for asset {}", asset.index);
    } else {
        // Add new entry
        cache.prices.push(PriceEntry {
            asset_index: asset.index,
            price_q60,
        });
        msg!("Added new price entry for asset {}", asset.index);
    }

    cache.last_slot = Clock::get()?.slot;

    // === READABLE LOGGING ===

    msg!("=== Asset {} Price Update ===", asset.index);
    msg!("Mint: {}", mint);

    // Log native Pyth format
    msg!("=== Pyth Native Format ===");
    msg!("Raw Price: {}", price.price);
    msg!("Exponent: {}", price.exponent);
    msg!("Formatted: {}", format_pyth_price(price.price, price.exponent));

    // Log Q60 format
    msg!("=== Q60 Fixed-Point Format ===");
    msg!("Q60 (u128): {}", price_q60);
    msg!("Q60 as decimal: {}", q60_to_f64(price_q60));

    // Log metadata
    msg!("=== Metadata ===");
    msg!("Confidence: {}", price.conf);
    msg!("Publish time: {}", price.publish_time);
    msg!("Cache last slot: {}", cache.last_slot);

    emit!(PricesUpdated {
        market: ctx.accounts.market.key(),
        count: 1,
        slot: cache.last_slot,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct UpdatePricesPyth<'info> {
    #[account(
        seeds = [SEED_MARKET, market.authority.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [SEED_ASSET_REG, market.key().as_ref()],
        bump = asset_registry.bump
    )]
    pub asset_registry: Account<'info, AssetRegistry>,

    #[account(
        mut,
        seeds = [SEED_PRICE_CACHE, market.key().as_ref()],
        bump = market.price_cache_bump
    )]
    pub price_cache: Account<'info, PriceCache>,

    /// The price update account from Pyth (contains multiple feeds)
    pub price_update: Account<'info, PriceUpdateV2>,
}
