#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("5E1ikr753b8RQZdtohZAY8wmpjn2hu9dWzrN5xEasmtu");

#[program]
pub mod zodial_v2 {
    use super::*;

    pub fn init_market(ctx: Context<InitMarket>, args: InitMarketArgs) -> Result<()> {
        init_market::init_market(ctx, args)
    }

    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        args: register_asset::RegisterAssetArgs,
    ) -> Result<()> {
        register_asset::register_asset(ctx, args)
    }

    pub fn init_pool(ctx: Context<InitPool>, args: InitPoolArgs) -> Result<()> {
        init_pool::init_pool(ctx, args)
    }

    pub fn deposit(ctx: Context<Deposit>, args: DepositArgs) -> Result<()> {
        deposit::deposit(ctx, args)
    }

    pub fn leverage_existing_deposit(
        ctx: Context<LeverageExistingDeposit>,
        args: LeverageExistingDepositArgs,
    ) -> Result<()> {
        leverage_existing_deposit::leverage_existing_deposit(ctx, args)
    }

    pub fn repay(ctx: Context<Repay>, args: RepayArgs) -> Result<()> {
        repay::repay(ctx, args)
    }

    pub fn borrow(ctx: Context<Borrow>, args: BorrowArgs) -> Result<()> {
        borrow::borrow(ctx, args)
    }

    pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
        withdraw::withdraw(ctx, args)
    }

    pub fn set_risk_pair(ctx: Context<SetRiskPair>, args: SetRiskPairArgs) -> Result<()> {
        set_risk_pair::set(ctx, args)
    }

    pub fn set_risk_pairs_batch(
        ctx: Context<SetRiskPairsBatch>,
        args: SetRiskPairsBatchArgs,
    ) -> Result<()> {
        set_risk_pairs_batch::set_batch(ctx, args)
    }

    pub fn update_prices(ctx: Context<UpdatePrices>, args: UpdatePricesArgs) -> Result<()> {
        update_prices::update(ctx, args)
    }

    pub fn check_liquidation(
        ctx: Context<CheckLiquidation>,
        args: CheckLiquidationArgs,
    ) -> Result<()> {
        liquidate::check_liquidation(ctx, args)
    }

    pub fn liquidate_obligation(
        ctx: Context<LiquidateObligation>,
        args: LiquidateObligationArgs,
    ) -> Result<()> {
        liquidate::handler_liquidate_obligation(ctx, args)
    }

    pub fn update_prices_pyth(ctx: Context<UpdatePricesPyth>, mint: Pubkey) -> Result<()> {
        update_prices_pyth::update_prices_pyth(ctx, mint)
    }

    pub fn close_price_cache(ctx: Context<ClosePriceCache>) -> Result<()> {
        close_price_cache::close_price_cache(ctx)
    }

    pub fn close_asset_registry(ctx: Context<CloseAssetRegistry>) -> Result<()> {
        close_asset_registry::close_asset_registry(ctx)
    }

    pub fn close_risk_registry(ctx: Context<CloseRiskRegistry>) -> Result<()> {
        close_risk_registry::close_risk_registry(ctx)
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        close_market::close_market(ctx)
    }

    pub fn close_obligation(ctx: Context<CloseObligation>) -> Result<()> {
        close_obligation::close_obligation(ctx)
    }

    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        close_pool::close_pool(ctx)
    }

    pub fn init_faucet_mint(ctx: Context<InitFaucetMint>, args: InitFaucetMintArgs) -> Result<()> {
        init_faucet_mint::init_faucet_mint(ctx, args)
    }

    pub fn faucet(ctx: Context<Faucet>, args: FaucetArgs) -> Result<()> {
        faucet::faucet(ctx, args)
    }

    pub fn faucet_swap(ctx: Context<FaucetSwap>, args: FaucetSwapArgs) -> Result<()> {
        faucet_swap::faucet_swap(ctx, args)
    }
}
