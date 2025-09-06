/**
 * @defy-labs/precise-money — core.ts
 * Pure BigInt math for cross-chain units. No chain SDKs, no ENV access.
 */

export type Rounding = 'floor' | 'ceil' | 'round' | 'bankers';

const POW10: bigint[] = Array.from({ length: 39 }, (_, i) => 10n ** BigInt(i));
const BPS_BASE = 10_000n;

/** Safe power of 10 using a small cache */
function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new Error('pow10 expects non-negative integer');
  return n < POW10.length ? POW10[n] : 10n ** BigInt(n);
}

/** Scale an integer amount between different decimal precisions. */
export function scaleUnits(u: bigint, fromDec: number, toDec: number, opts?: { mode?: Rounding }): bigint {
  if (!Number.isInteger(fromDec) || !Number.isInteger(toDec) || fromDec < 0 || toDec < 0)
    throw new Error('scaleUnits: decimals must be non-negative integers');
  if (fromDec === toDec) return u;
  if (fromDec < toDec) {
    return u * pow10(toDec - fromDec);
  }
  // fromDec > toDec → divide with rounding
  return divRound(u, pow10(fromDec - toDec), opts?.mode ?? 'floor');
}

/**
 * Normalize human input like:
 *  "1.234,56", "1_234.56", "  -12.3  "
 * into components: sign/int/frac  →  { sign: 1n|-1n, int: "1234", frac: "56" }
 * Strategy: detect the *last* '.' or ',' as decimal separator; all other separators are removed.
 */
export function normalizeAmountInput(x: string | number): { sign: 1n | -1n; int: string; frac: string } {
  let s = typeof x === 'number' ? String(x) : x;
  s = s.trim();
  if (s === '') throw new Error('empty amount');

  // sign
  let sign: 1n | -1n = 1n;
  if (s[0] === '+') s = s.slice(1);
  else if (s[0] === '-') { sign = -1n; s = s.slice(1); }

  // remove spaces/underscores
  s = s.replace(/\s+/g, '').replace(/_/g, '');

  // detect decimal separator as the last '.' or ','
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decSep = '';
  if (lastDot >= 0 || lastComma >= 0) decSep = lastDot > lastComma ? '.' : ',';

  if (decSep) {
    const parts = s.split(decSep);
    const intPart = (parts[0] || '0').replace(/[.,\s]/g, '');
    const fracPart = parts.slice(1).join('').replace(/[.,\s]/g, '');
    if (!/^\d+$/.test(intPart) || (fracPart && !/^\d+$/.test(fracPart))) throw new Error(`invalid amount: ${x}`);
    const intNorm = intPart.replace(/^0+(?=\d)/, '') || '0';
    return { sign, int: intNorm, frac: fracPart };
  } else {
    const digits = s.replace(/[.,\s]/g, '');
    if (!/^\d+$/.test(digits)) throw new Error(`invalid amount: ${x}`);
    const intNorm = digits.replace(/^0+(?=\d)/, '') || '0';
    return { sign, int: intNorm, frac: '' };
  }
}

/**
 * Convert a human string/number (e.g. "12.345") to minor units bigint given decimals.
 * Default rounding is 'round' (half-up behavior).
 */
export function toMinor(human: string | number, decimals: number, opts?: { mode?: Rounding }): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error('toMinor: decimals must be non-negative integer');
  const { sign, int, frac } = normalizeAmountInput(human);
  const mode = opts?.mode ?? 'round';

  // pad fraction to decimals+1 to capture a rounding digit
  const padded = (frac + '0'.repeat(decimals + 1)).slice(0, decimals + 1);
  const core = padded.slice(0, decimals);
  const roundDigit = Number(padded.slice(decimals, decimals + 1) || '0');

  let base = BigInt(int) * pow10(decimals) + BigInt(core || '0');
  if (roundDigit > 0) {
    base = roundAdjust(base, 1, mode); // add one "unit in last place" if rounding requires
  }
  return sign < 0n ? -base : base;
}

/** Convert minor units bigint back to a human string with exactly `decimals` fractional digits. */
export function fromMinor(minor: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error('fromMinor: decimals must be non-negative integer');
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const scale = pow10(decimals);
  const i = abs / scale;
  const f = (abs % scale).toString().padStart(decimals, '0');
  return (neg ? '-' : '') + (decimals === 0 ? i.toString() : `${i}.${f}`);
}

/** Apply slippage (in basis points) to an *output* amount → returns minOut (floored). */
export function applySlippage(amountOutMinor: bigint, slippageBps: number): bigint {
  if (!Number.isFinite(slippageBps) || slippageBps < 0) throw new Error('slippageBps must be >= 0');
  const num = BPS_BASE - BigInt(Math.trunc(slippageBps));
  return (amountOutMinor * num) / BPS_BASE;
}

/** Given a target output and slippage, compute the minimum acceptable output. */
export function minOutForExactIn(amountOutMinor: bigint, slippageBps: number): bigint {
  return applySlippage(amountOutMinor, slippageBps);
}

/** Split a total amount into lot-sized chunks (last chunk may be remainder). */
export function splitAmount(totalMinor: bigint, lotSizeMinor: bigint): bigint[] {
  if (lotSizeMinor <= 0n) throw new Error('lotSizeMinor must be > 0');
  const chunks: bigint[] = [];
  let left = totalMinor;
  while (left >= lotSizeMinor) {
    chunks.push(lotSizeMinor);
    left -= lotSizeMinor;
  }
  if (left > 0n) chunks.push(left);
  return chunks;
}

/** Multiply then divide with rounding: floor/ceil/round/bankers. */
export function mulDiv(a: bigint, b: bigint | number, c: bigint | number, mode: Rounding = 'round'): bigint {
  const bb = typeof b === 'number' ? BigInt(b) : b;
  const cc = typeof c === 'number' ? BigInt(c) : c;
  if (cc === 0n) throw new Error('division by zero');
  return divRound(a * bb, cc, mode);
}

/** Apply percentage in basis points to a bigint amount. */
export function applyBps(units: bigint, bps: number, mode: Rounding = 'round'): bigint {
  return mulDiv(units, Math.trunc(bps), BPS_BASE, mode);
}

/** Clamp bps to [0, 10000]. */
export function clampBps(bps: number): number {
  return Math.max(0, Math.min(10_000, Math.trunc(bps)));
}

/** EXACT_IN → protect downward (minOut). */
export function slippageDown(amountMinor: bigint, bps: number): bigint {
  const b = BigInt(clampBps(bps));
  return (amountMinor * (BPS_BASE - b)) / BPS_BASE;
}

/** EXACT_OUT → protect upward (maxIn), using ceil division. */
export function slippageUp(amountMinor: bigint, bps: number): bigint {
  const b = BigInt(clampBps(bps));
  const num = amountMinor * (BPS_BASE + b);
  const q = num / BPS_BASE;
  const r = num % BPS_BASE;
  return r === 0n ? q : q + 1n;
}

/**
 * Build a price ratio from a human price string scaled to `quoteDecimals`.
 * Interprets `priceStr` as QUOTE per 1 BASE.
 * Returns { num, den } such that price = num/den (both integers).
 */
export function priceRatioDecimals(quoteDecimals: number, priceStr: string): { num: bigint; den: bigint } {
  if (!Number.isInteger(quoteDecimals) || quoteDecimals < 0) throw new Error('quoteDecimals must be non-negative integer');
  const n = normalizeAmountInput(priceStr);
  if (n.sign < 0n) throw new Error('negative price not allowed');
  const num = BigInt(n.int + (n.frac + '0'.repeat(quoteDecimals)).slice(0, quoteDecimals)); // scaled to 10^quoteDecimals
  const den = pow10(quoteDecimals);
  return { num, den };
}

/**
 * Convert units using a price ratio and explicit decimals.
 * amount_from * (num/den) * 10^(toDec - fromDec)
 */
export function convertUnitsByDecimals(
  amountUnits: bigint,
  fromDec: number,
  toDec: number,
  price: { num: bigint; den: bigint },
  mode: Rounding = 'round'
): bigint {
  if (!Number.isInteger(fromDec) || !Number.isInteger(toDec) || fromDec < 0 || toDec < 0)
    throw new Error('convertUnitsByDecimals: decimals must be non-negative integers');
  const diff = toDec - fromDec;
  const scaleNum = diff >= 0 ? pow10(diff) : 1n;
  const scaleDen = diff < 0 ? pow10(-diff) : 1n;
  return mulDiv(mulDiv(amountUnits, price.num, price.den, mode), scaleNum, scaleDen, mode);
}

/**
 * Divide two bigints and return a decimal string with `scale` fractional digits.
 * Example: divToDecimalString(123n, 10n, 4) → "12.3000"
 */
export function divToDecimalString(numer: bigint, denom: bigint, scale = 8): string {
  if (denom === 0n) throw new Error('division by zero');
  if (!Number.isInteger(scale) || scale < 0) throw new Error('scale must be a non-negative integer');
  const neg = (numer < 0n) !== (denom < 0n);
  const a = absBig(numer);
  const b = absBig(denom);
  const scaled = a * pow10(scale);
  const i = scaled / b;
  const s = i.toString().padStart(scale + 1, '0');
  const head = s.slice(0, -scale) || '0';
  const tail = s.slice(-scale);
  return (neg ? '-' : '') + head + (scale > 0 ? '.' + tail : '');
}

/**
 * Average FIAT price per OUT unit (string), using only BigInt math.
 * price = (spentFiatMinor / 10^fiatDecimals) / (filledQtyMinor / 10^outDecimals)
 * Returns a decimal string with `scale` fractional digits (default 8).
 */
export function avgFiatPricePerUnit(params: {
    filledQtyMinor: bigint;
    spentFiatMinor: bigint;
    outDecimals: number;
    fiatDecimals: number;
    scale?: number;
  }): string {
    const { filledQtyMinor, spentFiatMinor, outDecimals, fiatDecimals, scale = 8 } = params;
    if (filledQtyMinor <= 0n) throw new Error('avgFiatPricePerUnit: filledQtyMinor must be > 0');
    if (!Number.isInteger(outDecimals) || outDecimals < 0) throw new Error('avgFiatPricePerUnit: outDecimals must be a non-negative integer');
    if (!Number.isInteger(fiatDecimals) || fiatDecimals < 0) throw new Error('avgFiatPricePerUnit: fiatDecimals must be a non-negative integer');
    if (!Number.isInteger(scale) || scale < 0) throw new Error('avgFiatPricePerUnit: scale must be a non-negative integer');
  
    // Correct: price = (spent * 10^outDec) / (filled * 10^fiatDec), formatted with `scale` by divToDecimalString
    const numer = spentFiatMinor * pow10(outDecimals);
    const denom = filledQtyMinor * pow10(fiatDecimals);
    return divToDecimalString(numer, denom, scale);
}
  
/* ---------------- internal helpers ---------------- */

function divRound(n: bigint, d: bigint, mode: Rounding): bigint {
  if (d === 0n) throw new Error('division by zero');
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const sign = (n > 0n) === (d > 0n) ? 1 : -1;
  switch (mode) {
    case 'floor':
      return sign < 0 ? q - 1n : q;
    case 'ceil':
      return sign > 0 ? q + 1n : q;
    case 'round':
      return absBig(r * 2n) >= absBig(d) ? q + BigInt(sign) : q;
    case 'bankers': {
      const twice = absBig(r * 2n);
      if (twice > absBig(d)) return q + BigInt(sign);
      if (twice < absBig(d)) return q;
      // exactly .5 → round to even
      return (q % 2n === 0n) ? q : q + BigInt(sign);
    }
  }
}

function roundAdjust(base: bigint, sign: -1 | 1, mode: Rounding): bigint {
  switch (mode) {
    case 'ceil':    return sign > 0 ? base + 1n : base;
    case 'round':   return base + BigInt(sign);
    case 'bankers': return (base % 2n === 0n) ? base : base + BigInt(sign);
    case 'floor':
    default:        return base;
  }
}

function absBig(x: bigint): bigint { return x < 0n ? -x : x; }
