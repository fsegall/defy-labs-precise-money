# Precise Money — Do Zero ao Preciso

# Tutorial Completo para Devs (BR)

> **Objetivo**: ensinar, do zero, como lidar com dinheiro/quantidades com **precisão** em JS/TS e como usar a lib `precise-money` com segurança em integrações **blockchain** (EVM/Solana/Stellar/Cosmos) e **PSPs** (fiat). Sem floats, sem arrependimentos.

---

## 0.5) Glossário essencial (sem jargão)

**PSP (Payment Service Provider)** — prestador de serviços de pagamento (ex.: Stripe, Adyen, Mercado Pago, Pagar.me). Faz a ponte entre seu app e meios de pagamento (cartão, PIX, boleto). Fala em **moeda fiduciária** (fiat) em **unidades humanas** ("10.50" BRL) e normalmente usa **2 casas decimais**.

**Unidade mínima (minor unit)** — a menor unidade inteira de um ativo. Em fiat, centavos (2 casas). Em cripto, depende da chain/ativo (wei, lamport, stroop…). Guardamos **quantias** sempre nessas unidades, como `bigint`.

**Decimais** — quantas casas fracionárias um ativo usa. Ex.: USDC=6, ETH=18, SOL=9, XLM=7. Converter humano ↔ mínima requer saber esse número.

**`1230000n`** — literal **BigInt** do JavaScript. O sufixo `n` indica inteiro arbitrário. `1230000n` (USDC, 6 casas) = **1.230000 USDC**. No JSON, você **não** envia `n`; serialize como string ("1230000").

**BPS (basis points)** — pontos base. **100 bps = 1%**. Ex.: 25 bps = 0,25%. Útil para slippage e taxas.

**Slippage** — tolerância a variação de preço/execução.

* **EXACT\_IN**: você fixa `amountIn` e quer um **mínimo** de saída → use `slippageDown` para obter `minOut`.
* **EXACT\_OUT**: você quer `amountOut` e precisa do **máximo** de entrada aceitável → use `slippageUp` para `maxIn`.

**Adapters on‑chain** — funções finas que convertem humano ↔ mínima com os decimais corretos de cada ecossistema (EVM, Solana, Stellar, Cosmos).

---

## 0.6) Mapa de unidades por chain (exemplos)

| Ambiente           | Unidade mínima (nome) | Escala (decimais) | Exemplo humano           | Unid. mínimas (`bigint`) |
| ------------------ | --------------------- | ----------------- | ------------------------ | ------------------------ |
| **Ethereum (ETH)** | wei                   | 18                | 0.000000000000000001 ETH | `1n`                     |
| **ERC‑20 USDC**    | —                     | 6                 | 1.23 USDC                | `1230000n`               |
| **Solana (SOL)**   | lamport               | 9                 | 0.5 SOL                  | `500000000n`             |
| **Stellar (XLM)**  | stroop                | 7                 | 1 XLM                    | `10000000n`              |
| **Cosmos (ATOM)**  | uatom                 | 6                 | 2.5 ATOM                 | `2500000n`               |
| **Fiat (BRL)**     | centavo               | 2                 | R\$ 10,50                | `1050n`                  |

> **Dica**: tokens ERC‑20/SPL variam. Sempre **descubra** os decimais reais (contrato/mint) em produção.

### Exemplos rápidos

```ts
// USDC (6): 1.23 → 1_230_000 unidades mínimas
toMinor('1.23', 6)        // 1230000n
fromMinor(1230000n, 6)    // "1.230000"

// SOL (9): 0.5 → 500_000_000 lamports
toMinor('0.5', 9)         // 500000000n

// ETH (18): 0.000000000000000001 → 1 wei
toMinor('0.000000000000000001', 18) // 1n
```

---

## 0.7) Slippage & BPS sem sustos

> **Não é “compra” vs “venda”**. *EXACT\_IN* e *EXACT\_OUT* só dizem **qual lado da troca fica fixo**.

### Conceitos

* **BPS (basis points)**: 100 bps = **1%**. Exemplos: 50 bps = 0,5%; 200 bps = 2%.
* **EXACT\_IN**: você fixa **quanto envia** (entrada). Quer proteger o **mínimo** que aceita receber.

  * Guarda‑chuva: `minOut = slippageDown(expectedOut, bps)`
* **EXACT\_OUT**: você fixa **quanto recebe** (saída). Quer proteger o **máximo** que aceita pagar/entregar.

  * Guarda‑chuva: `maxIn = slippageUp(targetOut, bps)`

### Mapa mental

| Cenário humano                                              | Modo       | Proteção |
| ----------------------------------------------------------- | ---------- | -------- |
| “Quero gastar **exatos** 100 USDC e pegar o que der de SOL” | EXACT\_IN  | `minOut` |
| “Preciso receber **exatos** 1 SOL e pago no máximo Z USDC”  | EXACT\_OUT | `maxIn`  |
| “Quero vender **exatos** 5 TOKEN por USDC”                  | EXACT\_IN  | `minOut` |
| “Quero **receber exatos** 100 USDC vendendo TOKEN”          | EXACT\_OUT | `maxIn`  |

> **Rótulos “compra/venda”** dependem de qual ativo está no **From**/**To**. O modo não muda: ele só responde *quem fica fixo*.

### Exemplos práticos

**EXACT\_IN (fixa a entrada, protege saída)**

```ts
import { toMinor, convertUnitsByDecimals, priceRatioDecimals, slippageDown } from 'precise-money';

const inDec = 2;   // USD
const outDec = 7;  // TOKEN
const price = priceRatioDecimals(inDec, '5.43'); // USD por 1 TOKEN

const amountIn = toMinor('100.00', inDec);            // 10000n
const expectedOut = convertUnitsByDecimals(amountIn, inDec, outDec, price);
const minOut = slippageDown(expectedOut, 50);         // 0,5% de tolerância
// Envie a ordem com minOut. Se sair menos, cancela.
```

**EXACT\_OUT (fixa a saída, protege entrada)**

```ts
import { toMinor, slippageUp } from 'precise-money';

const outDec = 7;  // TOKEN
const targetOut = toMinor('1.0000000', outDec); // 1 TOKEN
const maxIn = slippageUp(targetOut, 75);        // 0,75% de tolerância
// Envie a ordem com maxIn. Se precisar pagar mais, cancela.
```

### Armadilhas comuns

* **Slippage só cobre preço/executação**, não cobre *taxas de rede* (gas/fee) — considere‑as à parte.
* **Decimais misturados** (ex.: calcular minOut em 6 dec e enviar em 7 dec) → sempre use os decimais corretos de cada lado.
* **Slippage muito baixo** em pools ilíquidas → falhas frequentes; ajuste dinamicamente conforme a volatilidade.

### Receita rápida

1. Calcule `expectedOut` (EXACT\_IN) ou defina `targetOut` (EXACT\_OUT).
2. Aplique `slippageDown` ou `slippageUp` com bps apropriados.
3. Envie `minOut`/`maxIn` para o agregador/DEX.

---

## 0.8) PSP (o que é e por que 2 casas?)

PSP é quem **autoriza/captura/liquida** pagamentos (cartão/PIX/boletos). Eles trabalham em **FIAT** (geralmente 2 casas) e enviam valores como **strings** ("10.50") ou inteiros em **centavos** ("1050"). Converta **imediatamente** para `bigint`:

```ts
// PSP mandou "10.50" → vira 1050n (centavos)
const cents = toMinor('10.50', 2); // 1050n
```

> **Nunca** processe fiat/cripto com `number`. Sempre `toMinor`/`fromMinor` + `bigint`.

---

## 0) Por que “dinheiro é difícil” em código?

* `number` em JS é **IEEE‑754** (64‑bit float). Ele não representa com exatidão valores como 0.1, 0.2 etc. → *perda de centavos*.
* Cada ativo tem **decimais** diferentes (ex.: USDC=6, ETH=18, XLM=7). UI/PSP falam em **unidades humanas** ("10.50"). Ledger/contratos falam em **unidades mínimas** (`bigint`).
* Rounding importa: *floor/ceil/round/bankers* afetam **saldo** e **risco**.

**Regra de ouro**: *quantias internas sempre como inteiros* (`bigint`). Converta para string **apenas** nas bordas (UI/JSON/logs).

---

## 1) BigInt 101 (JS/TS)

* Literal: `123n` (sufixo **n**).
* Operações: `+ - * / %` funcionam entre `bigint`s. Não misture com `number` (converta antes).
* Serialização: `JSON.stringify` não aceita `bigint` → converta para `string` na saída.

**Replacer Express**:

```ts
app.set('json replacer', (_k, v) => typeof v === 'bigint' ? v.toString() : v);
```

---

## 2) Conceitos: decimais, unidades humanas x mínimas

* **Unidades humanas**: "10.50" (2 casas) ou "1.234567" (6 casas). Vêm de UX, PSP, planilhas.
* **Unidades mínimas**: inteiros escalados por `10^decimais` (centavos, microunits, lamports etc.).
* **Conversão**: humano → *toMinor* (string/number → `bigint`), e *fromMinor* (bigint → string).

> A lib **não usa ENV**; você informa os decimais ou resolve via *registry* da sua app.

---

## 3) Começando com `precise-money`

Instalação:

```bash
npm i precise-money
```

APIs principais (núcleo):

* `toMinor(human, decimals, opts?) : bigint`
* `fromMinor(minor, decimals) : string`
* `scaleUnits(u, fromDec, toDec, { mode? }) : bigint`
* `priceRatioDecimals(quoteDecimals, priceStr) : { num, den }`
* `convertUnitsByDecimals(amount, fromDec, toDec, price, mode?) : bigint`
* `applyBps(units, bps, mode?) : bigint`
* `slippageDown(units, bps) : bigint` / `slippageUp(units, bps) : bigint`
* `mulDiv(a, b, c, mode?) : bigint`
* `divToDecimalString(numer, denom, scale?) : string`

**Rounding**: `'floor' | 'ceil' | 'round' | 'bankers'`. Padrão: `'round'` (half‑up).

Adapters opcionais (azulejos finos):

* `adapters/evm.ts` (passa `decimals` do ERC‑20)
* `adapters/solana.ts` (default 9; muitos SPL mints usam 6/9)
* `adapters/stellar.ts` (default 7)
* `adapters/cosmos.ts` (default típico 6)

> Os adapters só embrulham `toMinor/fromMinor` com defaults úteis. Em produção, **descubra os decimais reais** do ativo (ERC‑20 `decimals()`, mint account SPL, issuer/asset em Stellar etc.).

---

## 4) Registry de decimais na **sua app**

A lib trabalha por **decimals (number)**. Para ergonomia por **símbolo**, crie um pequeno *shim* de app com um **registry**. Exemplo:

```ts
// src/money.ts — camada de app
import { toMinor as _toMinor, fromMinor as _fromMinor,
         priceRatioDecimals, convertUnitsByDecimals } from 'precise-money';

const DEC: Record<string, number> = { USD: 2, BRL: 2, USDC: 6, ETH: 18, XLM: 7, TOKEN: 7 };

function getDecimalsOrThrow(symbol: string): number {
  const d = DEC[symbol.toUpperCase()];
  if (d == null) throw new Error(`Missing decimals for symbol: ${symbol}`);
  return d;
}

export function toUnits(symbol: string, amount: string | number, opts?: { mode?: 'floor'|'ceil'|'round'|'bankers' }) {
  return _toMinor(amount, getDecimalsOrThrow(symbol), opts);
}

export function fromUnits(symbol: string, minor: bigint | string | number) {
  const d = getDecimalsOrThrow(symbol);
  const b = typeof minor === 'bigint' ? minor : BigInt(String(minor));
  return _fromMinor(b, d);
}

export function buildPriceRatio(quote: string, _base: string, priceStr: string) {
  return priceRatioDecimals(getDecimalsOrThrow(quote), priceStr);
}

export function convertUnits(amountMinor: bigint, from: string, to: string, price: {num: bigint; den: bigint}) {
  return convertUnitsByDecimals(amountMinor, getDecimalsOrThrow(from), getDecimalsOrThrow(to), price);
}
```

Com isso, seu código de domínio fica legível:

```ts
const usd = toUnits('USD', '10.50');        // 1050n
const pr  = buildPriceRatio('USD', 'TOKEN', '5.25');
const out = convertUnits(usd, 'USD', 'TOKEN', pr); // (10.50/5.25)*10^7
```

---

## 5) Recebendo entrada humana com segurança

`toMinor` aceita formatos comuns e normaliza:

* "1.234,56" → `1234.56`
* "1\_234.56" → `1234.56`
* espaços/underscores ignorados; último `.`/`,` é o separador decimal; milhar é removido.

Exemplos:

```ts
toMinor('10.50', 2)      // 1050n
toMinor('1.234,567', 6)  // 1234567n
toMinor('-0.01', 2)      // -1n
```

**Rounding** (quando há mais casas que `decimals`):

```ts
toMinor('1.2345678', 6, { mode: 'floor' }) // 1234567n
toMinor('1.2345678', 6, { mode: 'ceil'  }) // 1234568n
// default 'round' (half‑up)
```

> **Rejeite floats no input**: trate tudo como **string** até converter para `bigint`.

---

## 6) Exibindo valores para humanos

Use `fromMinor` e, se quiser agrupamento/locale, `Intl.NumberFormat`:

```ts
const s = fromMinor(12345678n, 6); // "12.345678"
const [i, f = ''] = s.split('.');
const shown = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: f.length, maximumFractionDigits: f.length }).format(Number(`${i}.${f}`));
// → "12,345678"
```

> Para inteiros gigantes (não cabem em `Number`), mostre `fromMinor` diretamente, ou formate apenas a parte inteira manualmente.

---

## 7) Cotações e conversões entre ativos

**Preço** = QUOTE por 1 BASE (ex.: `USD/TOKEN = 5.25`).

```ts
const pr = priceRatioDecimals(2, '5.25'); // quoteDecimals=2 (USD)
// { num: 525n, den: 100n } → 5.25 = 525/100
```

Converter quantias:

```ts
const usd = toMinor('10.50', 2); // 1050n
const token = convertUnitsByDecimals(usd, 2, 7, pr); // USD (2) → TOKEN (7)
```

**Dicas**:

* Para inverter (quer preço `BASE/QUOTE`), troque `{ num, den }` na chamada.
* Arredondamento em `convertUnitsByDecimals` é configurável (padrão `'round'`).

---

## 8) Slippage, basis points (BPS) e cotações de swap

* **BPS**: 1% = 100 bps. 0,25% = 25 bps.
* **EXACT\_IN** (você fixa `amountIn` e quer proteger o **mínimo** de saída): `minOut = slippageDown(expectedOut, bps)`
* **EXACT\_OUT** (você quer um `amountOut` e precisa proteger o **máximo** de entrada): `maxIn = slippageUp(targetOut, bps)`

Exemplo:

```ts
const expectedOut = 1_234_567n;         // em unidades mínimas do token OUT
const minOut = slippageDown(expectedOut, 50); // 0.5% de proteção
```

Aplicar fee/porcentagem sobre quantia:

```ts
const fee = applyBps(toMinor('100', 2), 25); // 25 bps de 100.00 → 0.25 → 25n
```

Cálculo seguro de razão:

```ts
const part = mulDiv(10_000n, 3, 7, 'round'); // (10000*3)/7 com arred.
```

---

## 9) Interação com blockchains (adapters)

**EVM** (ERC‑20): obtenha `decimals()` do contrato.

```ts
import { evmToMinor, evmFromMinor } from 'precise-money/adapters/evm';
// evmToMinor('1.23', 6) → 1230000n
```

**Solana**: nativo SOL = 9; SPL mints tipicamente 6 ou 9. Busque `mint.decimals`.

```ts
import { solanaToMinor } from 'precise-money/adapters/solana';
solanaToMinor('0.5', 9); // 500000000n
```

**Stellar** clássico: default 7 (verifique o asset/issuer).

```ts
import { stellarToMinor } from 'precise-money/adapters/stellar';
stellarToMinor('1', 7); // 10_000_00n
```

**Cosmos**: muitos denoms usam 6 (confirme na chain/IBC denom).

**Fluxo recomendado**:

1. UI/PSP → `toMinor(human, decimals)`
2. **DB** (BIGINT) → ledger/wallet
3. Assinou/Tx: use unidades mínimas corretas da chain.

> Evite misturar escalas: *converta para a escala on‑chain apenas na borda* (no adapter/SDK) e volte para a escala de negócio na entrada/saída.

---

## 10) Integração com PSPs/fiat

* FIAT quase sempre **2 casas** (BRL/USD/EUR), mas confirme!
* Ao receber webhooks CSV/JSON com strings tipo "10.505", **defina o rounding** (ex.: `'round'` para usuário, `'floor'` para cobrança conservadora) e documente.

Exemplo BRL:

```ts
const cents = toMinor('10,50', 2);  // 1050n
const shown = fromMinor(cents, 2);  // "10.50"
```

---

## 11) Persistência & APIs

**Postgres**:

* Quantias: `BIGINT`.
* Evite `NUMERIC` em hot‑path. Se usar, **trate como string** no Node.

**Parsers (node‑pg)**:

```ts
import pg from 'pg';
pg.types.setTypeParser(20, (v) => BigInt(v));     // BIGINT → BigInt
pg.types.setTypeParser(1700, (v) => String(v));   // NUMERIC → string
```

**JSON**: sempre strings para dinheiro; `bigint` não serializa.

---

## 12) Erros comuns (anti‑padrões)

* Usar `number` para dinheiro → **não faça**.
* Misturar escalas (6 vs 7 vs 18) no mesmo serviço.
* Arredondar implicitamente (sem declarar o `mode`).
* Somar/preço médio com floats; some **quantias** e derive preço no fim.
* Converter cedo demais para on‑chain; deixe a conversão para a borda.

---

## 13) Receitas rápidas (copy/paste)

**A) Quote EXACT\_IN (DEX)**

```ts
const inHuman  = '100.00';   // USD
const inDec    = 2;
const outDec   = 7;          // TOKEN
const price    = priceRatioDecimals(inDec, '5.43'); // USD/TOKEN
const inMinor  = toMinor(inHuman, inDec);
const expOut   = convertUnitsByDecimals(inMinor, inDec, outDec, price);
const minOut   = slippageDown(expOut, 50); // 0.5%
```

**B) Quote EXACT\_OUT (quanto pagar no máximo)**

```ts
const wantOut  = toMinor('1.0000000', 7);  // TOKEN
const maxIn    = slippageUp(wantOut, 75);  // 0.75%
```

**C) Fee em BPS**

```ts
const gross = toMinor('250', 2);  // R$250
const fee   = applyBps(gross, 180); // 1.80%
const net   = gross - fee;
```

**D) Preço médio (fiat por unidade)**

```ts
function avgFiatPricePerUnit({ filledQtyMinor, spentFiatMinor, outDecimals, fiatDecimals }:{ filledQtyMinor: bigint; spentFiatMinor: bigint; outDecimals: number; fiatDecimals: number; }){
  const scale = 10n ** BigInt(fiatDecimals + outDecimals);
  const num = spentFiatMinor * scale;
  const den = filledQtyMinor === 0n ? 1n : filledQtyMinor;
  return divToDecimalString(num, den, fiatDecimals + outDecimals);
}
```

---

## 14) Testes mínimos

* `toMinor/fromMinor`: positivos/negativos, vírgula decimal, excesso de casas (todas as `mode`).
* `mulDiv`: sinais e divisões não exatas.
* `applyBps`, `slippageDown/Up`.
* `priceRatioDecimals` + `convertUnitsByDecimals` (2→6/7/18, arredondamentos).

Sugestão (Vitest):

```ts
import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, convertUnitsByDecimals, priceRatioDecimals } from 'precise-money';

describe('money', () => {
  it('round trip', () => {
    const m = toMinor('1.234567', 6);
    expect(fromMinor(m, 6)).toBe('1.234567');
  });
});
```

---

## 15) Checklist de produção

*

---

## 16) FAQ

**Posso usar ********`decimal.js`********/********`bignumber.js`****\*\*\*\*?**
Para exibição/UX, sim. Para ledger/contrato/PSP, prefira `bigint` (sem ponto flutuante).

**Como lido com preços (decimais variáveis)?**
Use `priceRatioDecimals(quoteDecimals, priceStr)` → `{num,den}`. Converta quantias com `convertUnitsByDecimals`.

**Posso misturar ********`number`******** e ********`bigint`********?**
Não. Converta `number` para `BigInt` primeiro: `BigInt(myNumber)` (cuidado com limites de `number`).

**Qual rounding devo usar?**
Default `'round'` (half‑up). Para *maxIn* use `ceil`; para *minOut* use `floor`/slippage.

---

> **Disclaimer**: este tutorial é técnico, não é conselho financeiro. Teste seus fluxos em ambientes de staging/testnet. Erros de decimais/rounding causam perdas. Versione suas regras de arredondamento.

Feliz construção! 🚀
