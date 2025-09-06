# Defy-labs/precise-money
![npm](https://img.shields.io/npm/v/precise-money)
![license](https://img.shields.io/badge/license-MIT-green)

Cross‑chain **decimal & units** primitives built on **BigInt**. Safely convert between 2/6/7/9/18 decimals, apply slippage, format values without floating point, and normalize assets via a tiny registry. Thin chain adapters included.

> **Design goals:** correctness first, chain‑neutral, minimal dependencies, pure integer math.

---

## Features

* **Pure BigInt** math (no floats), deterministic & auditable
* **Scale conversions** between arbitrary decimals (e.g., 2 ↔ 7 ↔ 18)
* **Rounding modes**: `floor` | `ceil` | `round` | `bankers`
* **Slippage** helpers in **basis points** (BPS)
* **Price math** as rational numbers `{num, den}` (no FP rounding)
* **Symbol‑aware helpers** (optional layer) that read decimals from a registry
* **Adapters**: Stellar / EVM / Solana / Cosmos (SDK‑free formatting)

---

## Install

```bash
pnpm add precise-money
# or
npm i precise-money

npm i precise-money
```

```ts
import { toMinor, fromMinor } from 'precise-money';
import { evmEnsureDecimals } from 'precise-money/adapters/evm';

console.log(fromMinor(123n, 2)); // "1.23"
```

TypeScript: target ES2020 or newer.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2020"],
    "skipLibCheck": true
  }
}
```

---

## Quick Start

```ts
import { scaleUnits, toMinor, fromMinor, applySlippage } from '@defy-labs/precise-money'

// 2 → 7 decimals (e.g., fiat cents → on‑chain token with 7)
const cents = 12_500n;               // 125.00
const onchain = scaleUnits(cents, 2, 7); // 12_500 * 10^(5)

// safe parse/format
const minor = toMinor('1.23', 2);    // 123n
const human = fromMinor(6340065n, 7);// "0.6340065"

// slippage guard (minOut), 50 bps = 0.50%
const minOut = applySlippage(1_234_567n, 50); // 1_228_394n
```

> All values that can move on‑chain should be **BigInt**. Only convert to string/number at the boundaries (UI/logs).

---

## API Reference — Core (`src/core.ts`)

**Pure utilities** — no chain SDKs and no environment/registry access.

### Types

```ts
export type Rounding = 'floor' | 'ceil' | 'round' | 'bankers'
```

### `scaleUnits(u, fromDec, toDec, opts?)`

**Converts** an integer `u` between decimal precisions.

```ts
scaleUnits(12500n, 2, 7)        // → 1250000000n
scaleUnits(1250000000n, 7, 2)   // → 12500n (floor by default)
```

* **Parameters**: `u: bigint`, `fromDec: number`, `toDec: number`, `opts?: { mode?: Rounding }`
* **Rounding**: Only relevant when down‑scaling. Default: `floor`.

---

### `normalizeAmountInput(x)`

Parses **human input** into `{ sign, int, frac }` without floating point, accepting `"1.234,56"`, `"1_234.56"`, `"-12.3"`, etc. Last `.`/`,` is treated as the decimal separator.

```ts
normalizeAmountInput('1.234,56') // → { sign: 1n, int: '1234', frac: '56' }
```

---

### `toMinor(human, decimals, opts?)`

Converts a human number string/number into **minor units** (`bigint`).

```ts
toMinor('1.23', 2)         // → 123n
toMinor('0.6340065', 7)   // → 6340065n
```

* **Rounding**: default `round` (half‑up behavior). Use `floor/ceil/bankers` if you need an explicit policy.

---

### `fromMinor(minor, decimals)`

Formats **minor units** (`bigint`) into a fixed‑precision string.

```ts
fromMinor(123n, 2)        // → "1.23"
fromMinor(6340065n, 7)    // → "0.6340065"
```

---

### `mulDiv(a, b, c, mode?)`

Computes `(a * b) / c` with **integer rounding**.

```ts
mulDiv(1000n, 3, 2, 'ceil') // → 1500n
```

---

### `applyBps(units, bps, mode?)`

Applies a **BPS** factor to a `bigint` amount.

```ts
applyBps(1_000_000n, 50) // → 5_000n (0.50% of amount)
```

---

### `clampBps(bps)`

Clamps BPS to `[0, 10000]`.

```ts
clampBps(12345) // → 10000
```

---

### `slippageDown(amountMinor, bps)`

For **EXACT\_IN**: compute **minOut** by applying downward slippage.

```ts
slippageDown(1_000_000n, 50) // → 995_000n
```

---

### `slippageUp(amountMinor, bps)`

For **EXACT\_OUT**: compute **maxIn** using ceil division.

```ts
slippageUp(1_000_000n, 50) // → 1_005_000n (ceil)
```

---

### `applySlippage(amountOutMinor, slippageBps)` / `minOutForExactIn(...)`

Convenience minOut for a target output.

```ts
applySlippage(1_000_000n, 50) // → 995_000n
```

---

### `priceRatioDecimals(quoteDecimals, priceStr)`

Builds a **rational price** from a human string, scaled to `quoteDecimals`. Interprets price as **QUOTE per 1 BASE**.

```ts
priceRatioDecimals(2, '157.72') // → { num: 15772n, den: 100n }
```

---

### `convertUnitsByDecimals(amountUnits, fromDec, toDec, price, mode?)`

Converts units using a **price ratio** and explicit decimals:

```
amount_from * (num/den) * 10^(toDec - fromDec)
```

```ts
const price = priceRatioDecimals(2, '157.72');
convertUnitsByDecimals(6_340_065n, 7, 2, price) // → fiat minor given OUT minor
```

---

### `divToDecimalString(numer, denom, scale?)`

Integer division → **decimal string** with `scale` fractional digits (default 8).

```ts
divToDecimalString(123n, 10n, 4) // → "12.3000"
```

---

### `splitAmount(totalMinor, lotSizeMinor)`

Splits a total amount into fixed‑size lots (last may be remainder).

```ts
splitAmount(10n, 3n) // → [3n, 3n, 3n, 1n]
```

---

## Symbol‑Aware Helpers (`src/symbolic.ts`)

Ergonomic wrappers around **core** that resolve decimals from a registry (see below). Useful when you work with **symbols/asset IDs** instead of raw `decimals`.

### Types & Defaults

```ts
export type RoundingModeCompat = 'trunc' | 'half_up' | 'floor' | 'ceil'
export const ASSET_DECIMALS = { USD: 2, BRL: 2, USDC: 6, BTC: 8, ETH: 18 } as const
```

### `assetKey(codeOrKey, issuer?)`

Canonicalizes an asset key: `"USDC"` or `"USDC:G...ISSUER"` → uppercase composite.

### `getDecimals(symbolOrKey)`

Looks up decimals by priority: `DEC` registry → environment override (e.g., `STELLAR_DECIMALS_USDC`) → business defaults → fallback `7`.

### `toUnits(symbolOrKey, amount, mode?)` / `fromUnits(symbolOrKey, units)`

Symbol‑aware variants of `toMinor`/`fromMinor`.

```ts
toUnits('USDC', '1.23')  // → 1230000n (6)
fromUnits('USDC', 1230000n) // → "1.23"
```

### `formatUnits(symbolOrKey, units, locale?, minFrac?, maxFrac?)`

Locale formatting with a fallback for very large integers.

### `priceRatio(quoteSymbolOrKey, baseSymbolOrKey, priceStr)`

Builds a price scaled to **quote** decimals by reading them via `getDecimals`.

### `convertUnits(amountUnits, fromSymbolOrKey, toSymbolOrKey, price, mode?)`

Converts using symbol‑aware decimals.

### `avgFiatPricePerUnit({ filledQtyMinor, spentFiatMinor, outDecimals, fiatDecimals?, currency?, scale? })`

Average **FIAT per OUT unit** as a string. Pass `fiatDecimals` explicitly or a `currency` code (e.g., `"USD"`) that your app resolves via `DEC`.

> Back‑compat alias: `avgPriceBRL({ filledQtyMinor, spentCentavos, outDecimals, scale })`.

### Compatibility aliases

`toMinorSymbol`, `fromMinorSymbol`, `clampBpsCompat`, `slippageDownCompat`, `slippageUpCompat`.

---

## Decimals Registry (`src/registry.ts`)

A minimal runtime registry so your app can **declare/override** decimals per asset.

```ts
type Chain = 'stellar' | 'evm' | 'solana' | 'cosmos'
export type AssetId = { chain: Chain; symbol: string; address?: string; issuer?: string; chainId?: number }

DEC.set('USD', 2)
DEC.set('USDC', 6)
DEC.setById({ chain: 'stellar', symbol: 'USDC', issuer: 'GABC...' }, 7)
```

---

## Chain Adapters (`src/adapters/*`)

SDK‑free formatters that simply call `toMinor`/`fromMinor` with known decimals.

* **Stellar**: `stellarToMinor(human, decimals=7)`, `stellarFromMinor(minor, decimals=7)`
* **EVM**: `evmToMinor(human, decimals)`, `evmFromMinor(minor, decimals)`
* **Solana**: `solanaToMinor(human, decimals)`, `solanaFromMinor(minor, decimals)`
* **Cosmos**: `cosmosToMinor(human, decimals)`, `cosmosFromMinor(minor, decimals)`

> You may add richer adapters in your app (e.g., fetch `decimals()` from ERC‑20 or `mint.decimals` from Solana) and feed the values into the registry.

---

## Recipes

### EXACT\_IN swap guard (symbol‑aware)

```ts
import { toUnits, applySlippage, priceRatio, convertUnits } from '@defy-labs/precise-money'

const amountIn = toUnits('USDC', '250.00') // 250 * 1e6
const px = priceRatio('USD', 'TOKEN', '1.57') // USD per TOKEN
const expectedOut = convertUnits(amountIn, 'USD', 'TOKEN', px)
const minOut = applySlippage(expectedOut, 50) // -0.5%
```

### Chunking a large order

```ts
import { splitAmount } from '@defy-labs/precise-money'

splitAmount(10_000_000n, 3_000_000n) // → [3_000_000n, 3_000_000n, 3_000_000n, 1_000_000n]
```

---

## Testing

Minimal smoke tests are included with **vitest**. Add round‑trip invariants and real‑flow fixtures (e.g., PSP → DEX settlement) in your app.

```bash
pnpm test
```

---

## Safety Notes

* Keep all internal amounts as **BigInt**.
* Be explicit with **rounding** when scaling down or dividing.
* Do not add prices — add **amounts/values** and derive price at the end.
* Centralize **decimals** in one place (registry + overrides) per environment.

---

## License

MIT © defy‑labs
