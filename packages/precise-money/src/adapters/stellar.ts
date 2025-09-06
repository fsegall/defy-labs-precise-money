// packages/precise-money/src/adapters/stellar.ts
import { toMinor, fromMinor } from '../core';
import { DEC } from '../registry';

// Classic ledger: sempre 7
export function stellarClassicToMinor(h: string|number): bigint { return toMinor(h, 7); }
export function stellarClassicFromMinor(u: bigint): string { return fromMinor(u, 7); }

// Soroban/token: passar/descobrir decimals
export function stellarToMinor(h: string|number, decimals: number = 7): bigint {
  return toMinor(h, decimals); // default 7 para não quebrar XLM/credit
}
export function stellarFromMinor(u: bigint, decimals: number = 7): string {
  return fromMinor(u, decimals);
}

// Resolve via registry (issuer ou contractId); fallback 7
export function stellarResolveDecimals(
  params: { symbol?: string; issuer?: string; contractId?: string },
  fallback = 7
): number {
  const { symbol, issuer, contractId } = params ?? {};
  if (contractId) {
    const d = DEC.getById({ chain: 'stellar', symbol: symbol ?? '', address: contractId } as any);
    if (typeof d === 'number') return d;
  }
  if (issuer) {
    const d = DEC.getById({ chain: 'stellar', symbol: symbol ?? '', issuer } as any);
    if (typeof d === 'number') return d;
  }
  if (symbol) {
    const d = DEC.get(symbol);
    if (typeof d === 'number') return d;
  }
  return fallback; // 7 no classic
}
