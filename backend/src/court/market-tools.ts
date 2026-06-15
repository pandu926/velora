/**
 * Market Data Tools — live external data sources that feed the AI Boardroom.
 *
 * 12 data sources across price, yield, sentiment, volatility, orderbook,
 * liquidations, technical indicators, and DEX analytics. Each tool fetches
 * real, current data from a public source (no API key) and returns an
 * Evidence object. On failure a tool returns null and is OMITTED — it NEVER
 * fabricates data.
 */

import type { Evidence } from './types.js'

const COINGECKO = 'https://api.coingecko.com/api/v3'
const FNG = 'https://api.alternative.me/fng'
const DEFILLAMA = 'https://yields.llama.fi/pools'
const DEXPAPRIKA = 'https://api.dexpaprika.com'
const COINGLASS_FREE = 'https://open-api.coinglass.com/public/v2'

const FETCH_TIMEOUT_MS = 12_000

async function timedFetch(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Source 1: CoinGecko Price + Momentum ───────────────────────────────────

export async function fetchMarketData(): Promise<Evidence | null> {
  try {
    const url = `${COINGECKO}/simple/price?ids=ethereum,usd-coin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
    const res = await timedFetch(url)
    if (!res.ok) return null
    const d = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number }
    >
    const eth = d.ethereum
    if (!eth || typeof eth.usd !== 'number') return null

    const change = eth.usd_24h_change ?? 0
    return {
      type: 'market_data',
      source: 'coingecko.com/api/v3',
      data: {
        ethUsd: eth.usd,
        eth24hChangePct: Number(change.toFixed(2)),
        eth24hVolUsd: eth.usd_24h_vol ?? null,
        ethMarketCapUsd: eth.usd_market_cap ?? null,
      },
      timestamp: Date.now(),
      description: `ETH $${eth.usd.toLocaleString()} (24h ${change >= 0 ? '+' : ''}${change.toFixed(2)}%), 24h vol $${Math.round((eth.usd_24h_vol ?? 0) / 1e9)}B`,
    }
  } catch {
    return null
  }
}

// ─── Source 2: Fear & Greed Index ───────────────────────────────────────────

export async function fetchSentiment(): Promise<Evidence | null> {
  try {
    const res = await timedFetch(`${FNG}/?limit=1`)
    if (!res.ok) return null
    const d = (await res.json()) as {
      data?: Array<{ value?: string; value_classification?: string }>
    }
    const entry = d.data?.[0]
    if (!entry || entry.value === undefined) return null

    const value = Number(entry.value)
    const label = entry.value_classification ?? 'Unknown'
    return {
      type: 'sentiment',
      source: 'alternative.me/fng',
      data: { index: value, classification: label },
      timestamp: Date.now(),
      description: `Market sentiment: ${value}/100 (${label})`,
    }
  } catch {
    return null
  }
}

// ─── Source 3: DefiLlama Yield Comparison ───────────────────────────────────

export async function fetchYieldComparison(): Promise<Evidence | null> {
  try {
    const res = await timedFetch(DEFILLAMA)
    if (!res.ok) return null
    const d = (await res.json()) as {
      data?: Array<{
        chain?: string
        project?: string
        symbol?: string
        apy?: number
        tvlUsd?: number
      }>
    }
    if (!Array.isArray(d.data)) return null

    const basePools = d.data
      .filter(
        (p) =>
          p.chain === 'Base' &&
          typeof p.symbol === 'string' &&
          p.symbol.includes('USDC') &&
          (p.tvlUsd ?? 0) > 1_000_000 &&
          (p.apy ?? 0) < 100
      )
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, 5)
      .map((p) => ({
        project: p.project,
        symbol: p.symbol,
        apy: Number((p.apy ?? 0).toFixed(2)),
        tvlUsd: Math.round(p.tvlUsd ?? 0),
      }))

    if (basePools.length === 0) return null

    const best = basePools.reduce((a, b) => (b.apy > a.apy ? b : a))
    return {
      type: 'yield_comparison',
      source: 'yields.llama.fi',
      data: { topPools: basePools, bestApy: best.apy, bestProject: best.project },
      timestamp: Date.now(),
      description: `Best Base USDC yield: ${best.project} at ${best.apy}% (top ${basePools.length} pools by TVL)`,
    }
  } catch {
    return null
  }
}

// ─── Source 4: ETH Realized Volatility ──────────────────────────────────────

export async function fetchVolatility(): Promise<Evidence | null> {
  try {
    const url = `${COINGECKO}/coins/ethereum/market_chart?vs_currency=usd&days=1`
    const res = await timedFetch(url)
    if (!res.ok) return null
    const d = (await res.json()) as { prices?: Array<[number, number]> }
    const prices = (d.prices ?? []).map((p) => p[1]).filter((n) => typeof n === 'number')
    if (prices.length < 3) return null

    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
    const stdev = Math.sqrt(variance)
    const dailyVolPct = Number((stdev * Math.sqrt(returns.length) * 100).toFixed(2))

    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const rangePct = Number((((max - min) / min) * 100).toFixed(2))

    return {
      type: 'volatility',
      source: 'coingecko.com/market_chart',
      data: { dailyVolPct, rangePct, samples: prices.length, low: min, high: max },
      timestamp: Date.now(),
      description: `ETH 24h volatility ~${dailyVolPct}% (range ${rangePct}% across ${prices.length} samples)`,
    }
  } catch {
    return null
  }
}

// ─── Source 5: CCXT Orderbook Depth ─────────────────────────────────────────

export async function fetchOrderbookDepth(): Promise<Evidence | null> {
  try {
    const ccxt = await import('ccxt')
    const exchange = new ccxt.default.binance({ enableRateLimit: true })
    const book = await exchange.fetchOrderBook('ETH/USDT', 20)

    const bidDepth = book.bids.reduce((sum, [, qty]) => sum + (qty ?? 0), 0)
    const askDepth = book.asks.reduce((sum, [, qty]) => sum + (qty ?? 0), 0)
    const spread = book.asks[0]?.[0] && book.bids[0]?.[0]
      ? ((book.asks[0][0] - book.bids[0][0]) / book.bids[0][0] * 100)
      : 0
    const imbalance = bidDepth / (bidDepth + askDepth)

    return {
      type: 'market_data',
      source: 'binance/orderbook (via CCXT)',
      data: {
        bidDepthETH: Number(bidDepth.toFixed(2)),
        askDepthETH: Number(askDepth.toFixed(2)),
        spreadPct: Number(spread.toFixed(4)),
        bidAskImbalance: Number(imbalance.toFixed(3)),
        topBid: book.bids[0]?.[0] ?? null,
        topAsk: book.asks[0]?.[0] ?? null,
      },
      timestamp: Date.now(),
      description: `ETH orderbook: bid depth ${bidDepth.toFixed(1)} ETH, ask ${askDepth.toFixed(1)} ETH, spread ${spread.toFixed(4)}%, imbalance ${(imbalance * 100).toFixed(1)}% buy-side`,
    }
  } catch {
    return null
  }
}

// ─── Source 6: CCXT Funding Rate ────────────────────────────────────────────

export async function fetchFundingRate(): Promise<Evidence | null> {
  try {
    const ccxt = await import('ccxt')
    const exchange = new ccxt.default.binance({ enableRateLimit: true, options: { defaultType: 'future' } })
    const funding = await exchange.fetchFundingRate('ETH/USDT:USDT')

    const rate = funding.fundingRate ?? 0
    const annualized = rate * 3 * 365 * 100

    return {
      type: 'market_data',
      source: 'binance/funding (via CCXT)',
      data: {
        fundingRate: Number((rate * 100).toFixed(4)),
        annualizedPct: Number(annualized.toFixed(2)),
        nextFundingTime: funding.fundingDatetime ?? null,
        markPrice: funding.markPrice ?? null,
        indexPrice: funding.indexPrice ?? null,
      },
      timestamp: Date.now(),
      description: `ETH perp funding: ${(rate * 100).toFixed(4)}% (${annualized.toFixed(1)}% annualized) — ${rate > 0 ? 'longs pay shorts' : 'shorts pay longs'}`,
    }
  } catch {
    return null
  }
}

// ─── Source 7: CCXT Open Interest ───────────────────────────────────────────

export async function fetchOpenInterest(): Promise<Evidence | null> {
  try {
    const ccxt = await import('ccxt')
    const exchange = new ccxt.default.binance({ enableRateLimit: true, options: { defaultType: 'future' } })
    const oi = await exchange.fetchOpenInterest('ETH/USDT:USDT')

    const oiValue = oi.openInterestAmount ?? 0
    const oiNotional = oi.openInterestValue ?? 0

    return {
      type: 'market_data',
      source: 'binance/open-interest (via CCXT)',
      data: {
        openInterestETH: Number(oiValue.toFixed(2)),
        openInterestUSD: Math.round(oiNotional),
      },
      timestamp: Date.now(),
      description: `ETH futures OI: ${oiValue.toFixed(0)} ETH ($${(oiNotional / 1e9).toFixed(2)}B notional)`,
    }
  } catch {
    return null
  }
}

// ─── Source 8: Technical Indicators (RSI, MACD) ─────────────────────────────

export async function fetchTechnicalIndicators(): Promise<Evidence | null> {
  try {
    const url = `${COINGECKO}/coins/ethereum/market_chart?vs_currency=usd&days=14`
    const res = await timedFetch(url)
    if (!res.ok) return null
    const d = (await res.json()) as { prices?: Array<[number, number]> }
    const closes = (d.prices ?? []).map((p) => p[1]).filter((n) => typeof n === 'number')
    if (closes.length < 14) return null

    const ti = await import('technicalindicators')

    const rsiValues = ti.RSI.calculate({ values: closes, period: 14 })
    const rsi = rsiValues[rsiValues.length - 1] ?? null

    const macdResult = ti.MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    })
    const macd = macdResult[macdResult.length - 1] ?? null

    const smaValues = ti.SMA.calculate({ values: closes, period: 14 })
    const sma14 = smaValues[smaValues.length - 1] ?? null

    const currentPrice = closes[closes.length - 1]
    const rsiSignal = rsi !== null ? (rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral') : 'unknown'

    return {
      type: 'market_data',
      source: 'technicalindicators (14d CoinGecko data)',
      data: {
        rsi14: rsi !== null ? Number(rsi.toFixed(1)) : null,
        rsiSignal,
        macdLine: macd?.MACD !== undefined ? Number(macd.MACD.toFixed(2)) : null,
        macdSignal: macd?.signal !== undefined ? Number(macd.signal.toFixed(2)) : null,
        macdHistogram: macd?.histogram !== undefined ? Number(macd.histogram.toFixed(2)) : null,
        sma14: sma14 !== null ? Number(sma14.toFixed(2)) : null,
        priceVsSma: sma14 ? Number(((currentPrice - sma14) / sma14 * 100).toFixed(2)) : null,
      },
      timestamp: Date.now(),
      description: `ETH technicals: RSI ${rsi?.toFixed(0) ?? '?'} (${rsiSignal}), MACD ${macd?.histogram !== undefined ? (macd.histogram > 0 ? 'bullish' : 'bearish') : '?'}, price ${sma14 && currentPrice > sma14 ? 'above' : 'below'} SMA14`,
    }
  } catch {
    return null
  }
}

// ─── Source 9: DexPaprika DEX Pool Analytics ────────────────────────────────

export async function fetchDexPoolAnalytics(): Promise<Evidence | null> {
  try {
    const url = `${DEXPAPRIKA}/networks/base/pools?sort=volume_usd&sort_dir=desc&limit=5`
    const res = await timedFetch(url)
    if (!res.ok) return null
    const d = (await res.json()) as {
      pools?: Array<{
        id?: string
        dex_id?: string
        tokens?: Array<{ symbol?: string }>
        volume_usd?: number
        tvl_usd?: number
        price_usd?: number
      }>
    }
    const pools = Array.isArray(d) ? d : (d as Record<string, unknown>).pools as typeof d.pools
    if (!pools || pools.length === 0) return null

    const topPools = pools.slice(0, 5).map(p => ({
      pair: (p.tokens ?? []).map((t: { symbol?: string }) => t.symbol).join('/') || p.id,
      dex: p.dex_id ?? 'unknown',
      volumeUsd: Math.round(p.volume_usd ?? 0),
      tvlUsd: Math.round(p.tvl_usd ?? 0),
    }))

    const totalVol = topPools.reduce((s, p) => s + p.volumeUsd, 0)
    return {
      type: 'market_data',
      source: 'dexpaprika.com/base',
      data: { topPools, totalVolume24h: totalVol },
      timestamp: Date.now(),
      description: `Base DEX top pools: $${(totalVol / 1e6).toFixed(1)}M combined 24h volume across ${topPools.length} pairs`,
    }
  } catch {
    return null
  }
}

// ─── Source 10: CoinGlass Liquidation Data (free endpoint) ──────────────────

export async function fetchLiquidations(): Promise<Evidence | null> {
  try {
    const url = `${COINGLASS_FREE}/liquidation/info?symbol=ETH&timeType=2`
    const res = await timedFetch(url)
    if (!res.ok) return null
    const d = (await res.json()) as {
      data?: Array<{
        longLiquidationUsd?: number
        shortLiquidationUsd?: number
        totalLiquidationUsd?: number
      }>
      code?: number
    }

    if (d.code !== 0 || !d.data || d.data.length === 0) return null
    const latest = d.data[0]

    return {
      type: 'market_data',
      source: 'coinglass.com/liquidation',
      data: {
        longLiquidationsUsd: latest.longLiquidationUsd ?? 0,
        shortLiquidationsUsd: latest.shortLiquidationUsd ?? 0,
        totalLiquidationsUsd: latest.totalLiquidationUsd ?? 0,
      },
      timestamp: Date.now(),
      description: `ETH 24h liquidations: $${((latest.totalLiquidationUsd ?? 0) / 1e6).toFixed(1)}M total (longs $${((latest.longLiquidationUsd ?? 0) / 1e6).toFixed(1)}M, shorts $${((latest.shortLiquidationUsd ?? 0) / 1e6).toFixed(1)}M)`,
    }
  } catch {
    return null
  }
}

// ─── Source 11: ETH Gas Price (Base L2) ─────────────────────────────────────

export async function fetchGasPrice(): Promise<Evidence | null> {
  try {
    const res = await timedFetch('https://mainnet.base.org')
    if (!res.ok) return null

    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_gasPrice',
      params: [],
      id: 1,
    })
    const rpcRes = await fetch('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!rpcRes.ok) return null

    const rpcData = (await rpcRes.json()) as { result?: string }
    if (!rpcData.result) return null

    const gasPriceWei = parseInt(rpcData.result, 16)
    const gasPriceGwei = gasPriceWei / 1e9

    return {
      type: 'market_data',
      source: 'base.org/eth_gasPrice',
      data: { gasPriceGwei: Number(gasPriceGwei.toFixed(4)), gasPriceWei },
      timestamp: Date.now(),
      description: `Base L2 gas: ${gasPriceGwei.toFixed(4)} Gwei — ${gasPriceGwei < 0.01 ? 'ultra low' : gasPriceGwei < 0.1 ? 'low' : 'normal'}`,
    }
  } catch {
    return null
  }
}

// ─── Source 12: ETH Staking APR (via CoinGecko) ────────────────────────────

export async function fetchStakingRate(): Promise<Evidence | null> {
  try {
    const url = `${COINGECKO}/coins/ethereum?localization=false&tickers=false&community_data=false&developer_data=false`
    const res = await timedFetch(url)
    if (!res.ok) return null
    const d = (await res.json()) as {
      market_data?: {
        current_price?: { usd?: number }
        total_supply?: number
        circulating_supply?: number
      }
    }

    const supply = d.market_data?.circulating_supply ?? 0
    const totalSupply = d.market_data?.total_supply ?? 0
    const stakingRatio = totalSupply > 0 ? ((totalSupply - supply) / totalSupply) : 0

    return {
      type: 'market_data',
      source: 'coingecko.com/eth-staking',
      data: {
        circulatingSupply: Math.round(supply),
        totalSupply: Math.round(totalSupply),
        estimatedStakingRatio: Number((stakingRatio * 100).toFixed(1)),
      },
      timestamp: Date.now(),
      description: `ETH supply: ${(supply / 1e6).toFixed(1)}M circulating of ${(totalSupply / 1e6).toFixed(1)}M total`,
    }
  } catch {
    return null
  }
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

export async function gatherMarketEvidence(): Promise<Evidence[]> {
  const results = await Promise.all([
    fetchMarketData(),
    fetchSentiment(),
    fetchYieldComparison(),
    fetchVolatility(),
    fetchOrderbookDepth(),
    fetchFundingRate(),
    fetchOpenInterest(),
    fetchTechnicalIndicators(),
    fetchDexPoolAnalytics(),
    fetchLiquidations(),
    fetchGasPrice(),
    fetchStakingRate(),
  ])
  return results.filter((e): e is Evidence => e !== null)
}
