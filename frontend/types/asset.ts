export type Asset = {
  address?: string
  chainId?: number
  cmc_id: number
  decimals: number
  index?: number // Registry asset index for RPC operations
  mint?: string // Mint address for RPC operations
  name: string
  price: PriceData
  symbol: string
  uri?: string
  zodial?: MarketData
}

export type MarketData = {
  assetInfo: string
  bApy: number
  bToken: string
  dToken: string
  isMintable?: boolean
  ltv?: number
  mint: string
  sApy: number
  vaultAcc: string
}

export type PriceData = {
  day?: number
  latest: number
  marketcap: number
  month?: number
  week?: number
}
