// EVM adapter (SDK-free). Defaults to 18 decimals, but tokens like USDC(6) or WBTC(8) differ.
// Use evmResolveDecimals(...) or on-chain fetch helpers to determine the correct decimals.

import { toMinor, fromMinor } from '../core';
import { DEC } from '../registry';


/**
* Pure formatting with a safe default.
* NOTE: 18 is correct for ETH and many ERC-20s, but NOT universal. Prefer resolving decimals.
*/
export function evmToMinor(human: string | number, decimals: number = 18): bigint {
return toMinor(human, decimals);
}
export function evmFromMinor(minor: bigint, decimals: number = 18): string {
return fromMinor(minor, decimals);
}


/** Resolve decimals using the runtime registry first, then fallback to a provided default (18). */
export function evmResolveDecimals(
params: { symbol?: string; address?: `0x${string}`; chainId?: number },
fallback = 18
): number {
const { symbol, address, chainId } = params ?? {};
if (address && typeof chainId === 'number') {
const byId = DEC.getById({ chain: 'evm', symbol: symbol ?? '', address, chainId } as any);
if (typeof byId === 'number') return byId;
}
if (symbol) {
const bySym = DEC.get(symbol);
if (typeof bySym === 'number') return bySym;
}
return fallback;
}


/** Optional: fetch decimals from chain via a minimal viem-compatible client. */
export async function evmFetchDecimalsViaViem(
client: { readContract: (args: { address: `0x${string}`; abi: any; functionName: 'decimals' }) => Promise<any> },
token: `0x${string}`
): Promise<number> {
const erc20Abi = [{
type: 'function', stateMutability: 'view', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }]
}] as const;
const d = await client.readContract({ address: token, abi: erc20Abi as any, functionName: 'decimals' });
const n = Number(d);
if (!Number.isFinite(n) || n < 0 || n > 36) throw new Error(`invalid decimals from chain: ${d}`);
return n;
}


/** Convenience helper combining on-chain fetch with registry fallback. */
export async function evmEnsureDecimals(
args: { client?: { readContract: (a: any) => Promise<any> }; address?: `0x${string}`; chainId?: number; symbol?: string },
fallback = 18
): Promise<number> {
const { client, address, chainId, symbol } = args;
if (client && address) {
try { return await evmFetchDecimalsViaViem(client as any, address); } catch { /* fall through */ }
}
return evmResolveDecimals({ symbol, address, chainId }, fallback);
}