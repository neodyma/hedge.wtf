use anchor_lang::prelude::*;
use fixed::types::U68F60;

use crate::constants::BPS_DENOM;
use crate::state::RateModel;
use crate::utils::math::{mul_q60_by_u68_to_u64, unpack_u68f60};

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub market: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,

    pub borrow_fac_q60: u128,
    pub deposit_fac_q60: u128,

    pub total_borrow_shares_q60: u128,
    pub total_deposit_shares_q60: u128,

    pub last_timestamp: i64,

    pub rate: RateModel,

    pub bump: u8,
    pub vault_auth_bump: u8,
}

impl Pool {
    #[inline]
    pub fn borrow_index(&self) -> U68F60 {
        unpack_u68f60(self.borrow_fac_q60)
    }

    #[inline]
    pub fn deposit_index(&self) -> U68F60 {
        unpack_u68f60(self.deposit_fac_q60)
    }

    /// utilization in bps: borrows / deposits
    pub fn utilization_bps(&self) -> u16 {
        if self.total_borrow_shares_q60 == 0 || self.total_deposit_shares_q60 == 0 {
            return 0;
        }
        let b_idx = self.borrow_index();
        let d_idx = self.deposit_index();

        let borrows = mul_q60_by_u68_to_u64(self.total_borrow_shares_q60, b_idx).unwrap_or(0);
        let deposits = mul_q60_by_u68_to_u64(self.total_deposit_shares_q60, d_idx).unwrap_or(0);

        if deposits == 0 {
            0
        } else {
            let util = (borrows as u128).saturating_mul(BPS_DENOM as u128) / (deposits as u128);
            util.min(BPS_DENOM as u128) as u16
        }
    }
}
