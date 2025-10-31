use crate::state::Pool;

pub fn accrue_pool(pool: &mut Pool, now: i64) {
    let elapsed = now.saturating_sub(pool.last_timestamp);
    if elapsed <= 0 {
        return;
    }
    let util_bps = pool.utilization_bps();
    let new_b =
        pool.rate
            .advance_factor_simple(pool.borrow_fac_q60, util_bps, elapsed as u64, true);
    let new_d =
        pool.rate
            .advance_factor_simple(pool.deposit_fac_q60, util_bps, elapsed as u64, false);
    pool.borrow_fac_q60 = new_b;
    pool.deposit_fac_q60 = new_d;
    pool.last_timestamp = now;
}
