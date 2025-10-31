use anchor_lang::prelude::*;
use fixed::types::U68F60;

pub fn pack_u68f60(v: U68F60) -> u128 {
    v.to_bits()
}

pub fn unpack_u68f60(bits: u128) -> U68F60 {
    U68F60::from_bits(bits)
}

/// amount(u64) * index(U68F60) -> u64 (rounding toward zero)
pub fn mul_u64_u68_to_u64(amount: u64, idx: U68F60) -> Result<u64> {
    let a = U68F60::from_num(amount);
    let p = a.saturating_mul(idx);
    let out: u128 = p.to_num();
    u64::try_from(out).map_err(|_| error!(crate::error::ZodialError::MathOverflow))
}

/// amount(u64) / index(U68F60) -> u128 shares in Q60 as u128
pub fn div_u64_by_u68_to_q60(amount: u64, idx: U68F60) -> Result<u128> {
    let a = U68F60::from_num(amount);
    let q = a
        .checked_div(idx)
        .ok_or(error!(crate::error::ZodialError::MathOverflow))?;
    Ok(q.to_bits()) // return raw Q60 bits for storage as shares
}

/// shares(Q60 as u128) * index(U68F60) -> u64
pub fn mul_q60_by_u68_to_u64(shares_q60: u128, idx: U68F60) -> Result<u64> {
    let s = U68F60::from_bits(shares_q60);
    let p = s.saturating_mul(idx);
    let out: u128 = p.to_num();
    u64::try_from(out).map_err(|_| error!(crate::error::ZodialError::MathOverflow))
}
