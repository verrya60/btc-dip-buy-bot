// BTC dip-buy swing bot: buys pullbacks inside an uptrend, sells on take-profit or a trail.
//   - Gate: only trade while close > EMA(120) (2-hour uptrend). Below it, sit in cash.
//   - Entry: close dipped >= 20bp under its 10-bar high AND close > previous close (bounce starting).
//   - Exit: take-profit +120bp over entry value, trailing stop 50bp under the peak since entry,
//     or close < EMA(120) for 2 consecutive closes (trend broken).
//   - Position: HALF equity (reduces price impact), one position, sells first then buys, max slippage 100 bps.
//   - Deterministic: float64 EMAs on + - * / alone, no clock, no randomness, no network.
import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SLOW = 120;
const DIP_BPS = 20;
const LOOKBACK = 10;
const TAKE_BPS = 120;
const TRAIL_BPS = 50;
const SIZE_NUM = 1n;
const SIZE_DEN = 2n;
const MAX_SLIPPAGE_BPS = 100;

interface Ema { span: number; warm: number[]; value: number | null; }

const slow: Ema = { span: SLOW, warm: [], value: null };
const closes: number[] = [];

function step(e: Ema, close: number): void {
  if (e.value !== null) { e.value += (2 / (e.span + 1)) * (close - e.value); return; }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

let peak = 0;
let belowCount = 0;

await runBars({
  onBatch(state, batch) {
    let entry = false;
    let exitNow = false;
    for (const bar of batch.bars) {
      const c = Number(bar.c);
      step(slow, c);
      closes.push(c);
      if (closes.length > LOOKBACK + 1) closes.shift();
      if (bar.v === '0') continue;
      if (slow.value === null || closes.length < LOOKBACK + 1) continue;
      const symbol = bar.symbol;
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        peak = Math.max(peak, c);
        const value = state.value(symbol, held.qty);
        const tpHit = value * 10000n >= held.cost * BigInt(10000 + TAKE_BPS);
        const trailHit = c < peak * (1 - TRAIL_BPS / 10000);
        if (c < slow.value) belowCount++; else belowCount = 0;
        const trendBroken = belowCount >= 2;
        if (trailHit || tpHit || trendBroken) exitNow = true;
      } else {
        const hi = Math.max(...closes.slice(0, LOOKBACK + 1));
        const dipped = ((hi - c) / hi) * 10000 >= DIP_BPS;
        const bouncing = closes.length >= 2 && c > closes[closes.length - 2];
        if (c > slow.value && dipped && bouncing) entry = true;
      }
    }
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const orders: (SellInput | BuyInput)[] = [];
    for (const { symbol } of state.hello.symbols) {
      const held = state.positions.get(symbol);
      if (held !== undefined && exitNow) {
        orders.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        peak = 0;
        belowCount = 0;
      }
    }
    if (entry && orders.length < caps.max_orders_per_bar) {
      const slots = Math.min(state.hello.symbols.length, caps.max_open_positions);
      const stake = (state.equity * SIZE_NUM) / (BigInt(slots) * SIZE_DEN);
      const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
      let slice = stake < byWeight ? stake : byWeight;
      if (state.cash < slice) slice = state.cash;
      if (slice !== 0n && slice >= BigInt(fees.min_notional_quote_units)) {
        const symbol = state.hello.symbols[0].symbol;
        orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }
    return orders.slice(0, caps.max_orders_per_bar);
  },
});
