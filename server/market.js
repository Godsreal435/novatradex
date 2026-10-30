/**
 * Simulated market data.
 *
 * IMPORTANT: prices here are generated locally from a fixed reference table with a
 * deterministic daily drift. They are NOT live exchange quotes and must never be
 * presented as real market data. Every API response that includes a quote carries
 * `simulated: true` so the UI can label it.
 */

export const INSTRUMENTS = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'forex', basePrice: 1.0875, precision: 4, quoteUnit: 'units' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'forex', basePrice: 1.2712, precision: 4, quoteUnit: 'units' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'forex', basePrice: 156.42, precision: 2, quoteUnit: 'units' },
  { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', assetClass: 'forex', basePrice: 0.6628, precision: 4, quoteUnit: 'units' },
  { symbol: 'BTC/USD', name: 'Bitcoin', assetClass: 'crypto', basePrice: 67420.5, precision: 2, quoteUnit: 'BTC' },
  { symbol: 'ETH/USD', name: 'Ethereum', assetClass: 'crypto', basePrice: 3520.8, precision: 2, quoteUnit: 'ETH' },
  { symbol: 'SOL/USD', name: 'Solana', assetClass: 'crypto', basePrice: 172.35, precision: 2, quoteUnit: 'SOL' },
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stocks', basePrice: 226.14, precision: 2, quoteUnit: 'shares' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'stocks', basePrice: 121.85, precision: 2, quoteUnit: 'shares' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', assetClass: 'stocks', basePrice: 244.6, precision: 2, quoteUnit: 'shares' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'stocks', basePrice: 428.9, precision: 2, quoteUnit: 'shares' },
  { symbol: 'XAU/USD', name: 'Gold Spot', assetClass: 'gold', basePrice: 2385.4, precision: 2, quoteUnit: 'oz' },
  { symbol: 'XAG/USD', name: 'Silver Spot', assetClass: 'gold', basePrice: 28.65, precision: 3, quoteUnit: 'oz' },
];

const BY_SYMBOL = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));

export const ASSET_CLASSES = [
  {
    id: 'forex',
    label: 'Forex',
    headline: 'Major currency pairs, institutional spreads',
    blurb:
      'Model positions across the world’s most liquid currency pairs with tight simulated spreads, deep liquidity assumptions and 24/5 market access.',
  },
  {
    id: 'crypto',
    label: 'Cryptocurrency',
    headline: 'Digital assets, always-on markets',
    blurb:
      'Build exposure to Bitcoin, Ethereum and high-capability layer-one networks with round-the-clock simulated execution and transparent position tracking.',
  },
  {
    id: 'stocks',
    label: 'Stocks',
    headline: 'Global equities, fractional exposure',
    blurb:
      'Research and model equity strategies across mega-cap technology and industrial leaders with fractional sizing and instant portfolio attribution.',
  },
  {
    id: 'gold',
    label: 'Gold',
    headline: 'Precious metals, capital preservation',
    blurb:
      'Diversify with spot gold and silver exposure — the classic hedge against volatility, inflation and currency debasement.',
  },
];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Deterministic daily simulated drift, stable for the whole UTC day. */
export function quote(symbol) {
  const instrument = BY_SYMBOL.get(String(symbol || '').toUpperCase());
  if (!instrument) return null;
  const day = new Date().toISOString().slice(0, 10);
  const hour = new Date().getUTCHours();
  const seed = fnv1a(`${instrument.symbol}:${day}`);

  const dayChangePct = ((seed % 5200) / 1000) - 2.6; // -2.6% .. +2.6%
  const wobblePct = (((fnv1a(`${instrument.symbol}:${day}:${hour}`) % 700) / 1000) - 0.35) * 0.25;
  const price = round(instrument.basePrice * (1 + (dayChangePct + wobblePct) / 100), instrument.precision);
  const open = round(instrument.basePrice * (1 + dayChangePct / 100), instrument.precision);
  const spreadPct = instrument.assetClass === 'forex' ? 0.00025 : 0.0012;

  return {
    symbol: instrument.symbol,
    name: instrument.name,
    assetClass: instrument.assetClass,
    quoteUnit: instrument.quoteUnit,
    precision: instrument.precision,
    price,
    open,
    dayChangePct: round(((price - open) / open) * 100, 2),
    bid: round(price * (1 - spreadPct / 2), instrument.precision),
    ask: round(price * (1 + spreadPct / 2), instrument.precision),
    simulated: true,
  };
}

export function allQuotes() {
  return INSTRUMENTS.map((i) => quote(i.symbol));
}

export function isValidSymbol(symbol) {
  return BY_SYMBOL.has(String(symbol || '').toUpperCase());
}

export function instrument(symbol) {
  return BY_SYMBOL.get(String(symbol || '').toUpperCase()) || null;
}
