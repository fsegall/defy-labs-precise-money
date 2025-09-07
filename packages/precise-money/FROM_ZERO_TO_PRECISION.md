# Precise Money — From Zero to Precision (EN)

# End‑to‑End Tutorial for Developers

> **Goal**: teach, from scratch, how to handle money/asset quantities with **precision** in JS/TS and how to use the `precise-money` lib safely across **blockchains** (EVM/Solana/Stellar/Cosmos) and **PSPs** (fiat). No floats, no regrets.

---

## 0) Why money is hard in code

* JS `number` is an **IEEE‑754 float** → `0.1 + 0.2 !== 0.3`. Using floats for money silently loses cents.
* Each asset has different **decimals** (USDC=6, ETH=18, SOL=9, XLM=7…).
* UIs/PSPs speak **human units** (e.g., "10.50"); ledgers/contracts need **minor units** (integers).
* Rounding policies (*floor/ceil/half‑up/bankers*) affect balances and risk.

**Golden rule:** store/process amounts as **integers** (`bigint`) in **minor units**. Convert to strings only at the edges (UI/JSON/logs).

---

## 0.5) Essential Glossary (plain language)

**PSP (Payment Service Provider)** — Stripe, Adyen, Mercado Pago, etc. They authorize/capture/settle payments in **fiat** and typically use **2 decimals**. Payloads come as strings like "10.50" or as integers in minor units (e.g., `"1050"` cents).

**Minor unit** — smallest integer unit of an asset: cents (fiat, 2), **wei** (ETH, 18), **lamport** (SOL, 9), **stroop** (XLM, 7).

**Decimals** — number of fractional digits an asset uses (USDC=6, ETH=18, SOL=9, XLM=7…). Converting human ↔ minor requires the correct decimals.

**`1230000n`** — **BigInt** literal in JS; the `n` means an arbitrary‑precision integer. The human value depends on the asset’s decimals:

```ts
fromMinor(1230000n, 6)  // "1.230000"   (USDC)
fromMinor(1230000n, 9)  // "0.001230000" (SOL)
fromMinor(1230000n, 18) // "0.000000000001230000" (ETH)
```

In JSON, serialize BigInt as **string** (e.g., "1230000").

**BPS (basis points)** — 100 bps = **1%** (25 bps = 0.25%). Useful for slippage and fees.

**Slippage** — tolerance to price/execution variation.

* **EXACT\_IN**: you fix `amountIn` and protect the **minimum** output you accept → send `minOut`.
* **EXACT\_OUT**: you fix `amountOut` and protect the **maximum** input you accept → send `maxIn`.

> Not “buy” vs “sell”; EXACT\_IN/OUT only answers **which side is fixed**.

---

## 0.6) Units by chain (examples)

| Environment        | Minor unit (name) | Decimals | Human example            | Minor units (`bigint`) |
| ------------------ | ----------------- | -------- | ------------------------ | ---------------------- |
| **Ethereum (ETH)** | wei               | 18       | 0.000000000000000001 ETH | `1n`                   |
| **ERC‑20 USDC**    | —                 | 6        | 1.23 USDC                | `1230000n`             |
| **Solana (SOL)**   | lamport           | 9        | 0.5 SOL                  | `500000000n`           |
| **Stellar (XLM)**  | stroop            | 7        | 1 XLM                    | `10000000n`            |
| **Cosmos (ATOM)**  | uatom             | 6        | 2.5 ATOM                 | `2500000n`             |
| **Fiat (BRL)**     | centavo           | 2        | R\$ 10.50                | `1050n`                |

> ERC‑20/SPL token decimals vary. In production, **discover** actual decimals from the contract/mint.

### Quick examples

```ts
// USDC (6):
toMinor('1.23', 6)        // 1230000n
fromMinor(1230000n, 6)    // "1.230000"

// SOL (9):
toMinor('0.5', 9)         // 500000000n

// ETH (18):
toMinor('0.000000000000000001', 18) // 1n
```

---

## 1) BigInt 101 (JS/TS)

* Literal: `123n` (suffix **n**).
* Operators: `+ - * / %` between `bigint`s only. Don’t mix with `number` (convert first).
* JSON: `bigint` isn’t serializable. Convert to string at the edge (e.g., Express replacer below).

```ts
app.set('json replacer', (_k, v) => typeof v === 'bigint' ? v.toString() : v);
```

---

## 2) Human ↔ Minor conversions

* **Human units**: strings like "10.50" (fiat 2), "1.234567" (USDC 6).
* **Minor units**: integers scaled by `10^decimals`.

Use the lib helpers:

```ts
import { toMinor, fromMinor } from 'precise-money';

const cents = toMinor('10.50', 2);   // 1050n
const shown = fromMinor(cents, 2);   // "10.50"
```

`toMinor` accepts common formats and normalizes (last `.` or `,` is the decimal separator; thousands removed):

```ts
toMinor('1.234,567', 6)  // 1234567n
toMinor('1_234.56', 2)   // 123456n
toMinor('-0.01', 2)      // -1n
```

**Rounding** when input has more fractional digits than `decimals`:

```ts
toMinor('1.2345678', 6, { mode: 'floor' }) // 1234567n
toMinor('1.2345678', 6, { mode: 'ceil'  }) // 1234568n
// default 'round' (half‑up); also supports 'bankers'
```

---

## 3) Getting started with `precise-money`

```bash
npm i precise-money
```

**Core APIs**

* `toMinor(human, decimals, opts?) : bigint`
* `fromMinor(minor, decimals) : string`
* `scaleUnits(u, fromDec, toDec, { mode? }) : bigint`
* `priceRatioDecimals(quoteDecimals, priceStr) : { num, den }`
* `convertUnitsByDecimals(amount, fromDec, toDec, price, mode?) : bigint`
* `applyBps(units, bps, mode?) : bigint`
* `slippageDown(units, bps) : bigint` / `slippageUp(units, bps) : bigint`
* `mulDiv(a, b, c, mode?) : bigint`
* `divToDecimalString(numer, denom, scale?) : string`

**Rounding modes**: `'floor' | 'ceil' | 'round' | 'bankers'` (default `'round'`).

**Adapters** (thin wrappers; you still must know the correct decimals):

* `adapters/evm` (ERC‑20 `decimals()`)
* `adapters/solana` (default 9; many SPLs are 6/9)
* `adapters/stellar` (default 7)
* `adapters/cosmos` (often 6)

---

## 4) App‑side registry shim (ergonomics by symbol)

Create a tiny shim so your domain code can use **symbols** instead of raw decimal counts:

```ts
// src/money.ts
import { toMinor as _toMinor, fromMinor as _fromMinor,
         priceRatioDecimals, convertUnitsByDecimals } from 'precise-money';

const DEC: Record<string, number> = { USD: 2, BRL: 2, USDC: 6, ETH: 18, XLM: 7, TOKEN: 7 };
const need = (sym: string) => DEC[sym.toUpperCase()] ?? (()=>{throw new Error(`Missing decimals for symbol: ${sym}`)})()

export const toUnits = (sym: string, amt: string|number, opts?: { mode?: 'floor'|'ceil'|'round'|'bankers' }) => _toMinor(amt, need(sym), opts);
export const fromUnits = (sym: string, minor: bigint|string|number) => _fromMinor(typeof minor==='bigint'? minor: BigInt(String(minor)), need(sym));
export const buildPriceRatio = (quote: string, _base: string, price: string) => priceRatioDecimals(need(quote), price);
export const convertUnits = (amount: bigint, from: string, to: string, pr: {num: bigint; den: bigint}) =>
  convertUnitsByDecimals(amount, need(from), need(to), pr);
```

Usage:

```ts
const usd = toUnits('USD', '10.50');
const pr  = buildPriceRatio('USD', 'TOKEN', '5.25');
const out = convertUnits(usd, 'USD', 'TOKEN', pr);
```

---

## 5) Quotes, slippage & BPS (DEX mental model)

* **BPS**: 100 bps = 1%; 25 bps = 0.25%.
* **EXACT\_IN** (fix input): compute `expectedOut`, then `minOut = slippageDown(expectedOut, bps)`.
* **EXACT\_OUT** (fix output): compute `targetOut`, then `maxIn = slippageUp(targetOut, bps)`.

**Cheat sheet (human intent → mode/guard)**

| Intent                                                        | Mode       | Guard you send |
| ------------------------------------------------------------- | ---------- | -------------- |
| “Spend **exactly** 100 USDC; receive whatever SOL comes out.” | EXACT\_IN  | `minOut`       |
| “Receive **exactly** 1 SOL; don’t pay more than Z USDC.”      | EXACT\_OUT | `maxIn`        |
| “Sell **exactly** 5 TOKEN for USDC.”                          | EXACT\_IN  | `minOut`       |
| “I must receive **exactly** 100 USDC selling TOKEN.”          | EXACT\_OUT | `maxIn`        |

> **Buy/sell** is just perspective (which asset is From/To). The *mode* only states what’s fixed.

### Practical examples

**EXACT\_IN (fix input, protect output)**

```ts
import { toMinor, convertUnitsByDecimals, priceRatioDecimals, slippageDown } from 'precise-money';

const inDec = 2;   // USD
const outDec = 7;  // TOKEN
const price = priceRatioDecimals(inDec, '5.43'); // USD per 1 TOKEN

const amountIn = toMinor('100.00', inDec);            // 10000n
const expectedOut = convertUnitsByDecimals(amountIn, inDec, outDec, price);
const minOut = slippageDown(expectedOut, 50);         // 0.5% tolerance
```

**EXACT\_OUT (fix output, protect input)**

```ts
import { toMinor, slippageUp } from 'precise-money';

const outDec = 7;  // TOKEN
const targetOut = toMinor('1.0000000', outDec); // 1 TOKEN
const maxIn = slippageUp(targetOut, 75);        // 0.75% tolerance
```

**Fees and ratios**

```ts
import { applyBps, mulDiv } from 'precise-money';

const fee = applyBps(toMinor('100', 2), 25); // 25 bps of 100.00 → 0.25 → 25n
const part = mulDiv(10_000n, 3, 7, 'round'); // (10000*3)/7 with rounding
```

**Pitfalls**

* Slippage does **not** cover network fees (gas). Budget them separately.
* Always use correct decimals per asset when forming `minOut`/`maxIn`.
* Too‑tight slippage in illiquid pools → frequent reverts.

---

## 6) PSP / fiat integration

* Fiat is usually **2 decimals** (USD/EUR/BRL); confirm per PSP.
* Webhooks sending "10.505"? Decide a rounding rule and **document it**.

```ts
const cents = toMinor('10.50', 2);  // 1050n
const shown = fromMinor(cents, 2);  // "10.50"
```

---

## 7) Persistence & APIs

**Postgres**

* Amounts: prefer `BIGINT` (hot paths). If you must use `NUMERIC`, treat as **string** in Node.

**node‑pg parsers**

```ts
import pg from 'pg';
pg.types.setTypeParser(20, (v) => BigInt(v));   // BIGINT → BigInt
pg.types.setTypeParser(1700, (v) => String(v)); // NUMERIC → string
```

**JSON**

* Money as strings; `bigint` doesn’t serialize.

---

## 8) Blockchain adapters (where decimals come from)

* **EVM (ERC‑20)**: read `decimals()` from the token contract.
* **Solana**: SOL=9; many SPL mints are 6 or 9 (`mint.decimals`).
* **Stellar (classic)**: default 7 (verify per asset/issuer).
* **Cosmos**: many denoms are 6; confirm per chain.

**Recommended flow**: UI/PSP → `toMinor(human, decimals)` → DB (BIGINT) → wallet/ledger. Convert to on‑chain scale **at the boundary only**.

---

## 9) Copy‑paste recipes

**A) Quote EXACT\_IN (USD→TOKEN)**

```ts
const inHuman  = '100.00';
const inDec    = 2;              // USD
const outDec   = 7;              // TOKEN
const price    = priceRatioDecimals(inDec, '5.43'); // USD per 1 TOKEN
const inMinor  = toMinor(inHuman, inDec);
const expOut   = convertUnitsByDecimals(inMinor, inDec, outDec, price);
const minOut   = slippageDown(expOut, 50); // 0.5%
```

**B) Quote EXACT\_OUT (max you’ll pay)**

```ts
const wantOut  = toMinor('1.0000000', 7);  // 1 TOKEN
const maxIn    = slippageUp(wantOut, 75);  // 0.75%
```

**C) Fee in BPS**

```ts
const gross = toMinor('250', 2);  // $250.00
const fee   = applyBps(gross, 180); // 1.80%
const net   = gross - fee;
```

**D) Average fiat price per unit**

```ts
import { divToDecimalString } from 'precise-money';
function avgFiatPricePerUnit({ filledQtyMinor, spentFiatMinor, outDecimals, fiatDecimals }:{ filledQtyMinor: bigint; spentFiatMinor: bigint; outDecimals: number; fiatDecimals: number; }){
  const scale = 10n ** BigInt(fiatDecimals + outDecimals);
  const num = spentFiatMinor * scale;
  const den = filledQtyMinor === 0n ? 1n : filledQtyMinor;
  return divToDecimalString(num, den, fiatDecimals + outDecimals);
}
```

---

## 10) Minimal tests (Vitest)

```ts
import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, convertUnitsByDecimals, priceRatioDecimals } from 'precise-money';

describe('money', () => {
  it('round trip', () => {
    const m = toMinor('1.234567', 6);
    expect(fromMinor(m, 6)).toBe('1.234567');
  });
  it('convert USD→TOKEN', () => {
    const pr = priceRatioDecimals(2, '5.25');
    const usd = toMinor('10.50', 2);
    const out = convertUnitsByDecimals(usd, 2, 7, pr);
    expect(out > 0n).toBe(true);
  });
});
```

---

## 11) Production checklist

* [ ] Decide decimals per asset (read from chain where applicable).
* [ ] Convert human ↔ minor only via helpers; keep amounts as `bigint` internally.
* [ ] Document rounding per flow (user input, fees, swaps) and use explicit modes.
* [ ] DB BIGINT parsers set; JSON replacer for `bigint`.
* [ ] Slippage guardrails wired for EXACT\_IN/OUT.

---

## 12) FAQ

**Can I use `decimal.js`/`bignumber.js`?**  UI/formatting: yes. Ledger/contracts/PSP: prefer `bigint` (no floating point).

**How do I represent prices?**  `priceRatioDecimals(quoteDecimals, priceStr)` → `{num, den}`. Convert amounts with `convertUnitsByDecimals`.

**Can I mix `number` and `bigint`?**  No. Convert `number` to `BigInt` first (watch `number` limits).

**Which rounding should I use?**  Default `'round'` (half‑up). For *maxIn* use `ceil`; for *minOut* use `floor` or slippage.

---

> **Disclaimer**: technical content only, not financial advice. Test on staging/testnets. Decimal/rounding mistakes can cause losses. Version your rounding rules.

Happy building! 🚀

# Precise Money — From Zero to Precision (EN)

# End‑to‑End Tutorial for Developers

> **Goal**: teach, from scratch, how to handle money/asset quantities with **precision** in JS/TS and how to use the `precise-money` lib safely across **blockchains** (EVM/Solana/Stellar/Cosmos) and **PSPs** (fiat). No floats, no regrets.

---

## 0) Why money is hard in code

* JS `number` is an **IEEE‑754 float** → `0.1 + 0.2 !== 0.3`. Using floats for money silently loses cents.
* Each asset has different **decimals** (USDC=6, ETH=18, SOL=9, XLM=7…).
* UIs/PSPs speak **human units** (e.g., "10.50"); ledgers/contracts need **minor units** (integers).
* Rounding policies (*floor/ceil/half‑up/bankers*) affect balances and risk.

**Golden rule:** store/process amounts as **integers** (`bigint`) in **minor units**. Convert to strings only at the edges (UI/JSON/logs).

---

## 0.5) Essential Glossary (plain language)

**PSP (Payment Service Provider)** — Stripe, Adyen, Mercado Pago, etc. They authorize/capture/settle payments in **fiat** and typically use **2 decimals**. Payloads come as strings like "10.50" or as integers in minor units (e.g., `"1050"` cents).

**Minor unit** — smallest integer unit of an asset: cents (fiat, 2), **wei** (ETH, 18), **lamport** (SOL, 9), **stroop** (XLM, 7).

**Decimals** — number of fractional digits an asset uses (USDC=6, ETH=18, SOL=9, XLM=7…). Converting human ↔ minor requires the correct decimals.

**`1230000n`** — **BigInt** literal in JS; the `n` means an arbitrary‑precision integer. The human value depends on the asset’s decimals:

```ts
fromMinor(1230000n, 6)  // "1.230000"   (USDC)
fromMinor(1230000n, 9)  // "0.001230000" (SOL)
fromMinor(1230000n, 18) // "0.000000000001230000" (ETH)
```

In JSON, serialize BigInt as **string** (e.g., "1230000").

**BPS (basis points)** — 100 bps = **1%** (25 bps = 0.25%). Useful for slippage and fees.

**Slippage** — tolerance to price/execution variation.

* **EXACT\_IN**: you fix `amountIn` and protect the **minimum** output you accept → send `minOut`.
* **EXACT\_OUT**: you fix `amountOut` and protect the **maximum** input you accept → send `maxIn`.

> Not “buy” vs “sell”; EXACT\_IN/OUT only answers **which side is fixed**.

---

## 0.6) Units by chain (examples)

| Environment        | Minor unit (name) | Decimals | Human example            | Minor units (`bigint`) |
| ------------------ | ----------------- | -------- | ------------------------ | ---------------------- |
| **Ethereum (ETH)** | wei               | 18       | 0.000000000000000001 ETH | `1n`                   |
| **ERC‑20 USDC**    | —                 | 6        | 1.23 USDC                | `1230000n`             |
| **Solana (SOL)**   | lamport           | 9        | 0.5 SOL                  | `500000000n`           |
| **Stellar (XLM)**  | stroop            | 7        | 1 XLM                    | `10000000n`            |
| **Cosmos (ATOM)**  | uatom             | 6        | 2.5 ATOM                 | `2500000n`             |
| **Fiat (BRL)**     | centavo           | 2        | R\$ 10.50                | `1050n`                |

> ERC‑20/SPL token decimals vary. In production, **discover** actual decimals from the contract/mint.

### Quick examples

```ts
// USDC (6):
toMinor('1.23', 6)        // 1230000n
fromMinor(1230000n, 6)    // "1.230000"

// SOL (9):
toMinor('0.5', 9)         // 500000000n

// ETH (18):
toMinor('0.000000000000000001', 18) // 1n
```

---

## 1) BigInt 101 (JS/TS)

* Literal: `123n` (suffix **n**).
* Operators: `+ - * / %` between `bigint`s only. Don’t mix with `number` (convert first).
* JSON: `bigint` isn’t serializable. Convert to string at the edge (e.g., Express replacer below).

```ts
app.set('json replacer', (_k, v) => typeof v === 'bigint' ? v.toString() : v);
```

---

## 2) Human ↔ Minor conversions

* **Human units**: strings like "10.50" (fiat 2), "1.234567" (USDC 6).
* **Minor units**: integers scaled by `10^decimals`.

Use the lib helpers:

```ts
import { toMinor, fromMinor } from 'precise-money';

const cents = toMinor('10.50', 2);   // 1050n
const shown = fromMinor(cents, 2);   // "10.50"
```

`toMinor` accepts common formats and normalizes (last `.` or `,` is the decimal separator; thousands removed):

```ts
toMinor('1.234,567', 6)  // 1234567n
toMinor('1_234.56', 2)   // 123456n
toMinor('-0.01', 2)      // -1n
```

**Rounding** when input has more fractional digits than `decimals`:

```ts
toMinor('1.2345678', 6, { mode: 'floor' }) // 1234567n
toMinor('1.2345678', 6, { mode: 'ceil'  }) // 1234568n
// default 'round' (half‑up); also supports 'bankers'
```

---

## 3) Getting started with `precise-money`

```bash
npm i precise-money
```

**Core APIs**

* `toMinor(human, decimals, opts?) : bigint`
* `fromMinor(minor, decimals) : string`
* `scaleUnits(u, fromDec, toDec, { mode? }) : bigint`
* `priceRatioDecimals(quoteDecimals, priceStr) : { num, den }`
* `convertUnitsByDecimals(amount, fromDec, toDec, price, mode?) : bigint`
* `applyBps(units, bps, mode?) : bigint`
* `slippageDown(units, bps) : bigint` / `slippageUp(units, bps) : bigint`
* `mulDiv(a, b, c, mode?) : bigint`
* `divToDecimalString(numer, denom, scale?) : string`

**Rounding modes**: `'floor' | 'ceil' | 'round' | 'bankers'` (default `'round'`).

**Adapters** (thin wrappers; you still must know the correct decimals):

* `adapters/evm` (ERC‑20 `decimals()`)
* `adapters/solana` (default 9; many SPLs are 6/9)
* `adapters/stellar` (default 7)
* `adapters/cosmos` (often 6)

---

## 4) App‑side registry shim (ergonomics by symbol)

Create a tiny shim so your domain code can use **symbols** instead of raw decimal counts:

```ts
// src/money.ts
import { toMinor as _toMinor, fromMinor as _fromMinor,
         priceRatioDecimals, convertUnitsByDecimals } from 'precise-money';

const DEC: Record<string, number> = { USD: 2, BRL: 2, USDC: 6, ETH: 18, XLM: 7, TOKEN: 7 };
const need = (sym: string) => DEC[sym.toUpperCase()] ?? (()=>{throw new Error(`Missing decimals for symbol: ${sym}`)})()

export const toUnits = (sym: string, amt: string|number, opts?: { mode?: 'floor'|'ceil'|'round'|'bankers' }) => _toMinor(amt, need(sym), opts);
export const fromUnits = (sym: string, minor: bigint|string|number) => _fromMinor(typeof minor==='bigint'? minor: BigInt(String(minor)), need(sym));
export const buildPriceRatio = (quote: string, _base: string, price: string) => priceRatioDecimals(need(quote), price);
export const convertUnits = (amount: bigint, from: string, to: string, pr: {num: bigint; den: bigint}) =>
  convertUnitsByDecimals(amount, need(from), need(to), pr);
```

Usage:

```ts
const usd = toUnits('USD', '10.50');
const pr  = buildPriceRatio('USD', 'TOKEN', '5.25');
const out = convertUnits(usd, 'USD', 'TOKEN', pr);
```

---

## 5) Quotes, slippage & BPS (DEX mental model)

* **BPS**: 100 bps = 1%; 25 bps = 0.25%.
* **EXACT\_IN** (fix input): compute `expectedOut`, then `minOut = slippageDown(expectedOut, bps)`.
* **EXACT\_OUT** (fix output): compute `targetOut`, then `maxIn = slippageUp(targetOut, bps)`.

**Cheat sheet (human intent → mode/guard)**

| Intent                                                        | Mode       | Guard you send |
| ------------------------------------------------------------- | ---------- | -------------- |
| “Spend **exactly** 100 USDC; receive whatever SOL comes out.” | EXACT\_IN  | `minOut`       |
| “Receive **exactly** 1 SOL; don’t pay more than Z USDC.”      | EXACT\_OUT | `maxIn`        |
| “Sell **exactly** 5 TOKEN for USDC.”                          | EXACT\_IN  | `minOut`       |
| “I must receive **exactly** 100 USDC selling TOKEN.”          | EXACT\_OUT | `maxIn`        |

> **Buy/sell** is just perspective (which asset is From/To). The *mode* only states what’s fixed.

### Practical examples

**EXACT\_IN (fix input, protect output)**

```ts
import { toMinor, convertUnitsByDecimals, priceRatioDecimals, slippageDown } from 'precise-money';

const inDec = 2;   // USD
const outDec = 7;  // TOKEN
const price = priceRatioDecimals(inDec, '5.43'); // USD per 1 TOKEN

const amountIn = toMinor('100.00', inDec);            // 10000n
const expectedOut = convertUnitsByDecimals(amountIn, inDec, outDec, price);
const minOut = slippageDown(expectedOut, 50);         // 0.5% tolerance
```

**EXACT\_OUT (fix output, protect input)**

```ts
import { toMinor, slippageUp } from 'precise-money';

const outDec = 7;  // TOKEN
const targetOut = toMinor('1.0000000', outDec); // 1 TOKEN
const maxIn = slippageUp(targetOut, 75);        // 0.75% tolerance
```

**Fees and ratios**

```ts
import { applyBps, mulDiv } from 'precise-money';

const fee = applyBps(toMinor('100', 2), 25); // 25 bps of 100.00 → 0.25 → 25n
const part = mulDiv(10_000n, 3, 7, 'round'); // (10000*3)/7 with rounding
```

**Pitfalls**

* Slippage does **not** cover network fees (gas). Budget them separately.
* Always use correct decimals per asset when forming `minOut`/`maxIn`.
* Too‑tight slippage in illiquid pools → frequent reverts.

---

## 6) PSP / fiat integration

* Fiat is usually **2 decimals** (USD/EUR/BRL); confirm per PSP.
* Webhooks sending "10.505"? Decide a rounding rule and **document it**.

```ts
const cents = toMinor('10.50', 2);  // 1050n
const shown = fromMinor(cents, 2);  // "10.50"
```

---

## 7) Persistence & APIs

**Postgres**

* Amounts: prefer `BIGINT` (hot paths). If you must use `NUMERIC`, treat as **string** in Node.

**node‑pg parsers**

```ts
import pg from 'pg';
pg.types.setTypeParser(20, (v) => BigInt(v));   // BIGINT → BigInt
pg.types.setTypeParser(1700, (v) => String(v)); // NUMERIC → string
```

**JSON**

* Money as strings; `bigint` doesn’t serialize.

---

## 8) Blockchain adapters (where decimals come from)

* **EVM (ERC‑20)**: read `decimals()` from the token contract.
* **Solana**: SOL=9; many SPL mints are 6 or 9 (`mint.decimals`).
* **Stellar (classic)**: default 7 (verify per asset/issuer).
* **Cosmos**: many denoms are 6; confirm per chain.

**Recommended flow**: UI/PSP → `toMinor(human, decimals)` → DB (BIGINT) → wallet/ledger. Convert to on‑chain scale **at the boundary only**.

---

## 9) Copy‑paste recipes

**A) Quote EXACT\_IN (USD→TOKEN)**

```ts
const inHuman  = '100.00';
const inDec    = 2;              // USD
const outDec   = 7;              // TOKEN
const price    = priceRatioDecimals(inDec, '5.43'); // USD per 1 TOKEN
const inMinor  = toMinor(inHuman, inDec);
const expOut   = convertUnitsByDecimals(inMinor, inDec, outDec, price);
const minOut   = slippageDown(expOut, 50); // 0.5%
```

**B) Quote EXACT\_OUT (max you’ll pay)**

```ts
const wantOut  = toMinor('1.0000000', 7);  // 1 TOKEN
const maxIn    = slippageUp(wantOut, 75);  // 0.75%
```

**C) Fee in BPS**

```ts
const gross = toMinor('250', 2);  // $250.00
const fee   = applyBps(gross, 180); // 1.80%
const net   = gross - fee;
```

**D) Average fiat price per unit**

```ts
import { divToDecimalString } from 'precise-money';
function avgFiatPricePerUnit({ filledQtyMinor, spentFiatMinor, outDecimals, fiatDecimals }:{ filledQtyMinor: bigint; spentFiatMinor: bigint; outDecimals: number; fiatDecimals: number; }){
  const scale = 10n ** BigInt(fiatDecimals + outDecimals);
  const num = spentFiatMinor * scale;
  const den = filledQtyMinor === 0n ? 1n : filledQtyMinor;
  return divToDecimalString(num, den, fiatDecimals + outDecimals);
}
```

---

## 10) Minimal tests (Vitest)

```ts
import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, convertUnitsByDecimals, priceRatioDecimals } from 'precise-money';

describe('money', () => {
  it('round trip', () => {
    const m = toMinor('1.234567', 6);
    expect(fromMinor(m, 6)).toBe('1.234567');
  });
  it('convert USD→TOKEN', () => {
    const pr = priceRatioDecimals(2, '5.25');
    const usd = toMinor('10.50', 2);
    const out = convertUnitsByDecimals(usd, 2, 7, pr);
    expect(out > 0n).toBe(true);
  });
});
```

---

## 11) Production checklist

* [ ] Decide decimals per asset (read from chain where applicable).
* [ ] Convert human ↔ minor only via helpers; keep amounts as `bigint` internally.
* [ ] Document rounding per flow (user input, fees, swaps) and use explicit modes.
* [ ] DB BIGINT parsers set; JSON replacer for `bigint`.
* [ ] Slippage guardrails wired for EXACT\_IN/OUT.

---

## 12) FAQ

**Can I use `decimal.js`/`bignumber.js`?**  UI/formatting: yes. Ledger/contracts/PSP: prefer `bigint` (no floating point).

**How do I represent prices?**  `priceRatioDecimals(quoteDecimals, priceStr)` → `{num, den}`. Convert amounts with `convertUnitsByDecimals`.

**Can I mix `number` and `bigint`?**  No. Convert `number` to `BigInt` first (watch `number` limits).

**Which rounding should I use?**  Default `'round'` (half‑up). For *maxIn* use `ceil`; for *minOut* use `floor` or slippage.

---

> **Disclaimer**: technical content only, not financial advice. Test on staging/testnets. Decimal/rounding mistakes can cause losses. Version your rounding rules.

Happy building! 🚀
