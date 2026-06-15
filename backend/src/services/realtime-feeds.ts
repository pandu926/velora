import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { config } from '../config/index.js'

export interface PriceUpdate {
  symbol: string
  price: number
  timestamp: number
  source: 'binance' | 'pyth'
}

export interface FundingUpdate {
  symbol: string
  rate: number
  nextFundingTime: number
}

export interface LiquidationEvent {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  timestamp: number
}

export interface OrderBookSnapshot {
  symbol: string
  bestBid: number
  bestAsk: number
  bidDepth: number
  askDepth: number
  spread: number
  timestamp: number
}

export interface OnChainEvent {
  type: 'aave_rate_update' | 'whale_transfer' | 'new_block'
  data: Record<string, unknown>
  timestamp: number
}

export interface FearGreedUpdate {
  value: number
  classification: string
  timestamp: number
}

type FeedEvent =
  | { type: 'price'; data: PriceUpdate }
  | { type: 'funding'; data: FundingUpdate }
  | { type: 'liquidation'; data: LiquidationEvent }
  | { type: 'orderbook'; data: OrderBookSnapshot }
  | { type: 'onchain'; data: OnChainEvent }
  | { type: 'fear_greed'; data: FearGreedUpdate }

const BINANCE_SPOT_URL = 'wss://stream.binance.com:9443/stream'
const BINANCE_FUTURES_URL = 'wss://fstream.binance.com/stream'
const ALCHEMY_WS_URL = `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || 'Kgzqrx202_d8qgesCF9-A'}`
const PYTH_SSE_URL = 'https://hermes.pyth.network/v2/updates/price/stream'
const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1'

const PYTH_FEED_IDS = {
  BTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
}

const AAVE_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const RESERVE_DATA_UPDATED_TOPIC = '0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const RECONNECT_DELAY = 5000
const PING_INTERVAL = 30000
const FEAR_GREED_POLL_MS = 300000

export class RealtimeFeeds extends EventEmitter {
  private binanceSpotWs: WebSocket | null = null
  private binanceFuturesWs: WebSocket | null = null
  private alchemyWs: WebSocket | null = null
  private pythController: AbortController | null = null
  private fearGreedInterval: ReturnType<typeof setInterval> | null = null
  private pingIntervals: ReturnType<typeof setInterval>[] = []
  private running = false

  private latestPrices: Map<string, PriceUpdate> = new Map()
  private latestFunding: Map<string, FundingUpdate> = new Map()
  private latestOrderbook: Map<string, OrderBookSnapshot> = new Map()
  private latestFearGreed: FearGreedUpdate | null = null

  start(): void {
    if (this.running) return
    this.running = true

    this.connectBinanceSpot()
    this.connectBinanceFutures()
    this.connectAlchemy()
    this.connectPyth()
    this.startFearGreedPoller()

    console.log('[RealtimeFeeds] Started — 4 streams + 1 poller')
  }

  stop(): void {
    this.running = false
    this.binanceSpotWs?.close()
    this.binanceFuturesWs?.close()
    this.alchemyWs?.close()
    this.pythController?.abort()
    if (this.fearGreedInterval) clearInterval(this.fearGreedInterval)
    this.pingIntervals.forEach(i => clearInterval(i))
    this.pingIntervals = []
    console.log('[RealtimeFeeds] Stopped')
  }

  getLatestPrices(): Map<string, PriceUpdate> { return this.latestPrices }
  getLatestFunding(): Map<string, FundingUpdate> { return this.latestFunding }
  getLatestOrderbook(): Map<string, OrderBookSnapshot> { return this.latestOrderbook }
  getLatestFearGreed(): FearGreedUpdate | null { return this.latestFearGreed }

  getSnapshot(): Record<string, unknown> {
    return {
      prices: Object.fromEntries(this.latestPrices),
      funding: Object.fromEntries(this.latestFunding),
      orderbook: Object.fromEntries(this.latestOrderbook),
      fearGreed: this.latestFearGreed,
      connections: {
        binanceSpot: this.binanceSpotWs?.readyState === WebSocket.OPEN,
        binanceFutures: this.binanceFuturesWs?.readyState === WebSocket.OPEN,
        alchemy: this.alchemyWs?.readyState === WebSocket.OPEN,
        pyth: this.pythController !== null && !this.pythController.signal.aborted,
      },
    }
  }

  private connectBinanceSpot(): void {
    const streams = [
      'btcusdt@aggTrade', 'ethusdt@aggTrade',
      'btcusdt@bookTicker', 'ethusdt@bookTicker',
      'btcusdt@depth5@1000ms', 'ethusdt@depth5@1000ms',
    ]
    const url = `${BINANCE_SPOT_URL}?streams=${streams.join('/')}`

    this.binanceSpotWs = new WebSocket(url)

    this.binanceSpotWs.on('open', () => {
      console.log('[Binance Spot] Connected')
      const ping = setInterval(() => {
        if (this.binanceSpotWs?.readyState === WebSocket.OPEN) {
          this.binanceSpotWs.ping()
        }
      }, PING_INTERVAL)
      this.pingIntervals.push(ping)
    })

    this.binanceSpotWs.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { stream?: string; data?: Record<string, unknown> }
        if (!msg.stream || !msg.data) return

        const d = msg.data as Record<string, unknown>

        if (msg.stream.includes('@aggTrade')) {
          const price: PriceUpdate = {
            symbol: (d.s as string) || '',
            price: parseFloat(d.p as string),
            timestamp: (d.E as number) || Date.now(),
            source: 'binance',
          }
          this.latestPrices.set(price.symbol, price)
          this.emit('price', price)
        }

        if (msg.stream.includes('@bookTicker')) {
          const snapshot: OrderBookSnapshot = {
            symbol: (d.s as string) || '',
            bestBid: parseFloat(d.b as string),
            bestAsk: parseFloat(d.a as string),
            bidDepth: parseFloat(d.B as string),
            askDepth: parseFloat(d.A as string),
            spread: parseFloat(d.a as string) - parseFloat(d.b as string),
            timestamp: Date.now(),
          }
          this.latestOrderbook.set(snapshot.symbol, snapshot)
          this.emit('orderbook', snapshot)
        }
      } catch {}
    })

    this.binanceSpotWs.on('close', () => {
      if (this.running) {
        console.log('[Binance Spot] Disconnected, reconnecting...')
        setTimeout(() => this.connectBinanceSpot(), RECONNECT_DELAY)
      }
    })

    this.binanceSpotWs.on('error', () => {})
  }

  private connectBinanceFutures(): void {
    const streams = [
      'btcusdt@markPrice@1s', 'ethusdt@markPrice@1s',
      '!forceOrder@arr',
    ]
    const url = `${BINANCE_FUTURES_URL}?streams=${streams.join('/')}`

    this.binanceFuturesWs = new WebSocket(url)

    this.binanceFuturesWs.on('open', () => {
      console.log('[Binance Futures] Connected')
    })

    this.binanceFuturesWs.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { stream?: string; data?: Record<string, unknown> }
        if (!msg.stream || !msg.data) return

        const d = msg.data as Record<string, unknown>

        if (msg.stream.includes('@markPrice')) {
          const funding: FundingUpdate = {
            symbol: (d.s as string) || '',
            rate: parseFloat(d.r as string),
            nextFundingTime: (d.T as number) || 0,
          }
          this.latestFunding.set(funding.symbol, funding)
          this.emit('funding', funding)
        }

        if (msg.stream.includes('forceOrder')) {
          const order = d.o as Record<string, unknown> | undefined
          if (!order) return
          const liq: LiquidationEvent = {
            symbol: (order.s as string) || '',
            side: (order.S as string)?.toLowerCase() === 'buy' ? 'buy' : 'sell',
            quantity: parseFloat(order.q as string),
            price: parseFloat(order.p as string),
            timestamp: (order.T as number) || Date.now(),
          }
          this.emit('liquidation', liq)
        }
      } catch {}
    })

    this.binanceFuturesWs.on('close', () => {
      if (this.running) {
        setTimeout(() => this.connectBinanceFutures(), RECONNECT_DELAY)
      }
    })

    this.binanceFuturesWs.on('error', () => {})
  }

  private connectAlchemy(): void {
    this.alchemyWs = new WebSocket(ALCHEMY_WS_URL)

    this.alchemyWs.on('open', () => {
      console.log('[Alchemy Base] Connected')

      this.alchemyWs!.send(JSON.stringify({
        jsonrpc: '2.0', method: 'eth_subscribe',
        params: ['logs', { address: AAVE_POOL_BASE, topics: [RESERVE_DATA_UPDATED_TOPIC] }],
        id: 1,
      }))

      this.alchemyWs!.send(JSON.stringify({
        jsonrpc: '2.0', method: 'eth_subscribe',
        params: ['logs', { address: USDC_BASE, topics: [TRANSFER_TOPIC] }],
        id: 2,
      }))

      this.alchemyWs!.send(JSON.stringify({
        jsonrpc: '2.0', method: 'eth_subscribe',
        params: ['newHeads'],
        id: 3,
      }))
    })

    this.alchemyWs.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { method?: string; params?: { result?: Record<string, unknown>; subscription?: string } }
        if (msg.method !== 'eth_subscription' || !msg.params?.result) return

        const result = msg.params.result

        if (result.baseFeePerGas) {
          const event: OnChainEvent = {
            type: 'new_block',
            data: { blockNumber: result.number, baseFee: result.baseFeePerGas, timestamp: result.timestamp },
            timestamp: Date.now(),
          }
          this.emit('onchain', event)
        } else if (result.topics && (result.topics as string[])[0] === RESERVE_DATA_UPDATED_TOPIC) {
          const event: OnChainEvent = {
            type: 'aave_rate_update',
            data: { log: result },
            timestamp: Date.now(),
          }
          this.emit('onchain', event)
        } else if (result.topics && (result.topics as string[])[0] === TRANSFER_TOPIC) {
          const data = result.data as string
          if (data) {
            const amount = parseInt(data, 16) / 1e6
            if (amount >= 50000) {
              const event: OnChainEvent = {
                type: 'whale_transfer',
                data: { amount, token: 'USDC', from: (result.topics as string[])[1], to: (result.topics as string[])[2] },
                timestamp: Date.now(),
              }
              this.emit('onchain', event)
            }
          }
        }
      } catch {}
    })

    this.alchemyWs.on('close', () => {
      if (this.running) {
        console.log('[Alchemy] Disconnected, reconnecting...')
        setTimeout(() => this.connectAlchemy(), RECONNECT_DELAY)
      }
    })

    this.alchemyWs.on('error', () => {})
  }

  private connectPyth(): void {
    this.pythController = new AbortController()
    const ids = Object.values(PYTH_FEED_IDS).map(id => `ids[]=${id}`).join('&')
    const url = `${PYTH_SSE_URL}?${ids}`

    fetch(url, { signal: this.pythController.signal })
      .then(async (res) => {
        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6)) as { parsed?: Array<{ id: string; price: { price: string; expo: number; publish_time: number } }> }
              if (!data.parsed) continue

              for (const item of data.parsed) {
                const priceVal = parseInt(item.price.price) * Math.pow(10, item.price.expo)
                const symbol = item.id === PYTH_FEED_IDS.BTC ? 'BTC' : item.id === PYTH_FEED_IDS.ETH ? 'ETH' : item.id

                const price: PriceUpdate = {
                  symbol: `${symbol}/USD`,
                  price: priceVal,
                  timestamp: item.price.publish_time * 1000,
                  source: 'pyth',
                }
                this.latestPrices.set(`PYTH_${symbol}`, price)
                this.emit('price', price)
              }
            } catch {}
          }
        }
      })
      .catch(() => {
        if (this.running) {
          console.log('[Pyth] Disconnected, reconnecting...')
          setTimeout(() => this.connectPyth(), RECONNECT_DELAY)
        }
      })

    console.log('[Pyth] SSE connecting...')
  }

  private startFearGreedPoller(): void {
    const poll = async () => {
      try {
        const res = await fetch(FEAR_GREED_URL, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) return
        const json = await res.json() as { data?: Array<{ value: string; value_classification: string; timestamp: string }> }
        const entry = json.data?.[0]
        if (!entry) return

        const update: FearGreedUpdate = {
          value: parseInt(entry.value),
          classification: entry.value_classification,
          timestamp: parseInt(entry.timestamp) * 1000,
        }
        this.latestFearGreed = update
        this.emit('fear_greed', update)
      } catch {}
    }

    poll()
    this.fearGreedInterval = setInterval(poll, FEAR_GREED_POLL_MS)
  }
}

export const realtimeFeeds = new RealtimeFeeds()
