export const qk = {
  allRegistries: (pid: string) => [...qk.scope(pid), "registries"] as const,

  autoMarketAndRegistry: (pid: string) => [...qk.scope(pid), "autoMarket+registry"] as const,
  bestMarket: (pid: string) => [...qk.scope(pid), "bestMarket"] as const,
  marketByPubkey: (pid: string, market: string) =>
    [...qk.scope(pid), "market", { market }] as const,

  markets: (pid: string) => [...qk.scope(pid), "markets"] as const,

  obligationByPda: (pid: string, pda: string) => [...qk.scope(pid), "obligation", { pda }] as const,

  obligationsByOwner: (pid: string, owner: string, market?: string) =>
    [...qk.scope(pid), "obligations", { market: market ?? null, owner }] as const,

  poolsByMarket: (pid: string, market: string) => [...qk.scope(pid), "pools", { market }] as const,

  priceCacheByMarket: (pid: string, market: string) =>
    [...qk.scope(pid), "priceCache", { market }] as const,

  registryByMarket: (pid: string, market: string) =>
    [...qk.scope(pid), "registry", { market }] as const,

  scope: (pid: string) => ["contract", pid] as const,

  walletBalances: (pid: string, owner: string) =>
    [...qk.scope(pid), "walletBalances", { owner }] as const,
}
