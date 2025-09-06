/**
* Decimals registry: by symbol and by full AssetId.
* Keep it simple; allow overrides at runtime.
*/
export type Chain = 'stellar' | 'evm' | 'solana' | 'cosmos';
export type AssetId = { chain: Chain; symbol: string; address?: string; issuer?: string; chainId?: number };


const bySymbol = new Map<string, number>();
const byId = new Map<string, number>();


function idKey(id: AssetId): string {
return [id.chain, id.chainId ?? '', id.symbol.toUpperCase(), id.address ?? '', id.issuer ?? ''].join(':');
}


export const DEC = {
get(symbol: string): number | undefined { return bySymbol.get(symbol.toUpperCase()); },
set(symbol: string, dec: number): void { bySymbol.set(symbol.toUpperCase(), dec); },
getById(id: AssetId): number | undefined { return byId.get(idKey(id)); },
setById(id: AssetId, dec: number): void { byId.set(idKey(id), dec); },
};


// Some sensible defaults (can be extended at app init):
DEC.set('BRL', 2);
DEC.set('USD', 2);
DEC.set('USDC', 6); // common on many chains
DEC.set('USDT', 6);