require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const { registerMobileApi } = require('./mobile-api');
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(express.json({ limit: '400kb' }));
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');

  const origin = req.get('Origin');
  if (!origin || process.env.NODE_ENV !== 'production') return next();
  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'This website origin is not allowed.' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-BXC-Pairing-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
if (process.env.NODE_ENV !== 'production') app.use(express.static(__dirname));

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FCS_API_KEY = process.env.FCS_API_KEY;
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;
const BINANCE_ALLOWED_UIDS = new Set(
  (process.env.BINANCE_ALLOWED_UIDS || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean)
);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

app.post('/api/card-request-email', async (req, res) => {
  if (!FIREBASE_WEB_API_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return res.status(503).json({ error: 'Card request email is not configured on the server.' });
  }

  const authorization = req.get('authorization') || '';
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return res.status(401).json({ error: 'Sign in to send a card request.' });

  let firebaseAccount;
  try {
    const accountResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      { idToken },
      { timeout: 10000 }
    );
    firebaseAccount = accountResponse.data.users?.[0];
  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(401).json({ error: 'Your sign-in session is invalid or expired. Sign in again.' });
    }
    console.error('Firebase token verification failed for card request email:', error.message);
    return res.status(502).json({ error: 'Could not verify your account. Try again later.' });
  }

  if (!firebaseAccount?.localId) {
    return res.status(401).json({ error: 'Your signed-in account could not be verified.' });
  }

  const { material, cardStyle, styleId, engravingText, designNote, designImageData } = req.body || {};
  const allowedStyles = {
    'silver-metal': { material: 'Metal', cardStyle: 'Silver Metal' },
    'black-metal': { material: 'Metal', cardStyle: 'Black Metal' },
    'bronze-metal': { material: 'Metal', cardStyle: 'Bronze Metal' },
    'white-plastic-regular': { material: 'Plastic', cardStyle: 'White Regular' }
  };
  const style = allowedStyles[styleId];
  if (!style || material !== style.material || cardStyle !== style.cardStyle) {
    return res.status(400).json({ error: 'Choose a valid card design before sending your request.' });
  }
  if (typeof engravingText !== 'string' || !engravingText.trim() || engravingText.trim().length > 20) {
    return res.status(400).json({ error: 'Enter a card name of 1 to 20 characters.' });
  }
  if (typeof designNote !== 'string' || designNote.length > 300) {
    return res.status(400).json({ error: 'Design notes must be 300 characters or fewer.' });
  }
  if (typeof designImageData !== 'string' || designImageData.length > 240000
    || (designImageData && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(designImageData))) {
    return res.status(400).json({ error: 'The card design image is invalid or too large.' });
  }

  const username = firebaseAccount.displayName || firebaseAccount.email || firebaseAccount.localId;
  const safeStyle = escapeHtml(cardStyle);
  const safeMaterial = escapeHtml(material);
  const safeName = escapeHtml(engravingText.trim());
  const safeUsername = escapeHtml(username);
  const safeNote = escapeHtml(designNote.trim() || 'None').replace(/\n/g, '<br>');
  const preview = designImageData
    ? `<h2>Card design preview</h2><img src="${designImageData}" alt="Uploaded card design preview" style="display:block;max-width:560px;width:100%;height:auto;border:1px solid #ccc;border-radius:16px">`
    : '<p>No design image was uploaded.</p>';
  const text = [
    'A new ATM card request was submitted.',
    `Account: ${username} (${firebaseAccount.localId})`,
    `Material: ${material}`,
    `Card design: ${cardStyle}`,
    `Name on card: ${engravingText.trim()}`,
    `Design notes: ${designNote.trim() || 'None'}`,
    designImageData ? 'The uploaded design is attached.' : 'No design image was uploaded.'
  ].join('\n');

  try {
    await axios.post('https://api.resend.com/emails', {
      from: RESEND_FROM_EMAIL,
      to: ['billionairesxchange@gmail.com'],
      subject: `ATM card request: ${cardStyle} - ${engravingText.trim()}`,
      text,
      html: `<h1>New ATM card request</h1><dl><dt>Account</dt><dd>${safeUsername} (${escapeHtml(firebaseAccount.localId)})</dd><dt>Material</dt><dd>${safeMaterial}</dd><dt>Card design</dt><dd>${safeStyle}</dd><dt>Name on card</dt><dd>${safeName}</dd><dt>Design notes</dt><dd>${safeNote}</dd></dl>${preview}`,
      ...(designImageData ? {
        attachments: [{
          filename: 'card-design-preview.jpg',
          content: designImageData.slice('data:image/jpeg;base64,'.length)
        }]
      } : {})
    }, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      timeout: 15000
    });
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error('Resend failed to send ATM card request:', error.response?.data || error.message);
    return res.status(502).json({ error: 'Your card request was saved, but the email notification could not be sent.' });
  }
});

app.post('/api/bill-payment-email', async (req, res) => {
  if (!FIREBASE_WEB_API_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return res.status(503).json({ error: 'Bill payment email is not configured on the server.' });
  }

  const authorization = req.get('authorization') || '';
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return res.status(401).json({ error: 'Sign in to email your bill payment request.' });

  let firebaseAccount;
  try {
    const accountResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      { idToken },
      { timeout: 10000 }
    );
    firebaseAccount = accountResponse.data.users?.[0];
  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(401).json({ error: 'Your sign-in session is invalid or expired. Sign in again.' });
    }
    console.error('Firebase token verification failed for bill payment email:', error.message);
    return res.status(502).json({ error: 'Could not verify your account. Try again later.' });
  }

  if (!firebaseAccount?.localId) {
    return res.status(401).json({ error: 'Your signed-in account could not be verified.' });
  }

  const {
    country,
    company,
    currency,
    accountName,
    accountNumber,
    amount,
    billingPeriod,
    cryptoCurrency,
    paymentReference
  } = req.body || {};
  const companiesByCountry = {
    'United States': ['PG&E', 'ComEd', 'Duke Energy', 'Verizon', 'Xfinity'],
    'United Kingdom': ['British Gas', 'Vodafone', 'Thames Water', 'SSE', 'O2'],
    Canada: ['Hydro One', 'Bell', 'Rogers', 'Enbridge', 'Toronto Water'],
    Jamaica: ['JPS Co.', 'National Water Commission', 'FLOW', 'Digicel', 'Cable & Wireless'],
    'Trinidad & Tobago': ['T&TEC', 'WASA', 'FLOW', 'Digicel', 'Bmobile']
  };
  const allowedCurrencies = new Set(['USD', 'GBP', 'CAD', 'JMD', 'TTD']);
  const allowedCryptoCurrencies = new Set([
    'Bitcoin (BTC)',
    'Ethereum (ETH)',
    'Tether (USDT - TRC20)',
    'USD Coin (USDC - ERC20)'
  ]);
  const allowedBillingPeriods = new Set(['monthly', 'quarterly', 'annual']);

  if (typeof country !== 'string' || !companiesByCountry[country]
    || typeof company !== 'string' || !companiesByCountry[country].includes(company)) {
    return res.status(400).json({ error: 'Choose a valid country and utility provider.' });
  }
  if (typeof currency !== 'string' || !allowedCurrencies.has(currency)) {
    return res.status(400).json({ error: 'Choose a valid bill currency.' });
  }
  if (typeof accountName !== 'string' || !accountName.trim() || accountName.trim().length > 100
    || /[\r\n<>]/.test(accountName)) {
    return res.status(400).json({ error: 'Enter a valid utility account name.' });
  }
  if (typeof accountNumber !== 'string' || !/^[A-Za-z0-9 -]{1,64}$/.test(accountNumber.trim())) {
    return res.status(400).json({ error: 'Enter a valid utility account number.' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ error: 'Enter a bill amount greater than zero and no more than 1,000,000.' });
  }
  if (typeof billingPeriod !== 'string' || !allowedBillingPeriods.has(billingPeriod)) {
    return res.status(400).json({ error: 'Choose a valid billing period.' });
  }
  if (typeof cryptoCurrency !== 'string' || !allowedCryptoCurrencies.has(cryptoCurrency)) {
    return res.status(400).json({ error: 'Choose a valid cryptocurrency.' });
  }
  if (typeof paymentReference !== 'string' || !/^BILL-[0-9A-F]{8}$/.test(paymentReference)) {
    return res.status(400).json({ error: 'The payment request reference is invalid. Please retry.' });
  }

  const requestDetails = {
    country,
    company,
    currency,
    accountName: accountName.trim(),
    accountNumber: accountNumber.trim(),
    amount: amount.toFixed(2),
    billingPeriod,
    cryptoCurrency,
    paymentReference,
    customerEmail: firebaseAccount.email || 'Not provided',
    firebaseUid: firebaseAccount.localId
  };
  const safeDetails = Object.fromEntries(
    Object.entries(requestDetails).map(([key, value]) => [key, escapeHtml(value)])
  );
  const text = [
    'A utility bill payment request was submitted. No payment has been received or processed.',
    `Reference: ${requestDetails.paymentReference}`,
    `Customer: ${requestDetails.accountName}`,
    `Customer email: ${requestDetails.customerEmail}`,
    `Firebase account ID: ${requestDetails.firebaseUid}`,
    `Country: ${requestDetails.country}`,
    `Utility provider: ${requestDetails.company}`,
    `Utility account number: ${requestDetails.accountNumber}`,
    `Bill amount: ${requestDetails.currency} ${requestDetails.amount}`,
    `Billing period: ${requestDetails.billingPeriod}`,
    `Cryptocurrency selected: ${requestDetails.cryptoCurrency}`,
    `Payment message: Utility bill payment - ${requestDetails.company} - ${requestDetails.billingPeriod} - ${requestDetails.paymentReference}`,
    'Status: Request only. No cryptocurrency has been transferred.'
  ].join('\n');

  try {
    await axios.post('https://api.resend.com/emails', {
      from: RESEND_FROM_EMAIL,
      to: ['billionairesxchange@gmail.com'],
      subject: `Utility bill payment request ${requestDetails.paymentReference} - unpaid`,
      text,
      html: `<h1>Utility bill payment request</h1><p><strong>Request only. No payment has been received or processed.</strong></p><dl>
        <dt>Reference</dt><dd>${safeDetails.paymentReference}</dd>
        <dt>Customer</dt><dd>${safeDetails.accountName}</dd>
        <dt>Customer email</dt><dd>${safeDetails.customerEmail}</dd>
        <dt>Firebase account ID</dt><dd>${safeDetails.firebaseUid}</dd>
        <dt>Country</dt><dd>${safeDetails.country}</dd>
        <dt>Utility provider</dt><dd>${safeDetails.company}</dd>
        <dt>Utility account number</dt><dd>${safeDetails.accountNumber}</dd>
        <dt>Bill amount</dt><dd>${safeDetails.currency} ${safeDetails.amount}</dd>
        <dt>Billing period</dt><dd>${safeDetails.billingPeriod}</dd>
        <dt>Cryptocurrency selected</dt><dd>${safeDetails.cryptoCurrency}</dd>
        <dt>Payment message</dt><dd>Utility bill payment - ${safeDetails.company} - ${safeDetails.billingPeriod} - ${safeDetails.paymentReference}</dd>
      </dl><p>No cryptocurrency has been transferred.</p>`
    }, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      timeout: 15000
    });
    return res.status(200).json({ sent: true, paymentReference: requestDetails.paymentReference });
  } catch (error) {
    console.error('Resend failed to send bill payment request:', error.message);
    return res.status(502).json({ error: 'Your bill payment request could not be emailed. Please try again.' });
  }
});

// Example REST endpoint for current price
app.get('/api/price/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

const eodhdCache = new Map();
const stockProviderCache = new Map();
const EODHD_EXCHANGES_CACHE_TTL = 24 * 60 * 60 * 1000;
const EODHD_STOCKS_CACHE_TTL = 6 * 60 * 60 * 1000;
const STOCK_PROVIDER_CACHE_TTL = 24 * 60 * 60 * 1000;
const FEATURED_STOCK_MARKETS = {
  USA: { iso2: 'US', name: 'United States', displayName: 'America', market: 'NYSE / Nasdaq' },
  BRB: { iso2: 'BB', name: 'Barbados', market: 'Barbados Stock Exchange' },
  CYM: { iso2: 'KY', name: 'Cayman Islands', displayName: 'Cayman', market: 'Cayman Islands Stock Exchange' },
  CUB: { iso2: 'CU', name: 'Cuba', market: 'No public stock exchange listings' },
  PRI: { iso2: 'PR', name: 'Puerto Rico', market: 'U.S. exchanges; no separate Puerto Rico exchange' },
  JAM: { iso2: 'JM', name: 'Jamaica', market: 'Jamaica Stock Exchange' },
  GBR: { iso2: 'GB', name: 'United Kingdom', displayName: 'UK', market: 'London Stock Exchange' },
  IND: { iso2: 'IN', name: 'India', market: 'NSE / BSE' }
};

async function getCachedStockValue(cache, key, ttl, load) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const entry = { expiresAt: Date.now() + ttl };
  entry.promise = Promise.resolve().then(load).then((value) => {
    if (Array.isArray(value?.warnings) && value.warnings.length) {
      entry.expiresAt = Date.now() + 60 * 1000;
    }
    return value;
  }).catch((error) => {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  });
  cache.set(key, entry);
  return entry.promise;
}

function getCachedEodhdValue(key, ttl, load) {
  return getCachedStockValue(eodhdCache, key, ttl, load);
}

function getCachedProviderValue(key, ttl, load) {
  return getCachedStockValue(stockProviderCache, key, ttl, load);
}

async function fetchEodhd(path, params = {}) {
  if (!EODHD_API_TOKEN) {
    const error = new Error('Global stock listings are not configured. Set EODHD_API_TOKEN on the server.');
    error.statusCode = 503;
    throw error;
  }
  try {
    const response = await axios.get(`https://eodhd.com/api/${path}`, {
      params: { ...params, api_token: EODHD_API_TOKEN, fmt: 'json' },
      timeout: 30000,
      maxContentLength: 20 * 1024 * 1024
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    console.error('EODHD stock data request failed:', status || error.message);
    const requestError = new Error(status === 429
      ? 'The stock-data provider rate limit was reached. Try again later.'
      : `The stock-data provider request failed${status ? ` (${status})` : ''}.`);
    requestError.statusCode = status === 429 ? 429 : 502;
    throw requestError;
  }
}

async function getEodhdCountries() {
  return getCachedEodhdValue('eodhd-countries', EODHD_EXCHANGES_CACHE_TTL, async () => {
    if (!EODHD_API_TOKEN) {
      return Object.entries(FEATURED_STOCK_MARKETS)
        .map(([code, featured]) => ({
          code,
          iso2: featured.iso2,
          name: featured.name,
          displayName: featured.displayName || featured.name,
          market: featured.market,
          exchanges: []
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
    }
    const data = await fetchEodhd('exchanges-list/');
    if (!Array.isArray(data)) throw new Error('The stock-data provider returned an invalid exchange list.');
    const countries = new Map();
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    data.forEach((exchange) => {
      const code = String(exchange.Code || '').trim();
      const countryCode = String(exchange.CountryISO3 || '').trim().toUpperCase();
      const countryIso2 = String(exchange.CountryISO2 || '').trim().toUpperCase();
      const providerCountryName = String(exchange.Country || '').trim();
      const localizedCountryName = /^[A-Z]{2}$/.test(countryIso2) ? regionNames.of(countryIso2) : '';
      const name = localizedCountryName && localizedCountryName !== countryIso2
        ? localizedCountryName
        : providerCountryName;
      if (!code || !/^[A-Z0-9._-]{1,16}$/i.test(code) || !/^[A-Z]{3}$/.test(countryCode) || !name || name === 'Unknown') return;
      if (!countries.has(countryCode)) {
        countries.set(countryCode, { code: countryCode, iso2: countryIso2, name, exchanges: [] });
      }
      countries.get(countryCode).exchanges.push({
        code,
        name: String(exchange.Name || code),
        operatingMic: String(exchange.OperatingMIC || '')
      });
    });
    Object.entries(FEATURED_STOCK_MARKETS).forEach(([code, featured]) => {
      const country = countries.get(code) || {
        code,
        iso2: featured.iso2,
        name: featured.name,
        exchanges: []
      };
      country.iso2 = country.iso2 || featured.iso2;
      country.name = featured.name;
      country.displayName = featured.displayName || featured.name;
      country.market = featured.market;
      countries.set(code, country);
    });
    return Array.from(countries.values())
      .map((country) => ({
        ...country,
        exchanges: country.exchanges.sort((left, right) => left.name.localeCompare(right.name))
      }))
      .sort((left, right) => (left.displayName || left.name).localeCompare(right.displayName || right.name));
  });
}

const STOCK_COUNTRY_ALIASES = new Map([
  ['US', 'USA'], ['USA', 'USA'], ['UNITED STATES', 'USA'], ['UNITED STATES OF AMERICA', 'USA'], ['AMERICA', 'USA'],
  ['BB', 'BRB'], ['BRB', 'BRB'], ['BARBADOS', 'BRB'],
  ['KY', 'CYM'], ['CYM', 'CYM'], ['CAYMAN', 'CYM'], ['CAYMAN ISLANDS', 'CYM'],
  ['CU', 'CUB'], ['CUB', 'CUB'], ['CUBA', 'CUB'],
  ['PR', 'PRI'], ['PRI', 'PRI'], ['PUERTO RICO', 'PRI'],
  ['JM', 'JAM'], ['JAM', 'JAM'], ['JAMAICA', 'JAM'],
  ['GB', 'GBR'], ['GBR', 'GBR'], ['UK', 'GBR'], ['UNITED KINGDOM', 'GBR'], ['GREAT BRITAIN', 'GBR'],
  ['IN', 'IND'], ['IND', 'IND'], ['INDIA', 'IND']
]);
const STOCK_EXCHANGE_ALIASES = new Map([
  ['NASDAQGS', 'NASDAQ'], ['NASDAQGM', 'NASDAQ'], ['NASDAQCM', 'NASDAQ'], ['NASDAQSTOCKMARKET', 'NASDAQ'],
  ['NEWYORKSTOCKEXCHANGE', 'NYSE'], ['LONDONSTOCKEXCHANGE', 'LSE'],
  ['JAMAICASTOCKEXCHANGE', 'JSE'], ['JAMAICASTOCKEXCHANGELIMITED', 'JSE']
]);

function normalizeStockCountryCode(value) {
  return STOCK_COUNTRY_ALIASES.get(String(value || '').trim().toUpperCase()) || '';
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

async function getAlphaVantageUsListings() {
  if (!ALPHA_VANTAGE_API_KEY) throw new Error('Alpha Vantage is not configured. Set ALPHA_VANTAGE_API_KEY on the server.');
  return getCachedProviderValue('alpha-vantage:active-listings', STOCK_PROVIDER_CACHE_TTL, async () => {
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: { function: 'LISTING_STATUS', state: 'active', apikey: ALPHA_VANTAGE_API_KEY },
      responseType: 'text',
      timeout: 30000,
      maxContentLength: 20 * 1024 * 1024
    });
    if (typeof response.data !== 'string' || !response.data.includes('\n')) {
      throw new Error('Alpha Vantage returned an invalid active listing file.');
    }
    const [header, ...records] = parseCsvRows(response.data);
    if (!header) throw new Error('Alpha Vantage returned an empty active listing file.');
    const columns = new Map(header.map((value, index) => [value.trim().toLowerCase(), index]));
    if (!columns.has('symbol') || !columns.has('name')) {
      throw new Error('Alpha Vantage returned an active listing file without symbol and name columns.');
    }
    const field = (record, name) => record[columns.get(name)] || '';
    const listings = records.flatMap((record) => {
      const symbol = field(record, 'symbol').trim();
      const name = field(record, 'name').trim();
      const assetType = field(record, 'assettype').trim();
      if (assetType && !/(stock|equity)/i.test(assetType)) return [];
      if (!symbol || !name) return [];
      return [{
        symbol,
        name,
        sector: assetType || 'Stock',
        exchange: field(record, 'exchange').trim() || 'Alpha Vantage',
        currency: '',
        sources: ['Alpha Vantage']
      }];
    });
    return { listings, warnings: [] };
  });
}

async function getFcsStockCatalog() {
  if (!FCS_API_KEY) throw new Error('FCS API is not configured. Set FCS_API_KEY on the server.');
  return getCachedProviderValue('fcs:stock-list', STOCK_PROVIDER_CACHE_TTL, async () => {
    const response = await axios.get('https://api-v4.fcsapi.com/stock/list', {
      params: { access_key: FCS_API_KEY },
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024
    });
    const payload = response.data;
    if (payload?.status === false || payload?.status === 'false') {
      throw new Error(payload.msg || 'FCS API rejected the stock listing request.');
    }
    const rows = Array.isArray(payload)
      ? payload
      : [
        payload?.response,
        payload?.data,
        payload?.stocks,
        payload?.result,
        payload?.response?.data,
        payload?.data?.items
      ].find(Array.isArray);
    if (!Array.isArray(rows)) throw new Error('FCS API returned an invalid stock catalog.');
    return rows;
  });
}

function getFcsListingsForCountry(rows, countryCode) {
  return rows.flatMap((record) => {
    const recordCountryCode = normalizeStockCountryCode(
      record.country_code || record.country_iso2 || record.country_iso3 || record.iso2 || record.country || record.country_name
    );
    const symbol = String(record.symbol || record.ticker || record.code || '').trim();
    const name = String(record.name || record.company_name || record.description || '').trim();
    if (recordCountryCode !== countryCode || !symbol || !name) return [];
    return [{
      symbol,
      name,
      sector: String(record.sector || record.type || 'Stock'),
      exchange: String(record.exchange || record.exchange_code || record.market || 'FCS API'),
      currency: String(record.currency || ''),
      sources: ['FCS API']
    }];
  });
}

async function getUpstoxIndiaListings() {
  return getCachedProviderValue('upstox:india-equities', STOCK_PROVIDER_CACHE_TTL, async () => {
    const response = await axios.get('https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz', {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024
    });
    const compressed = Buffer.from(response.data);
    const json = compressed[0] === 0x1f && compressed[1] === 0x8b
      ? require('zlib').gunzipSync(compressed).toString('utf8')
      : compressed.toString('utf8');
    const instruments = JSON.parse(json);
    if (!Array.isArray(instruments)) throw new Error('Upstox returned an invalid instrument catalog.');
    const listings = instruments.flatMap((instrument) => {
      const exchange = String(instrument.exchange || '').toUpperCase();
      if (!['NSE', 'BSE'].includes(exchange) || instrument.instrument_type !== 'EQ') return [];
      const symbol = String(instrument.trading_symbol || '').trim();
      const name = String(instrument.name || instrument.short_name || '').trim();
      if (!symbol || !name) return [];
      return [{
        symbol,
        name,
        sector: 'Equity',
        exchange,
        currency: 'INR',
        sources: ['Upstox']
      }];
    });
    return { listings, warnings: [] };
  });
}

async function getEodhdStockListings(country) {
  if (!EODHD_API_TOKEN) {
    throw new Error('EOD Historical Data is not configured. Set EODHD_API_TOKEN on the server.');
  }
  if (!country.exchanges.length) return { listings: [], warnings: [] };
  const queue = [...country.exchanges];
  const listings = [];
  const warnings = [];
  const worker = async () => {
    while (queue.length) {
      const exchange = queue.shift();
      for (const instrumentType of ['stock', 'preferred_stock']) {
        try {
          const data = await fetchEodhd(`exchange-symbol-list/${encodeURIComponent(exchange.code)}`, { type: instrumentType });
          if (!Array.isArray(data)) throw new Error('Invalid stock listing response.');
          data.forEach((listing) => {
            const symbol = String(listing.Code || '').trim();
            const name = String(listing.Name || '').trim();
            if (!symbol || !name) return;
            listings.push({
              symbol,
              name,
              sector: String(listing.Type || 'Stock'),
              exchange: String(listing.Exchange || exchange.code),
              currency: String(listing.Currency || ''),
              sources: ['EOD Historical Data']
            });
          });
        } catch (error) {
          warnings.push(`${exchange.name} (${instrumentType}): ${error.message}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return { listings, warnings };
}

function mergeStockListings(listings) {
  const uniqueListings = new Map();
  listings.forEach((listing) => {
    const symbol = String(listing.symbol || '').trim();
    const exchange = String(listing.exchange || '').trim();
    if (!symbol || !exchange) return;
    const normalizedExchange = exchange.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const key = `${STOCK_EXCHANGE_ALIASES.get(normalizedExchange) || normalizedExchange}:${symbol.toUpperCase()}`;
    const existing = uniqueListings.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, ...listing.sources])];
      if ((!existing.name || existing.name === symbol) && listing.name) existing.name = listing.name;
      return;
    }
    uniqueListings.set(key, {
      ...listing,
      sources: [...new Set(listing.sources || [])]
    });
  });
  return Array.from(uniqueListings.values()).sort((left, right) =>
    left.name.localeCompare(right.name) || left.exchange.localeCompare(right.exchange) || left.symbol.localeCompare(right.symbol)
  );
}

app.get('/api/stocks/countries', async (_req, res) => {
  try {
    const countries = await getEodhdCountries();
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ countries });
  } catch (error) {
    const countries = Object.entries(FEATURED_STOCK_MARKETS).map(([code, featured]) => ({
      code,
      iso2: featured.iso2,
      name: featured.name,
      displayName: featured.displayName || featured.name,
      market: featured.market,
      exchanges: []
    }));
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ countries, warnings: [`EOD Historical Data exchanges could not be loaded: ${error.message}`] });
  }
});

app.get('/api/stocks/listings', async (req, res) => {
  const countryCode = String(req.query.country || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryCode)) {
    return res.status(400).json({ error: 'Choose a valid country code.' });
  }
  try {
    let countries;
    try {
      countries = await getEodhdCountries();
    } catch (error) {
      countries = Object.entries(FEATURED_STOCK_MARKETS).map(([code, featured]) => ({
        code,
        iso2: featured.iso2,
        name: featured.name,
        displayName: featured.displayName || featured.name,
        market: featured.market,
        exchanges: []
      }));
    }
    const country = countries.find((item) => item.code === countryCode);
    if (!country) return res.status(404).json({ error: 'No supported stock markets were found for this country.' });

    const result = await getCachedProviderValue(`stock-listings:${countryCode}`, EODHD_STOCKS_CACHE_TTL, async () => {
      const listings = [];
      const warnings = [];
      const sources = [
        ['EOD Historical Data', () => getEodhdStockListings(country)],
        ['FCS API', async () => ({
          listings: getFcsListingsForCountry(await getFcsStockCatalog(), countryCode),
          warnings: []
        })]
      ];
      if (countryCode === 'USA') sources.push(['Alpha Vantage', getAlphaVantageUsListings]);
      if (countryCode === 'IND') sources.push(['Upstox', getUpstoxIndiaListings]);

      await Promise.all(sources.map(async ([provider, load]) => {
        try {
          const providerResult = await load();
          listings.push(...providerResult.listings);
          warnings.push(...providerResult.warnings.map((warning) => `${provider}: ${warning}`));
        } catch (error) {
          warnings.push(`${provider}: ${error.message}`);
        }
      }));

      return {
        country: { code: country.code, name: country.name, market: country.market },
        listings: mergeStockListings(listings),
        warnings
      };
    });
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Country stock listings are unavailable.' });
  }
});

async function requireAllowedBinanceUser(req, res, next) {
  const idToken = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return res.status(401).json({ error: 'Sign in to use Binance account features.' });
  if (!FIREBASE_WEB_API_KEY) {
    return res.status(503).json({ error: 'Account verification is not configured on the server.' });
  }
  if (BINANCE_ALLOWED_UIDS.size === 0) {
    return res.status(503).json({ error: 'Binance access is not configured for any account.' });
  }

  let firebaseAccount;
  try {
    const accountResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      { idToken },
      { timeout: 10000 }
    );
    firebaseAccount = accountResponse.data.users?.[0];
  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(401).json({ error: 'Your sign-in session is invalid or expired. Sign in again.' });
    }
    console.error('Firebase token verification failed for Binance request:', error.message);
    return res.status(502).json({ error: 'Could not verify your account. Try again later.' });
  }

  if (!firebaseAccount?.localId) {
    return res.status(401).json({ error: 'Your signed-in account could not be verified.' });
  }
  if (!BINANCE_ALLOWED_UIDS.has(firebaseAccount.localId)) {
    return res.status(403).json({ error: 'This account is not authorized to use Binance account features.' });
  }
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    return res.status(503).json({ error: 'Binance credentials are not configured on the server.' });
  }

  req.firebaseAccount = firebaseAccount;
  next();
}

// Helper: sign query string
function signQuery(queryString) {
  return crypto.createHmac('sha256', BINANCE_API_SECRET)
               .update(queryString)
               .digest('hex');
}

// Place order endpoint
app.post('/api/order', requireAllowedBinanceUser, async (req, res) => {
  const { symbol, side, type, quantity, price } = req.body || {};
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const normalizedSide = typeof side === 'string' ? side.toUpperCase() : '';
  const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
  const orderQuantity = Number(quantity);
  const orderPrice = price === undefined || price === null || price === '' ? null : Number(price);

  if (!/^[A-Z0-9]{5,20}$/.test(normalizedSymbol)) {
    return res.status(400).json({ error: 'Enter a valid Binance trading symbol.' });
  }
  if (!['BUY', 'SELL'].includes(normalizedSide)) {
    return res.status(400).json({ error: 'Order side must be BUY or SELL.' });
  }
  if (!['MARKET', 'LIMIT'].includes(normalizedType)) {
    return res.status(400).json({ error: 'Order type must be MARKET or LIMIT.' });
  }
  if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
    return res.status(400).json({ error: 'Order quantity must be a positive number.' });
  }
  if (normalizedType === 'LIMIT' && (!Number.isFinite(orderPrice) || orderPrice <= 0)) {
    return res.status(400).json({ error: 'Limit orders require a positive price.' });
  }

  try {
    const params = new URLSearchParams({
      symbol: normalizedSymbol,
      side: normalizedSide,
      type: normalizedType,
      quantity: String(orderQuantity),
      timestamp: String(Date.now())
    });
    if (normalizedType === 'LIMIT') {
      params.set('price', String(orderPrice));
      params.set('timeInForce', 'GTC');
    }
    const queryString = params.toString();
    params.set('signature', signQuery(queryString));

    const response = await axios.post(
      `https://api.binance.com/api/v3/order?${params.toString()}`,
      null,
      { headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }, timeout: 15000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Binance order request failed:', error.response?.data?.msg || error.message);
    res.status(error.response?.status === 400 ? 400 : 502).json({
      error: error.response?.data?.msg || 'Binance could not process the order.'
    });
  }
});

// Example: get account info
app.get('/api/account', requireAllowedBinanceUser, async (_req, res) => {
  try {
    const params = new URLSearchParams({ timestamp: String(Date.now()) });
    params.set('signature', signQuery(params.toString()));

    const response = await axios.get(
      `https://api.binance.com/api/v3/account?${params.toString()}`,
      { headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }, timeout: 15000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Binance account request failed:', error.response?.data?.msg || error.message);
    res.status(502).json({ error: error.response?.data?.msg || 'Binance account information is unavailable.' });
  }
});

registerMobileApi(app);

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  let pair = 'btcusdt';
  let socket;
  let reconnectTimer;
  let reconnectDelay = 1000;
  let closed = false;

  function connectUpstream() {
    if (closed || ws.readyState !== WebSocket.OPEN) return;

    const upstream = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@trade`);
    socket = upstream;

    upstream.on('open', () => {
      if (socket === upstream) reconnectDelay = 1000;
    });

    upstream.on('message', (data) => {
      if (socket !== upstream || ws.readyState !== WebSocket.OPEN) return;
      try {
        const trade = JSON.parse(data);
        if (trade.p && trade.q) {
          ws.send(JSON.stringify({ price: trade.p, quantity: trade.q }));
        }
      } catch (error) {
        console.error('Invalid trade data received from Binance:', error.message);
      }
    });

    upstream.on('error', (error) => {
      console.error(`Binance stream error for ${pair}:`, error.message);
    });

    upstream.on('close', () => {
      if (socket !== upstream || closed || ws.readyState !== WebSocket.OPEN) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connectUpstream();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    });
  }

  connectUpstream();

  ws.on('message', (msg) => {
    let request;
    try {
      request = JSON.parse(msg);
    } catch (error) {
      ws.send(JSON.stringify({ error: 'Invalid stream request.' }));
      return;
    }

    const newPair = request?.newPair;
    if (typeof newPair !== 'string' || !/^[a-zA-Z0-9]{5,20}$/.test(newPair)) {
      ws.send(JSON.stringify({ error: 'Choose a valid trading pair.' }));
      return;
    }

    const normalizedPair = newPair.toLowerCase();
    if (normalizedPair === pair) return;

    pair = normalizedPair;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    reconnectDelay = 1000;
    socket?.close();
    connectUpstream();
  });

  ws.on('close', () => {
    closed = true;
    console.log('Client disconnected');
    clearTimeout(reconnectTimer);
    socket?.close();
  });

  ws.on('error', (error) => {
    console.error('Client WebSocket error:', error.message);
  });
});
