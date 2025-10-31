use anchor_lang::prelude::*;

use crate::{constants::MAX_RISK_PAIRS, error::ZodialError};

#[account]
#[derive(InitSpace)]
pub struct RiskRegistry {
    pub market: Pubkey,
    pub bump: u8,
    pub dim: u16,
    #[max_len(MAX_RISK_PAIRS)]
    pub pairs: Vec<RiskPair>,
}

impl RiskRegistry {
    /// Get the risk pair for two assets by their indices
    pub fn get_pair(&self, a_idx: u16, b_idx: u16) -> Result<&RiskPair> {
        let k = tri_index(a_idx, b_idx, self.dim);
        self.pairs
            .get(k)
            .ok_or(error!(ZodialError::InvalidRiskPair))
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct RiskPair {
    pub ltv_bps: u16,
    pub liq_threshold_bps: u16,
    pub liq_bonus_bps: u16,
}

pub fn tri_index(i: u16, j: u16, dim: u16) -> usize {
    let (i, j) = if i <= j {
        (i as usize, j as usize)
    } else {
        (j as usize, i as usize)
    };
    let dim = dim as usize;
    i * dim - (i * (i + 1)) / 2 + j
}
