# Golden Rules — Money & Precision (Defy-Labs)

> **Goal:** Standardize how we represent, compute, persist, and display **money** and **asset quantities** at Defy with **maximum precision** and **safety** (no `float`). This document reflects our `@defy-labs/precise-money` library and cleanly separates the **core layer** (pure, BigInt math) from the **symbolic layer** (aware of symbols/currency codes and the decimals registry).

---

## 1) Types & Representations

* **Internal amounts (minor units):** always `bigint` (e.g., USD/BRL cents, micro‑USDC, BTC sats).
  **Never** use `number` to represent persisted or on‑chain amounts.
* **Rates/percentages/prices:** represent as **rational numbers** `{ num, den }` or use integer helpers: `mulDiv` / `applyBps` with **explicit rounding**.
  Avoid `number`/`float` here as well.
* **JSON (APIs):** `bigint` is **not** JSON‑serializable. Convert to **string** (via a global replacer or explicit DTO mapping).
* **Database (Postgres):**

  * Persist amounts in **`BIGINT`**.
  * Avoid `NUMERIC` on hot paths; keep it for aggregated reporting only.
  * If you read `NUMERIC`, treat it as a **string** in Node (custom parser) and convert only where strictly needed.

---

## 2) Decimals per asset (business layer)

* Declare decimals in the **registry** (plus business defaults):

  * `ASSET_DECIMALS` (e.g., `USD:2`, `BRL:2`, `USDC:6`, `BTC:8`, `ETH:18`).
  * `DEC.set('USDC', 6)` or `DEC.setById({ chain:'stellar', symbol:'USDC', issuer:'GA...' }, 7)` for network/issuer overrides.
* **Stellar (classic):** ledger amounts use **7 fractional digits**; **Soroban tokens** expose `decimals()` on the contract.
* **Rule:** keep business‑friendly decimals in the app (e.g., `USDC:6`) and **convert at the on‑chain boundary** when signing/sending transactions.
* **Optional ENV override:** `STELLAR_DECIMALS_<CODE>` (e.g., `STELLAR_DECIMALS_USDC=7`).

**Resolution priority** (symbolic layer): `DEC` → ENV → `ASSET_DECIMALS` → fallback `7` (typical Stellar).

---

## 3) Canonical conversions (I/O)

> Use **core** when you know the decimal scale. Use the **symbolic layer** when you only have the **symbol** or **asset id**.

* **Human input → internal units**

  * **Core:** `toMinor(human, decimals, { mode })`
  * **Symbolic:** `toUnits(symbolOrKey, human, mode)`
  * Normalizes formats (`1,234.56` / `1.234,56`), accepts negatives, and applies the **rounding mode**.

* **Internal units → display**

  * **Core:** `fromMinor(units, decimals)` (fixed string, no grouping)
  * **Symbolic:** `fromUnits(symbolOrKey, units)`
  * **Locale formatting**: `formatUnits(symbolOrKey, units, locale, minFrac?, maxFrac?)` (grouping with a safe fallback for huge integers).

* **Scale changes between decimal systems**

  * **Core:** `scaleUnits(u, fromDec, toDec, { mode? })`

---

## 4) Rounding (always explicit)

* **Core modes:** `floor` | `ceil` | `round` | `bankers`.
* **Conventions:**

  * **User inputs** (e.g., FIAT with more decimals than allowed): use **`round`** (half‑up).
  * **Fees/charges:** prefer **`round`**; when required by policy, use `floor`/`ceil`.
  * **Bookkeeping:** document the rounding mode for any calculation that impacts balances.
* **Compat (symbolic layer):** accepts `half_up` / `trunc` and maps to core modes internally.

---

## 5) Safe math (BigInt)

* **Multiply/Divide:** `mulDiv(a, b, c, mode)` computes `a * b / c` with controlled rounding and sign support.
* **BPS / percentages:** `applyBps(units, bps, mode)` (e.g., 25 bps = 0.25%).
  Clamp helper: `clampBps(bps)` ensures `[0, 10000]`.
* **Slippage:**

  * **EXACT\_IN** (protect **minimum output**): `slippageDown(amountOut, bps)` or `applySlippage(amountOut, bps)`.
  * **EXACT\_OUT** (protect **maximum input**): `slippageUp(amountIn, bps)` (uses **ceil** division).
* **Prices/quotes (rational):**

  * **Core:** `priceRatioDecimals(quoteDecimals, priceStr)` → `{ num, den }` (price = **QUOTE per 1 BASE**).
  * **Convert between assets:** `convertUnitsByDecimals(amountUnits, fromDec, toDec, price, mode)`.
  * **Symbolic:** `priceRatio(quoteSymbol, baseSymbol, priceStr)` and `convertUnits(amount, fromSymbol, toSymbol, price, mode)` resolve decimals via the registry.
  * **Average FIAT per OUT unit:** use `avgFiatPricePerUnit(...)` in the symbolic layer when you want currency‑aware logic.

---

## 6) Postgres & Node parsers

* In `pg` (Node):

  * OID **20/BIGINT** → parse into **BigInt**.
  * OID **1700/NUMERIC** → parse into **string**.
* In Express (or similar): define a **JSON replacer** to serialize `bigint` as strings:
  `app.set('json replacer', (k,v) => typeof v === 'bigint' ? v.toString() : v)`.
* Set `statement_timeout`, `query_timeout`, and `application_name`.

---

## 7) API/service best practices

* **Never** accept/return money as `float`. Use **string** (e.g., `"10.50"`) at the API edge and convert to `bigint` with `toUnits`.
* **Idempotent persistence:** store **integer units** (`BIGINT`). E.g., `provider_transactions.amount_in_units` / `amount_out_units`.
* **Metrics (Prometheus):** prefer event counters (e.g., `*_total{stage}`) over summing monetary values. If a number must be emitted, convert **at the edge** with known scale.

---

## 8) On‑chain boundary (Stellar/EVM/Solana/Cosmos)

* **App ↔ Chain:** keep business decimals in the app (e.g., `USDC:6`). At the **on‑chain boundary**, convert to the network’s scale (e.g., **Stellar classic 7**; **Solana**: `mint.decimals`; **EVM**: token `decimals()`).
* **Soroban/contracts:** persist scaled integers (document `SCALE` in the contract) and expose `decimals()` where appropriate.

---

## 9) Do / Don’t

**Do** ✅

* Use `bigint` for internal amounts.
* Centralize asset decimals (`DEC` + `ASSET_DECIMALS` + ENV).
* Use `toUnits`/`fromUnits`/`formatUnits` at every human I/O boundary.
* Be **explicit** about rounding (`round` by default) when down‑scaling/dividing.
* Represent prices/percentages as **rational** + `mulDiv`.
* Serialize `bigint` as **string** in JSON.

**Don’t** ❌

* Don’t use `number`/`float` for money.
* Don’t sum monetary values with `Number` (precision loss).
* Don’t mix scales (e.g., treating `USDC` as 6 in one place and 7 in another).
  **Convert only at the on‑chain boundary**.

---

## 10) Practical examples

```ts
import {
  // core
  toMinor, fromMinor, scaleUnits,
  mulDiv, applyBps, slippageDown, slippageUp,
  priceRatioDecimals, convertUnitsByDecimals,
  // symbolic
  toUnits, fromUnits, formatUnits, priceRatio, convertUnits,
} from '@defy-labs/precise-money'

// User input 10.505 USD → cents (minor)
const cents = toUnits('USD', '10.505')          // 1051n (half-up via symbolic)

// Fee: 25 bps on $100.00
const fee = applyBps(toMinor('100', 2), 25)     // 25n (2 decimals)

// Friendly display (locale)
formatUnits('USD', 1234567890123456789n, 'en-US') // "1,234,567,890,123,456,789.00"

// Price 5.4321 USD per 1 TOKEN (QUOTE/BASE) → convert $10.50 to TOKEN
const pr = priceRatio('USD', 'TOKEN', '5.4321')     // scaled to USD
const usd = toUnits('USD', '10.50')                 // 1050n (2 dec)
const out = convertUnits(usd, 'USD', 'TOKEN', pr)   // TOKEN minor using TOKEN decimals
fromUnits('TOKEN', out)                             // human string for TOKEN

// Core-only (no registry): USD=2, TOKEN=7
const pr2 = priceRatioDecimals(2, '5.4321')
const out2 = convertUnitsByDecimals(1050n, 2, 7, pr2)
```

---

## 11) Minimal tests (recommended)

* `toMinor/fromMinor` & `toUnits/fromUnits`: positives/negatives, decimal comma, excess fractional digits (rounding), round‑trip.
* `mulDiv`: signs, non‑exact divisions, `round` vs `floor/ceil/bankers`.
* `applyBps` / `slippageDown` / `slippageUp`: typical bps (25/50/75) and edges (0/10000).
* `priceRatio* / convertUnits*`: USD↔USDC, BTC↔USDC, TOKEN↔FIAT with varying scales.
* JSON replacer: ensure `bigint` becomes string.

---

## 12) Adoption checklist

* [ ] `ASSET_DECIMALS` defined and reviewed per environment.
* [ ] `DEC` registry configured (including issuer/chainId overrides where needed).
* [ ] `pg` parsers adjusted (BIGINT → BigInt, NUMERIC → string).
* [ ] JSON replacer registered for `bigint`.
* [ ] Routes/services use `toUnits`/`fromUnits`/`formatUnits` at boundaries.
* [ ] Monetary math done only with `bigint`/`mulDiv`/rational prices.
* [ ] On‑chain conversion only in adapters.

---

### Relevant files

* `packages/precise-money/src/core.ts` — pure primitives: normalization, to/fromMinor, scaleUnits, slippage, mulDiv, priceRatio, convertUnitsByDecimals, etc.
* `packages/precise-money/src/symbolic.ts` — symbol layer: to/from/formatUnits, priceRatio/convertUnits, `avgFiatPricePerUnit`.
* `packages/precise-money/src/registry.ts` — `DEC` and ID helpers.
* `packages/precise-money/src/adapters/*` — on‑chain boundary (SDK‑free formatting per network).

> Living document: whenever you add a new asset/scale or change any rounding rule, **update this doc** and the corresponding helpers in code.
