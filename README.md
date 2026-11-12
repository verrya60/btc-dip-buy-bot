# BTC Dip-Buy Bot

A trading bot for the make.fun bounty **"Race a BTC trading bot live for 24 hours"**
(`btc-race-24h-20261112-1439`). It trades cbBTC/USDC on an Orca Whirlpool pool
via the `bars-replay/v1` harness.

## The edge

The replay charges **price impact against the Orca pool depth**. A $1,000 order
pays ~7.7 bps of impact, a $500 order only ~3.8 bps. So this bot trades
**half its equity** per position: the smaller size flips the strategy from
losing to winning on the dev window.

## Strategy

- **Gate:** only trade while the close is above EMA(120) (2-hour uptrend).
  Below it, sit in cash.
- **Entry:** the close dipped at least 20 bp under its 10-bar high AND the
  close is above the previous close (a bounce is starting).
- **Exit:** take-profit +120 bp over the entry value, a trailing stop 50 bp
  under the peak since entry, or the close below EMA(120) for 2 consecutive
  closes (trend broken).
- **Position:** half of equity, one position at a time, sells first then buys,
  max slippage 100 bps.
- **Deterministic:** float64 EMAs using only `+ - * /`, no clock, no
  randomness, no network.

## Dev result (grade-local, process driver)

- **Net PnL: +0.321165 USDC** (2 trades, 100% win rate, max drawdown 0.24%,
  fees 0.40 USDC)
- Full size (100% equity) on the same entry/exit rules: **-0.059 USDC** —
  the half-size is what makes it positive.

## Files

- `main.ts` — the bot (TypeScript, runs under Node 22).
- `vendor/makefun-bars.ts` — the vendored make.fun bars SDK (from the
  official starter kit).

## License

MIT. See `LICENSE`.
