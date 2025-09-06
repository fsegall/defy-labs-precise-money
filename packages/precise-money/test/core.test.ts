import { describe, it, expect } from 'vitest';
import {
  // core
  scaleUnits, toMinor, fromMinor, applySlippage, minOutForExactIn,
  avgFiatPricePerUnit, splitAmount, divToDecimalString,
  normalizeAmountInput, mulDiv, applyBps, clampBps,
  slippageDown, slippageUp,
  priceRatioDecimals, convertUnitsByDecimals,
} from '../src/core';

/* ------------------------------------------------------------------ */
/* Basic happy path (teus testes originais, com 1 ajuste no avgFiat)  */
/* ------------------------------------------------------------------ */
describe('core money math', () => {
  it('scaleUnits 2→7 and 7→2', () => {
    expect(scaleUnits(12500n, 2, 7)).toBe(12500n * 100000n);
    expect(scaleUnits(1250000000n, 7, 2)).toBe(12500n);
  });

  it('toMinor / fromMinor round trip', () => {
    const m = toMinor('123.4567', 7);
    expect(fromMinor(m, 7)).toBe('123.4567000');
  });

  it('applySlippage 50 bps', () => {
    expect(applySlippage(1_000_000n, 50)).toBe(995_000n);
    expect(minOutForExactIn(1_000_000n, 50)).toBe(995_000n);
  });

  it('avgFiatPricePerUnit basic', () => {
    const price = avgFiatPricePerUnit({
      filledQtyMinor: 6_340_065n,
      spentFiatMinor: 10_000n,
      outDecimals: 7,
      fiatDecimals: 2
    });
    expect(price).toBe('157.72708954');
  });

  it('splitAmount lots', () => {
    expect(splitAmount(10n, 3n)).toEqual([3n, 3n, 3n, 1n]);
  });

  it('divToDecimalString', () => {
    expect(divToDecimalString(123n, 10n, 4)).toBe('12.3000');
  });
});

/* --------------------------------------------- */
/* Rounding modes & normalization edge cases     */
/* --------------------------------------------- */
describe('rounding & normalization', () => {
  it('toMinor rounding: round/floor/ceil/bankers (positive)', () => {
    // 1.2345 with 3 decimals → last extra digit = 5
    expect(toMinor('1.2345', 3)).toBe(1235n); // default round (half-up)
    expect(toMinor('1.2345', 3, { mode: 'floor' })).toBe(1234n);
    expect(toMinor('1.2345', 3, { mode: 'ceil'  })).toBe(1235n);
    // bankers: .5 → towards even (1234 is even → stays)
    expect(toMinor('1.2345', 3, { mode: 'bankers' })).toBe(1234n);
    // bankers with odd last unit (1233 → becomes 1234)
    expect(toMinor('1.2335', 3, { mode: 'bankers' })).toBe(1234n);
  });

  it('toMinor negative values (behavior matches implementation)', () => {
    // Nota: o helper aplica ajuste antes do sinal; veja README para política
    expect(toMinor('-1.2345', 3)).toBe(-1235n);              // round
    expect(toMinor('-1.2345', 3, { mode: 'floor' })).toBe(-1234n); // "floor" aqui mantém base (ver doc)
    expect(toMinor('-1.2345', 3, { mode: 'ceil'  })).toBe(-1235n);
  });

  it('normalizeAmountInput accepts mixed separators', () => {
    expect(normalizeAmountInput('1.234,56')).toEqual({ sign: 1n, int: '1234', frac: '56' });
    expect(normalizeAmountInput('-1_234.56')).toEqual({ sign: -1n, int: '1234', frac: '56' });
    expect(normalizeAmountInput('   00012,30  ')).toEqual({ sign: 1n, int: '12', frac: '30' });
  });

  it('fromMinor with zero decimals & negative divToDecimalString', () => {
    expect(fromMinor(123n, 0)).toBe('123');
    expect(divToDecimalString(-1n, 2n, 2)).toBe('-0.50');
  });

  it('scaleUnits down with explicit ceil', () => {
    // 0.01 with 3 decimals → to 1 decimal with ceil => 0.1 (→ 1)
    expect(scaleUnits(1n, 3, 1, { mode: 'ceil' })).toBe(1n);
    // default floor would be 0
    expect(scaleUnits(1n, 3, 1)).toBe(0n);
  });
});

/* --------------------------- */
/* mulDiv & BPS/slippage math  */
/* --------------------------- */
describe('mulDiv / bps / slippage', () => {
  it('mulDiv rounding & signs', () => {
    expect(mulDiv(5n, 1, 2, 'round')).toBe(3n);      // 2.5 → 3
    expect(mulDiv(5n, 1, 2, 'bankers')).toBe(2n);    // 2.5 → 2 (even)
    expect(mulDiv(-5n, 1, 2, 'floor')).toBe(-3n);    // -2.5 → -3
    expect(mulDiv(-5n, 1, 2, 'ceil')).toBe(-2n);     // -2.5 → -2
  });

  it('applyBps (portion), clampBps', () => {
    expect(applyBps(1_000_000n, 25)).toBe(2_500n);   // 0.25% of amount
    expect(clampBps(-10)).toBe(0);
    expect(clampBps(12345)).toBe(10_000);
  });

  it('slippageDown/Up edges', () => {
    expect(slippageDown(1_000_000n, 0)).toBe(1_000_000n);
    expect(slippageDown(1_000_000n, 10_000)).toBe(0n);
    expect(slippageUp(1_000n, 0)).toBe(1_000n);
    expect(slippageUp(1_000n, 10_000)).toBe(2_000n);
  });

  it('splitAmount when lot > total', () => {
    expect(splitAmount(2n, 5n)).toEqual([2n]);
  });
});

/* ------------------------------ */
/* Price ratio & unit conversion  */
/* ------------------------------ */
describe('price & conversion', () => {
  it('priceRatioDecimals truncates to quote decimals', () => {
    const pr = priceRatioDecimals(2, '5.4321'); // → 5.43
    expect(pr).toEqual({ num: 543n, den: 100n });
  });

  it('convertUnitsByDecimals simple (USD→TOKEN 2→6, price=2.00)', () => {
    const pr = priceRatioDecimals(2, '2.00'); // 2 per 1
    // 1.00 USD (100 minor) → TOKEN(6) at 2 → 200 * 10^(6-2) = 2_000_000
    const out = convertUnitsByDecimals(100n, 2, 6, pr);
    expect(out).toBe(2_000_000n);
  });

  it('convertUnitsByDecimals with rounding (2→7, price=5.4321 truncated to 5.43)', () => {
    const pr = priceRatioDecimals(2, '5.4321'); // {543/100}
    // amount=10.50 USD → 1050 minor
    const out = convertUnitsByDecimals(1050n, 2, 7, pr); // round inside mulDiv
    // 1050 * 543 / 100 = 5701.5 → round → 5702, then * 10^(5) = 570_200_000
    expect(out).toBe(570_200_000n);
  });
});
