import { describe, it, expect } from 'vitest';
import { scaleUnits, toMinor, fromMinor, applySlippage, avgFiatPricePerUnit, splitAmount, divToDecimalString } from '../src/core';


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
});


it('avgFiatPricePerUnit basic', () => {
    const price = avgFiatPricePerUnit({
      filledQtyMinor: 6_340_065n,
      spentFiatMinor: 10_000n,
      outDecimals: 7,
      fiatDecimals: 2
    });
    expect(price).toBe('157.72708954'); // antes checava "15772708954."
  });


it('splitAmount lots', () => {
expect(splitAmount(10n, 3n)).toEqual([3n, 3n, 3n, 1n]);
});


it('divToDecimalString', () => {
expect(divToDecimalString(123n, 10n, 4)).toBe('12.3000');
});
});