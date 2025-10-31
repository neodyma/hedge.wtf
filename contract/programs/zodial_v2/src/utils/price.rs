use anchor_lang::prelude::*;
use fixed::types::U68F60;
use super::math::pack_u68f60;

pub trait PriceSource {
    fn price(&self, asset_index: u16) -> Result<U68F60>;
}

pub struct MockPriceSource;
impl PriceSource for MockPriceSource {
    fn price(&self, _asset_index: u16) -> Result<U68F60> {
        Ok(U68F60::from_num(1u64))
    }
}

/// Convert Pyth price (integer + exponent) to Q60 fixed-point format
///
/// Pyth format: actual_price = price * 10^exponent
/// Example: price=123456, exponent=-2 -> 1234.56
///
/// Returns the price as u128 in Q60 format for storage
///
/// # Arguments
/// * `price` - The raw price value from Pyth (i64)
/// * `exponent` - The power of 10 exponent from Pyth (i32)
///
/// # Returns
/// * `Result<u128>` - Price in Q60 format (packed U68F60)
pub fn q60_from_pyth(price: i64, exponent: i32) -> Result<u128> {
    // Validate price is not negative
    require!(price >= 0, crate::error::ZodialError::NegativePythPrice);

    // Convert to U68F60 fixed-point
    // Calculate the actual decimal value: price * 10^exponent
    let price_f64 = if exponent >= 0 {
        (price as f64) * 10f64.powi(exponent)
    } else {
        (price as f64) / 10f64.powi(-exponent)
    };

    // Create U68F60 from the calculated price
    let price_fixed = U68F60::from_num(price_f64);

    // Pack to u128
    Ok(pack_u68f60(price_fixed))
}

/// Convert Q60 format back to human-readable f64
/// Used for logging and display purposes
pub fn q60_to_f64(price_q60: u128) -> f64 {
    use super::math::unpack_u68f60;
    let price_fixed = unpack_u68f60(price_q60);
    let price_f64: f64 = price_fixed.to_num();
    price_f64
}

/// Format Pyth price as human-readable string
/// Example: (9998880000, -5) -> "99988.80000"
pub fn format_pyth_price(price: i64, exponent: i32) -> String {
    if exponent >= 0 {
        format!("{}", price * 10i64.pow(exponent as u32))
    } else {
        let divisor = 10i64.pow((-exponent) as u32);
        let integer_part = price / divisor;
        let fractional_part = (price % divisor).abs();
        format!("{}.{:0width$}", integer_part, fractional_part, width = (-exponent) as usize)
    }
}
