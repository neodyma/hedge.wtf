"use server"

import { PriceData } from "@/types/asset"

import { logMe } from "./utils"

export type CmcPost = {
  comment_count: string
  comments_url: string
  currencies: CmcPostCurrency[]
  language_code: string
  like_count: string
  owner: CmcPostOwner
  photos?: string[]
  post_id: string
  post_time: string
  repost_count?: string
  text_content: string
}

export type CmcPostCurrency = {
  id: number
  slug: string
  symbol: string
}

// CMC Social Posts Types
export type CmcPostOwner = {
  avatar_url: string
  nickname: string
}

export type CmcPostsResponse = {
  data: {
    last_score: string
    list: CmcPost[]
  }
  status: {
    credit_count: number
    elapsed: string
    error_code: string
    error_message: string
    timestamp: string
  }
}

export type HistoricalPricePoint = {
  date: string // Formatted date for display
  price: number
  timestamp: string
}

export async function fetchCmc(
  ids: (number | string)[],
  convert: string = "USD",
): Promise<Record<string, PriceData>> {
  if (!process.env.NEXT_PRIVATE_CMC_API_KEY) {
    throw new Error("CMC_API_KEY is not defined.")
  }

  const idsString = ids.join(",").toUpperCase()
  const url = new URL(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest`)
  url.searchParams.set("id", idsString)
  url.searchParams.set("convert", convert)

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-CMC_PRO_API_KEY": process.env.NEXT_PRIVATE_CMC_API_KEY,
    },
    next: { revalidate: 30 },
  })

  if (!res.ok) {
    throw new Error(
      `CoinMarketCap request failed: ${res.status}, error_message: "${(await res.json()).status.error_message}"`,
    )
  }

  type CmcQuote = {
    market_cap: number
    percent_change_7d: number
    percent_change_24h: number
    percent_change_30d: number
    price: number
  }

  type CmcCoin = {
    id: number
    quote: Record<string, CmcQuote>
    symbol: string
  }

  type CmcResponse = {
    data: Record<string, CmcCoin | CmcCoin[]>
  }

  const respo = await res.json()
  const json = respo as CmcResponse

  const patches: Record<string, PriceData> = {}

  for (const [, payload] of Object.entries(json.data)) {
    // CMC v2 may return either a single object or an array of one object.
    const coin = Array.isArray(payload) ? payload[0] : payload
    if (!coin) continue

    const q = coin.quote?.[convert]
    if (!q) continue

    const latest = q.price
    const day = latest / (1 + q.percent_change_24h / 100)
    const week = latest / (1 + q.percent_change_7d / 100)
    const month = latest / (1 + q.percent_change_30d / 100)

    patches[coin.symbol.toLowerCase()] = {
      day,
      latest,
      marketcap: q.market_cap,
      month,
      week,
    }
  }

  logMe(
    "[fetchCmc]",
    `fetched ${Object.keys(patches).length} patches for ${Object.keys(patches)
      .map((t) => t.toUpperCase())
      .join(", ")}`,
  )

  return patches
}

export async function fetchCmcPosts(cmcId: number, limit: number = 10): Promise<CmcPost[]> {
  if (!process.env.NEXT_PRIVATE_CMC_API_KEY) {
    throw new Error("CMC_API_KEY is not defined.")
  }

  const url = new URL("https://pro-api.coinmarketcap.com/v1/content/posts/top")
  url.searchParams.set("id", cmcId.toString())
  url.searchParams.set("limit", limit.toString())

  console.log("[fetchCmcPosts] Fetching posts for CMC ID:", cmcId)
  console.log("[fetchCmcPosts] URL:", url.toString())

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-CMC_PRO_API_KEY": process.env.NEXT_PRIVATE_CMC_API_KEY!,
    },
    next: { revalidate: 60 }, // Cache for 1 minute
  })

  console.log("[fetchCmcPosts] Response status:", res.status)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    console.error("[fetchCmcPosts] Error response:", errorData)
    throw new Error(
      `CoinMarketCap posts request failed: ${res.status}, error: "${errorData?.status?.error_message ?? "unknown"}"`,
    )
  }

  const json = (await res.json()) as CmcPostsResponse

  console.log("[fetchCmcPosts] Raw response data:", JSON.stringify(json, null, 2))
  console.log("[fetchCmcPosts] Total posts in response:", json.data?.list?.length ?? 0)

  // Filter posts to only include those that mention this specific asset
  const filteredPosts =
    json.data?.list?.filter((post) => post.currencies?.some((currency) => currency.id === cmcId)) ||
    []

  console.log("[fetchCmcPosts] Filtered posts count:", filteredPosts.length)
  console.log("[fetchCmcPosts] Filtered posts:", JSON.stringify(filteredPosts, null, 2))

  logMe("[fetchCmcPosts]", `fetched ${filteredPosts.length} posts for CMC ID ${cmcId}`)

  return filteredPosts
}

export async function fetchHistoricalPrices(
  cmcId: number,
  days: number = 30,
  convert: string = "USD",
  interval: "daily" | "hourly" = "daily",
): Promise<HistoricalPricePoint[]> {
  if (!process.env.NEXT_PRIVATE_CMC_API_KEY) {
    throw new Error("CMC_API_KEY is not defined.")
  }

  const url = new URL("https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/historical")
  url.searchParams.set("id", cmcId.toString())
  url.searchParams.set("count", (interval === "hourly" ? days * 24 : days).toString())
  url.searchParams.set("interval", interval)
  url.searchParams.set("convert", convert)

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-CMC_PRO_API_KEY": process.env.NEXT_PRIVATE_CMC_API_KEY!,
    },
    next: { revalidate: 3600 }, // Cache for 1 hour
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(
      `CoinMarketCap historical request failed: ${res.status}, error: "${errorData?.status?.error_message ?? "unknown"}"`,
    )
  }

  type CmcHistoricalQuote = {
    quote: Record<
      string,
      {
        market_cap: number
        price: number
        volume_24h: number
      }
    >
    timestamp: string
  }

  type CmcHistoricalResponse = {
    data: {
      quotes: CmcHistoricalQuote[]
    }
  }

  const json = (await res.json()) as CmcHistoricalResponse

  const historicalData: HistoricalPricePoint[] = []

  if (json.data?.quotes) {
    for (const quote of json.data.quotes) {
      const priceData = quote.quote?.[convert]
      if (!priceData) continue

      const timestamp = new Date(quote.timestamp)
      historicalData.push({
        date:
          interval === "hourly"
            ? timestamp.toLocaleTimeString("en-US", {
                hour: "numeric",
                hour12: true,
              })
            : timestamp.toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
              }),
        price: priceData.price,
        timestamp: quote.timestamp,
      })
    }
  }

  logMe(
    "[fetchHistoricalPrices]",
    `fetched ${historicalData.length} historical price points for CMC ID ${cmcId}`,
  )

  return historicalData
}

export async function getPrice(
  ids: number | number[],
  convert: string = "USD",
): Promise<Record<number, PriceData>> {
  if (!process.env.NEXT_PRIVATE_CMC_API_KEY) {
    throw new Error("CMC_API_KEY is not defined.")
  }

  const idsArr = Array.isArray(ids) ? ids : [ids]
  const idsString = idsArr.join(",")

  const url = new URL("https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest")
  url.searchParams.set("id", idsString)
  url.searchParams.set("convert", convert)

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-CMC_PRO_API_KEY": process.env.NEXT_PRIVATE_CMC_API_KEY!,
    },
    next: { revalidate: 30 },
  })

  if (!res.ok) {
    const { status } = await res.json()
    throw new Error(
      `CoinMarketCap request failed: ${res.status}, error_message: "${status?.error_message ?? "unknown"}"`,
    )
  }

  type CmcQuote = {
    market_cap: number
    percent_change_7d: number
    percent_change_24h: number
    percent_change_30d: number
    price: number
  }

  type CmcCoin = {
    id: number
    quote: Record<string, CmcQuote>
  }

  type CmcResponse = {
    data: Record<string, CmcCoin | CmcCoin[]>
  }

  const json = (await res.json()) as CmcResponse

  const prices: Record<number, PriceData> = {}

  for (const [, payload] of Object.entries(json.data)) {
    const coin = Array.isArray(payload) ? payload[0] : payload
    if (!coin) continue

    const q = coin.quote?.[convert]
    if (!q) continue

    const latest = q.price
    const day = latest / (1 + q.percent_change_24h / 100)
    const week = latest / (1 + q.percent_change_7d / 100)
    const month = latest / (1 + q.percent_change_30d / 100)

    prices[coin.id] = {
      day,
      latest,
      marketcap: q.market_cap,
      month,
      week,
    }
  }

  logMe("[getPrice]", `fetched ${Object.keys(prices).length} assets for IDs ${idsArr.join(", ")}`)

  return prices
}
