// packages/precise-money/src/adapters/solana.ts
// SOL native: 9. Many SPL mints are 6 or 9 (USDC-SPL = 6).
// Prefer resolving decimals via registry or fetching from the mint account.

import { toMinor, fromMinor } from '../core';
import { DEC } from '../registry';

/** Pure formatting with a safe default (9). */
export function solanaToMinor(human: string | number, decimals: number = 9): bigint {
  return toMinor(human, decimals);
}
export function solanaFromMinor(minor: bigint, decimals: number = 9): string {
  return fromMinor(minor, decimals);
}

/** Resolve decimals using the runtime registry first, then fallback (9). */
export function solanaResolveDecimals(
  params: { symbol?: string; mint?: string }, // base58 mint
  fallback = 9
): number {
  const { symbol, mint } = params ?? {};
  if (mint) {
    const byId = DEC.getById({ chain: 'solana', symbol: symbol ?? '', address: mint } as any);
    if (typeof byId === 'number') return byId;
  }
  if (symbol) {
    const bySym = DEC.get(symbol);
    if (typeof bySym === 'number') return bySym;
  }
  return fallback;
}

/** Fetch decimals from the Mint via a minimal web3.js-compatible Connection (parsed account). */
export async function solanaFetchMintDecimalsViaParsed(
  connection: { getParsedAccountInfo: (pubkey: any, commitment?: any) => Promise<{ value: any }> },
  mintPubkey: any // pass a PublicKey from @solana/web3.js
): Promise<number> {
  const info = await connection.getParsedAccountInfo(mintPubkey);
  const dec = Number(
    (info as any)?.value?.data?.parsed?.info?.decimals ??
    (info as any)?.value?.data?.info?.decimals
  );
  if (!Number.isFinite(dec) || dec < 0 || dec > 36) throw new Error('invalid decimals for mint');
  return dec;
}

/** Ensure decimals: try chain fetch first, then registry, then fallback. */
export async function solanaEnsureDecimals(
  args: { connection?: { getParsedAccountInfo: (pubkey: any) => Promise<{ value: any }> }; mint?: any; symbol?: string },
  fallback = 9
): Promise<number> {
  const { connection, mint, symbol } = args ?? {};
  if (connection && mint) {
    try { return await solanaFetchMintDecimalsViaParsed(connection, mint); } catch { /* fall through */ }
  }
  return solanaResolveDecimals({ symbol, mint: typeof mint === 'string' ? mint : undefined }, fallback);
}
