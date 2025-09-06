// packages/precise-money/src/adapters/cosmos.ts
import { toMinor, fromMinor } from '../core';
import { DEC } from '../registry';

// Default 6 (micro-denom), mas NÃO é universal
export function cosmosToMinor(h: string|number, decimals: number = 6): bigint {
  return toMinor(h, decimals);
}
export function cosmosFromMinor(u: bigint, decimals: number = 6): string {
  return fromMinor(u, decimals);
}

// Resolve via registry; pode usar { denom, symbol, chainId }
export function cosmosResolveDecimals(
  params: { denom?: string; symbol?: string; chainId?: string|number },
  fallback = 6
): number {
  const { denom, symbol, chainId } = params ?? {};
  if (denom && chainId) {
    const d = DEC.getById({ chain: 'cosmos', symbol: symbol ?? '', address: denom, chainId: Number(chainId) } as any);
    if (typeof d === 'number') return d;
  }
  if (denom) {
    const d = DEC.getById({ chain: 'cosmos', symbol: symbol ?? '', address: denom } as any);
    if (typeof d === 'number') return d;
  }
  if (symbol) {
    const d = DEC.get(symbol);
    if (typeof d === 'number') return d;
  }
  return fallback; // 6 por padrão
}

/** Opcional: buscar exponent via bank metadata (client/grpc/rest da app) */
export async function cosmosFetchDecimalsViaBank(
  client: { bankDenomMetadata: (denom: string) => Promise<{ denom_units?: { denom: string; exponent: number }[], display?: string }> },
  denom: string
): Promise<number> {
  const md = await client.bankDenomMetadata(denom);
  // padrão: pegue o exponent da unidade 'display'; se não houver, maior exponent
  const units = md?.denom_units ?? [];
  const byDisplay = units.find(u => u.denom === (md?.display || ''));
  if (byDisplay?.exponent != null) return Number(byDisplay.exponent);
  const max = units.reduce((m, u) => Math.max(m, Number(u.exponent ?? 0)), 0);
  return max || 6;
}

export async function cosmosEnsureDecimals(
  args: { client?: { bankDenomMetadata: (d: string) => Promise<any> }; denom?: string; symbol?: string; chainId?: string|number },
  fallback = 6
): Promise<number> {
  const { client, denom, symbol, chainId } = args ?? {};
  if (client && denom) {
    try { return await cosmosFetchDecimalsViaBank(client as any, denom); } catch { /* fallback */ }
  }
  return cosmosResolveDecimals({ denom, symbol, chainId }, fallback);
}
