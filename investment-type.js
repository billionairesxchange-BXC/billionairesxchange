import {
  fetchCountryStockListings,
  fetchStockCountries,
  getFeaturedStockCountries,
  getStockCountryFlag,
  getStockCountryName,
  sortStockCountries
} from './stock-market-api.js';

const pageType = document.body.dataset.investmentType;
const pageTitle = document.querySelector('[data-page-title]');
const catalogTitle = document.querySelector('[data-catalog-title]');
const productsContainer = document.getElementById('investmentDemoProducts');
const catalogStatus = document.getElementById('investmentDemoCatalogStatus');
const searchInput = document.getElementById('investmentDemoSearch');
let stockCountryChoices = null;
let companyCountryChoices = null;
let selectedCompanyCountry = '';
let stockLoadMoreButton = null;
let stockVisibleCount = 100;
let stockCatalogWarnings = [];
let stockCountries = [];
let selectedStockCountry = null;
let stockLoadError = '';
const selectedTitle = document.getElementById('investmentDemoSelectedTitle');
const selectedDescription = document.getElementById('investmentDemoDescription');
const factsList = document.getElementById('investmentDemoFacts');
const chartSection = document.createElement('section');
chartSection.className = 'investment-demo-chart';
chartSection.setAttribute('aria-label', pageType === 'Coins' ? 'Live coin market chart' : 'Illustrative listing chart');
chartSection.hidden = true;
const chartHeading = document.createElement('div');
chartHeading.className = 'investment-demo-chart-heading';
const chartTitle = document.createElement('strong');
chartTitle.textContent = pageType === 'Coins' ? '24-hour market price' : 'Illustrative market chart';
const chartBadge = document.createElement('span');
chartBadge.textContent = pageType === 'Coins' ? 'LIVE MARKET DATA' : 'SAMPLE DATA';
const chartPrice = document.createElement('strong');
chartPrice.className = 'investment-demo-chart-price';
chartHeading.append(chartTitle, chartPrice, chartBadge);
const chartCanvas = document.createElement('canvas');
chartCanvas.setAttribute('aria-label', pageType === 'Coins' ? 'Live market price chart for the selected coin' : 'Illustrative sample chart for the selected listing');
const chartNote = document.createElement('p');
chartNote.className = 'investment-demo-chart-note';
chartNote.textContent = 'Example visualization only. This is not live market data or an investment recommendation.';
if (pageType === 'Coins') chartNote.textContent = 'CoinGecko market prices. Prices refresh periodically; demo allocations do not place real orders.';
chartSection.append(chartHeading, chartCanvas, chartNote);
selectedDescription.insertAdjacentElement('afterend', chartSection);
const allocationForm = document.getElementById('investmentDemoForm');
const amountInput = document.getElementById('investmentDemoAmount');
const amountLabel = document.getElementById('investmentDemoAmountLabel');
const termLabel = document.getElementById('investmentDemoTermLabel');
const termSelect = document.getElementById('investmentDemoTerm');
const submitButton = document.getElementById('investmentDemoSubmit');
const watchButton = document.getElementById('investmentDemoWatch');
const actionStatus = document.getElementById('investmentDemoActionStatus');
const portfolioContainer = document.getElementById('investmentDemoPortfolio');
const portfolioStatus = document.getElementById('investmentDemoPortfolioStatus');
const cashBalance = document.getElementById('demoCashBalance');
const positionCount = document.getElementById('demoPositionCount');
const watchCount = document.getElementById('demoWatchCount');
const companyManagementLink = document.getElementById('companyManagementLink');
const storageKey = 'makingsInvestmentDemoState';
const contractDetails = {};
let catalogWarning = '';
let coinMarketPage = 1;
let coinMarketLoading = false;
let coinMarketHasMore = true;
let coinMarketRefreshTimer = null;
let coinChartRequestVersion = 0;
let coinChartPrices = [];
let coinMarketRefreshError = '';
const coinLoadMoreButton = pageType === 'Coins' ? document.createElement('button') : null;
if (coinLoadMoreButton) {
  coinLoadMoreButton.type = 'button';
  coinLoadMoreButton.id = 'investmentCoinLoadMore';
  coinLoadMoreButton.className = 'btn btn-secondary';
  coinLoadMoreButton.textContent = 'Load more coins';
  coinLoadMoreButton.hidden = true;
  coinLoadMoreButton.setAttribute('aria-controls', 'investmentDemoProducts');
  productsContainer.after(coinLoadMoreButton);
}

if (pageType === 'Stocks') {
  stockCountryChoices = document.createElement('div');
  stockCountryChoices.id = 'investmentStockCountries';
  stockCountryChoices.className = 'investment-stock-countries';
  stockCountryChoices.setAttribute('role', 'group');
  stockCountryChoices.setAttribute('aria-label', 'Choose a country for stock listings');
  searchInput.parentElement.before(stockCountryChoices);
  stockLoadMoreButton = document.createElement('button');
  stockLoadMoreButton.type = 'button';
  stockLoadMoreButton.className = 'btn btn-secondary';
  stockLoadMoreButton.textContent = 'Load more stocks';
  stockLoadMoreButton.hidden = true;
  productsContainer.insertAdjacentElement('afterend', stockLoadMoreButton);
  const disclaimer = document.querySelector('.investment-demo-disclaimer');
  if (disclaimer) disclaimer.textContent = 'Stock listings are merged from configured EOD Historical Data, Alpha Vantage, FCS API, and Upstox sources where available. Quotes are not provided, and allocations and charts remain illustrative demos; no real securities or brokerage orders are involved.';
}

if (pageType === 'Company') {
  const countryHeading = document.createElement('p');
  countryHeading.className = 'company-choice-label';
  countryHeading.textContent = 'Browse companies by country';
  companyCountryChoices = document.createElement('div');
  companyCountryChoices.className = 'company-country-choices';
  companyCountryChoices.setAttribute('role', 'group');
  companyCountryChoices.setAttribute('aria-label', 'Filter company listings by country');
  const countries = [
    { label: 'All countries', value: '' },
    { label: 'America', value: 'America' },
    { label: 'Barbados', value: 'Barbados' },
    { label: 'Cayman', value: 'Cayman Islands' },
    { label: 'Jamaica', value: 'Jamaica' },
    { label: 'Puerto Rico', value: 'Puerto Rico' },
    { label: 'UK', value: 'United Kingdom' }
  ];
  countries.forEach(({ label, value }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'company-country-choice';
    button.dataset.companyCountry = value;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = label;
    button.addEventListener('click', () => {
      selectedCompanyCountry = value;
      companyCountryChoices.querySelectorAll('[data-company-country]').forEach((choice) => {
        choice.setAttribute('aria-pressed', String(choice.dataset.companyCountry === value));
      });
      renderProducts(searchInput.value);
    });
    companyCountryChoices.appendChild(button);
  });
  searchInput.parentElement.before(countryHeading, companyCountryChoices);
  companyCountryChoices.querySelector('[data-company-country=""]').setAttribute('aria-pressed', 'true');
}

function normalizeCompanyCountry(country) {
  const value = String(country || '').trim().toLocaleLowerCase();
  if (['america', 'united states', 'united states of america', 'us', 'usa'].includes(value)) return 'america';
  if (['cayman', 'cayman islands'].includes(value)) return 'cayman islands';
  if (['uk', 'united kingdom', 'great britain'].includes(value)) return 'united kingdom';
  return value;
}

const marketList = (rows) => rows.map(([name, symbol, detail]) => ({ name, symbol, detail }));
const demoMarkets = {
  Futures: marketList([
    ['E-mini S&P 500', 'CME_MINI:ES1!', 'Equity index future'],
    ['E-mini Nasdaq-100', 'CME_MINI:NQ1!', 'Equity index future'],
    ['E-mini Dow Jones', 'CBOT_MINI:YM1!', 'Equity index future'],
    ['Gold', 'COMEX:GC1!', 'Commodity future'],
    ['Crude Oil', 'NYMEX:CL1!', 'Energy future'],
    ['Bitcoin Futures', 'CME:BTC1!', 'Digital asset future'],
    ['10-Year Treasury Note', 'CBOT:ZN1!', 'Interest-rate future']
  ]),
  Indices: marketList([
    ['S&P 500', 'SP:SPX', 'US large-cap index'], ['Nasdaq 100', 'NASDAQ:NDX', 'US technology-heavy index'],
    ['Dow Jones Industrial Average', 'DJ:DJI', 'US blue-chip index'], ['Russell 2000', 'TVC:RUT', 'US small-cap index'],
    ['VIX', 'CBOE:VIX', 'Volatility index'], ['DAX', 'XETR:DAX', 'German equity index'],
    ['Nikkei 225', 'TSE:NI225', 'Japanese equity index']
  ]),
  Options: marketList([
    ['SPY (underlying)', 'AMEX:SPY', 'Underlying asset only; no option contract data'],
    ['QQQ (underlying)', 'NASDAQ:QQQ', 'Underlying asset only; no option contract data'],
    ['Apple (underlying)', 'NASDAQ:AAPL', 'Underlying asset only; no option contract data'],
    ['NVIDIA (underlying)', 'NASDAQ:NVDA', 'Underlying asset only; no option contract data'],
    ['Tesla (underlying)', 'NASDAQ:TSLA', 'Underlying asset only; no option contract data'],
    ['Microsoft (underlying)', 'NASDAQ:MSFT', 'Underlying asset only; no option contract data']
  ]),
  Economy: marketList([
    ['United States GDP', 'ECONOMICS:USGDP', 'Economic indicator; research watchlist only'],
    ['United States CPI', 'ECONOMICS:USCPI', 'Economic indicator; research watchlist only'],
    ['United States unemployment rate', 'ECONOMICS:USUR', 'Economic indicator; research watchlist only'],
    ['United States interest rate', 'ECONOMICS:USINTR', 'Economic indicator; research watchlist only'],
    ['United States nonfarm payrolls', 'ECONOMICS:USNFP', 'Economic indicator; research watchlist only'],
    ['United States manufacturing PMI', 'ECONOMICS:USPMI', 'Economic indicator; research watchlist only']
  ]),
  'Corporate Bonds': marketList([
    ['Investment-grade bonds (LQD)', 'AMEX:LQD', 'Corporate bond ETF example'],
    ['High-yield bonds (HYG)', 'AMEX:HYG', 'Corporate bond ETF example'],
    ['Short-term corporate bonds (VCSH)', 'NASDAQ:VCSH', 'Corporate bond ETF example'],
    ['Intermediate corporate bonds (VCIT)', 'NASDAQ:VCIT', 'Corporate bond ETF example'],
    ['High-yield bonds (JNK)', 'AMEX:JNK', 'Corporate bond ETF example'],
    ['Broad high-yield bonds (USHY)', 'NASDAQ:USHY', 'Corporate bond ETF example']
  ]),
  'Government Bonds': marketList([
    ['United States 2-year yield', 'TVC:US02Y', 'Government yield reference'],
    ['United States 5-year yield', 'TVC:US05Y', 'Government yield reference'],
    ['United States 10-year yield', 'TVC:US10Y', 'Government yield reference'],
    ['United States 30-year yield', 'TVC:US30Y', 'Government yield reference'],
    ['United Kingdom 10-year yield', 'TVC:GB10Y', 'Government yield reference'],
    ['Germany 10-year yield', 'TVC:DE10Y', 'Government yield reference'],
    ['Japan 10-year yield', 'TVC:JP10Y', 'Government yield reference']
  ]),
  ETFs: marketList([
    ['S&P 500 ETF (SPY)', 'AMEX:SPY', 'Exchange-traded fund example'],
    ['Nasdaq 100 ETF (QQQ)', 'NASDAQ:QQQ', 'Exchange-traded fund example'],
    ['Total stock market ETF (VTI)', 'AMEX:VTI', 'Exchange-traded fund example'],
    ['Russell 2000 ETF (IWM)', 'AMEX:IWM', 'Exchange-traded fund example'],
    ['Gold ETF (GLD)', 'AMEX:GLD', 'Exchange-traded fund example'],
    ['20+ year Treasury ETF (TLT)', 'NASDAQ:TLT', 'Exchange-traded fund example'],
    ['Emerging markets ETF (EEM)', 'AMEX:EEM', 'Exchange-traded fund example']
  ])
};

const staticProducts = {
  Bonds: marketList([
    ['Short-term US Treasury', 'DEMO-TBILL', 'Government debt example'],
    ['Intermediate US Treasury', 'DEMO-TNOTE', 'Government debt example'],
    ['Long-term US Treasury', 'DEMO-TBOND', 'Government debt example'],
    ['Investment-grade corporate bond', 'DEMO-IGB', 'Corporate debt example'],
    ['Municipal bond', 'DEMO-MUNI', 'Municipal debt example']
  ]),
  CDs: marketList([
    ['3-month demo certificate', 'DEMO-CD-3M', 'Demo term: 3 months'],
    ['6-month demo certificate', 'DEMO-CD-6M', 'Demo term: 6 months'],
    ['12-month demo certificate', 'DEMO-CD-12M', 'Demo term: 12 months'],
    ['24-month demo certificate', 'DEMO-CD-24M', 'Demo term: 24 months']
  ])
};

const coinProducts = [
  ['Bitcoin', 'BTC', 'bitcoin'], ['Ethereum', 'ETH', 'ethereum'], ['XRP', 'XRP', 'ripple'], ['Solana', 'SOL', 'solana'],
  ['Polkadot', 'DOT', 'polkadot'], ['Dogecoin', 'DOGE', 'dogecoin'], ['Cardano', 'ADA', 'cardano'],
  ['BNB', 'BNB', 'binancecoin'], ['TRON', 'TRX', 'tron'], ['Tether', 'USDT', 'tether'],
  ['USDC', 'USDC', 'usd-coin'], ['Chainlink', 'LINK', 'chainlink'], ['Avalanche', 'AVAX', 'avalanche-2'],
  ['Litecoin', 'LTC', 'litecoin'], ['Bitcoin Cash', 'BCH', 'bitcoin-cash'], ['Stellar', 'XLM', 'stellar'],
  ['Shiba Inu', 'SHIB', 'shiba-inu'], ['Toncoin', 'TON', 'the-open-network'],
  ['Uniswap', 'UNI', 'uniswap'], ['Sui', 'SUI', 'sui'], ['Aptos', 'APT', 'aptos'],
  ['NEAR Protocol', 'NEAR', 'near'], ['Internet Computer', 'ICP', 'internet-computer'],
  ['Ethereum Classic', 'ETC', 'ethereum-classic'], ['Monero', 'XMR', 'monero'],
  ['Dai', 'DAI', 'dai'], ['Render', 'RENDER', 'render-token'], ['Pepe', 'PEPE', 'pepe'],
  ['Cronos', 'CRO', 'crypto-com-chain'], ['Hedera', 'HBAR', 'hedera-hashgraph']
].map(([name, symbol, id]) => ({ id, name, symbol, detail: 'Loading live market data...' }));

const defaultCompanies = [
  { name: 'Caribbean Renewables Ltd', symbol: 'CR', country: 'Jamaica', detail: 'Renewable energy business profile' },
  { name: 'Harbor Technology Group', symbol: 'HT', country: 'Jamaica', detail: 'Technology business profile' },
  { name: 'Island Foods Co.', symbol: 'IF', country: 'Jamaica', detail: 'Food and distribution business profile' }
];

function getCompanies() {
  try {
    const saved = JSON.parse(localStorage.getItem('makingsRegisteredCompanies') || '[]');
    if (!Array.isArray(saved)) throw new Error('Saved company profiles are not a list.');
    const companies = [...defaultCompanies];
    const seen = new Set(companies.map((company) => company.name.toLocaleLowerCase()));
    saved.filter((company) => company && typeof company.name === 'string' && company.name.trim()).forEach((company) => {
      const name = company.name.trim();
      if (seen.has(name.toLocaleLowerCase())) return;
      seen.add(name.toLocaleLowerCase());
      companies.push({
        name,
        symbol: company.symbol || company.registrationNumber || 'COMPANY',
        country: company.country || company.listingCountry || '',
        detail: company.description || company.type || 'Registered business profile'
      });
    });
    return companies.map((company) => ({ ...company, id: `company:${company.name}` }));
  } catch (error) {
    catalogWarning = ` Could not load saved company profiles; built-in examples are shown. ${error.message}`;
    return defaultCompanies.map((company) => ({ ...company, id: `company:${company.name}` }));
  }
  if (type === 'date') {
    const today = new Date();
    const minDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    input.min = minDate;
    const defaultExpiry = new Date(today);
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    input.value = new Date(defaultExpiry.getTime() - defaultExpiry.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
}

function getProducts() {
  if (pageType === 'Company') return getCompanies();
  if (pageType === 'Coins') {
    let customCoins = [];
    try {
      const stored = JSON.parse(localStorage.getItem('customCoins') || '[]');
      const legacy = JSON.parse(localStorage.getItem('createdCoin') || 'null');
      customCoins = Array.isArray(stored) ? stored : [];
      if (legacy && !customCoins.some((coin) => coin?.symbol === legacy.symbol)) customCoins.push(legacy);
    } catch (error) {
      catalogWarning = ` Created coins could not be loaded; built-in coin examples remain available. ${error.message}`;
    }
    const all = [...coinProducts, ...customCoins.filter((coin) => coin?.name && /^[A-Z0-9]{2,8}$/i.test(coin.symbol || '')).map((coin) => ({
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      detail: 'User-created token; no public market feed',
      image: typeof coin.logo === 'string' ? coin.logo : '',
      id: `coin:${coin.symbol.toUpperCase()}`
    }))];
    return all.map((product) => ({ ...product, id: product.id || `coin:${product.symbol}` }));
  }
  if (demoMarkets[pageType]) return demoMarkets[pageType].map((market) => ({ ...market, id: `${pageType}:${market.symbol}` }));
  return (staticProducts[pageType] || []).map((product) => ({ ...product, id: `${pageType}:${product.symbol}` }));
}

const titles = {
  Company: 'Company investments', Coins: 'Coin investments', Stocks: 'Stock investments', Bonds: 'Bond investments',
  CDs: 'Certificate of deposit demo', Futures: 'Futures demo', Indices: 'Indices demo', Options: 'Options demo',
  Economy: 'Economy research', 'Corporate Bonds': 'Corporate bond demo', 'Government Bonds': 'Government bond demo', ETFs: 'ETF demo'
};

if (!titles[pageType]) {
  catalogStatus.textContent = 'This investment category is not recognized. Return to the Investment Center and choose a listed type.';
} else {
  document.title = `BillionairesXchange | ${titles[pageType]}`;
  pageTitle.textContent = titles[pageType];
  catalogTitle.textContent = pageType === 'Economy' ? 'Economic indicators' : `Available ${pageType.toLocaleLowerCase()}`;
  companyManagementLink.hidden = pageType !== 'Company';
  if (pageType === 'Coins') {
    const disclaimer = document.querySelector('.investment-demo-disclaimer');
    if (disclaimer) disclaimer.textContent = 'Coin listings, logos, and market prices are provided by CoinGecko. Portfolio allocations and watchlists are local demos and do not place real orders.';
  }
  if (pageType === 'Economy') {
    amountLabel.hidden = true;
    amountInput.hidden = true;
    termLabel.hidden = true;
    termSelect.hidden = true;
    submitButton.hidden = true;
    watchButton.textContent = 'Add to demo research watchlist';
    watchButton.dataset.watchOnly = 'true';
  }
  if (pageType === 'Options' || pageType === 'Futures') {
    selectedDescription.textContent = pageType === 'Options'
      ? 'This demo lists underlying assets only; it does not contain option chains, contract pricing, or exercise functionality.'
      : 'Explore illustrative futures products. This demo does not model leverage, margin calls, expiry settlement, or live prices.';
    amountLabel.textContent = pageType === 'Options' ? 'Demo premium budget (USD)' : 'Demo position budget (USD)';
    termLabel.hidden = true;
    termSelect.hidden = true;
    const controls = document.createElement('div');
    controls.className = 'investment-demo-contract-fields';
    const addControl = (labelText, name, type, options = {}) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      let input;
      if (options.choices) {
        input = document.createElement('select');
        options.choices.forEach(([value, text]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          input.appendChild(option);
        });
      } else {
        input = document.createElement('input');
        input.type = type;
        if (options.min !== undefined) input.min = String(options.min);
        if (options.step !== undefined) input.step = String(options.step);
      }
      input.name = name;
      input.required = true;
      input.dataset.contractField = name;
      label.appendChild(input);
      controls.appendChild(label);
      contractDetails[name] = input;
    };
    if (pageType === 'Futures') {
      addControl('Paper direction', 'direction', 'select', { choices: [['long', 'Long'], ['short', 'Short']] });
      addControl('Number of paper contracts', 'contracts', 'number', { min: 1, step: 1 });
      addControl('Illustrative expiry date', 'expiry', 'date');
    } else {
      addControl('Paper option type', 'optionType', 'select', { choices: [['call', 'Call'], ['put', 'Put']] });
      addControl('Illustrative strike (USD)', 'strike', 'number', { min: 0.01, step: 0.01 });
      addControl('Illustrative expiry date', 'expiry', 'date');
    }
    allocationForm.insertBefore(controls, submitButton);
  }
}

let products = pageType === 'Stocks' ? [] : getProducts();
let selectedProduct = null;
let chartProduct = null;
let state = { cash: 10000, entries: [] };
let storageWarning = '';

try {
  const savedState = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (savedState !== null) {
    if (!savedState || !Number.isFinite(savedState.cash) || !Array.isArray(savedState.entries)) {
      throw new Error('Saved demo portfolio has an invalid format.');
    }
    state = {
      cash: Math.max(0, savedState.cash),
      entries: savedState.entries.filter((entry) => entry
        && typeof entry.id === 'string'
        && typeof entry.category === 'string'
        && typeof entry.name === 'string'
        && typeof entry.symbol === 'string'
        && (entry.kind === 'watch' || (entry.kind === 'allocation' && Number.isFinite(entry.amount) && entry.amount > 0)))
    };
  }
} catch (error) {
  storageWarning = ` Saved demo data could not be read; using a temporary demo account. ${error.message}`;
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

async function loadStockCountry(countryCode) {
  const country = getStockCountryName(selectedStockCountry) || countryCode;
  stockCountryChoices.querySelectorAll('.investment-stock-country').forEach((button) => {
    const selected = button.dataset.countryCode === countryCode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  catalogStatus.textContent = `Loading stock listings for ${country}...`;
  stockCatalogWarnings = [];
  stockLoadError = '';
  try {
    const result = await fetchCountryStockListings(countryCode);
    products = result.listings.map((listing) => ({
      id: `stock:${countryCode}:${listing.exchange}:${listing.symbol}`,
      name: listing.name,
      symbol: listing.symbol,
      detail: `${country} · ${listing.symbol}.${listing.exchange} · ${listing.sector || 'Stock'}${listing.currency ? ` · ${listing.currency}` : ''}${listing.sources?.length ? ` · ${listing.sources.join(', ')}` : ''}`
    }));
    stockCatalogWarnings = result.warnings;
    stockVisibleCount = countryCode === 'JAM' ? products.length : 100;
    renderProducts(searchInput.value);
  } catch (error) {
    products = [];
    stockCatalogWarnings = [];
    stockLoadError = error.message;
    renderProducts(searchInput.value);
  }
}

function renderStockCountryChoices() {
  stockCountryChoices.replaceChildren();
  stockCountries.forEach((country) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'investment-stock-country';
    button.dataset.countryCode = country.code;
    button.setAttribute('aria-pressed', 'false');
    const flag = document.createElement('span');
    flag.className = 'investment-stock-country-flag';
    flag.setAttribute('aria-hidden', 'true');
    flag.textContent = getStockCountryFlag(country) || getStockCountryName(country).slice(0, 2).toUpperCase();
    const details = document.createElement('span');
    details.className = 'investment-stock-country-details';
    const name = document.createElement('strong');
    name.textContent = getStockCountryName(country);
    const exchanges = document.createElement('small');
    exchanges.textContent = country.market || `${country.exchanges.length} supported exchange${country.exchanges.length === 1 ? '' : 's'}`;
    details.append(name, exchanges);
    button.append(flag, details);
    button.addEventListener('click', () => {
      selectedStockCountry = country;
      loadStockCountry(country.code);
    });
    stockCountryChoices.appendChild(button);
  });
}

async function loadStockCatalog() {
  catalogStatus.textContent = 'Loading countries with supported stock listings...';
  try {
    stockCountries = sortStockCountries(await fetchStockCountries());
  } catch (error) {
    stockCountries = sortStockCountries(getFeaturedStockCountries());
    renderStockCountryChoices();
    catalogStatus.textContent = `Showing featured country markets. The stock service is unavailable: ${error.message}`;
    return;
  }
  renderStockCountryChoices();
  if (!stockCountries.length) {
    catalogStatus.textContent = 'No countries with supported stock listings were returned by the provider.';
    return;
  }
  catalogStatus.textContent = `${stockCountries.length} country markets available. Choose a country to check its stock listings.`;
}

function formatCoinPrice(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1 ? 2 : 8
  }).format(value);
}

function renderCoinProducts(markets, append) {
  const customCoins = products.filter((product) => product.id.startsWith('coin:'));
  const marketProducts = markets.map((market) => ({
    id: market.id,
    name: market.name,
    symbol: String(market.symbol || '').toUpperCase(),
    image: market.image,
    currentPrice: Number(market.current_price),
    marketCap: Number(market.market_cap) || 0,
    totalVolume: Number(market.total_volume) || 0,
    change24h: Number(market.price_change_percentage_24h) || 0,
    detail: 'Live USD market data'
  })).filter((product) => product.id && product.symbol && Number.isFinite(product.currentPrice) && product.currentPrice > 0);

  if (!append) {
    products = [...marketProducts, ...customCoins];
  } else {
    const existingIds = new Set(products.map((product) => product.id));
    products.push(...marketProducts.filter((product) => !existingIds.has(product.id)));
  }
  if (selectedProduct) {
    selectedProduct = products.find((product) => product.id === selectedProduct.id) || selectedProduct;
    chartProduct = selectedProduct;
    chartPrice.textContent = Number.isFinite(selectedProduct.currentPrice)
      ? formatCoinPrice(selectedProduct.currentPrice)
      : '--';
    renderFacts(selectedProduct);
  }
  renderProducts(searchInput.value);
}

async function loadCoinMarkets() {
  if (pageType !== 'Coins' || coinMarketLoading || !coinMarketHasMore) return;
  coinMarketLoading = true;
  coinLoadMoreButton.disabled = true;
  coinLoadMoreButton.textContent = 'Loading coins...';
  catalogStatus.textContent = `Loading live crypto markets (page ${coinMarketPage})...`;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${coinMarketPage}&sparkline=false&price_change_percentage=24h`);
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    const markets = await response.json();
    if (!Array.isArray(markets)) throw new Error('The market list response was not a valid list.');
    if (!markets.length && coinMarketPage === 1) throw new Error('CoinGecko returned an empty market list.');
    renderCoinProducts(markets, coinMarketPage > 1);
    coinMarketHasMore = markets.length === 250;
    coinMarketPage += 1;
    coinMarketRefreshError = '';
    coinLoadMoreButton.hidden = !coinMarketHasMore;
  } catch (error) {
    coinMarketRefreshError = error.message;
    if (!products.length) renderProducts(searchInput.value);
    catalogStatus.textContent = `Live coin markets could not be loaded: ${error.message}. Showing the built-in coin list instead.`;
    coinLoadMoreButton.hidden = false;
  } finally {
    coinMarketLoading = false;
    coinLoadMoreButton.disabled = false;
    coinLoadMoreButton.textContent = coinMarketRefreshError ? 'Retry coin loading' : 'Load more coins';
    if (!coinMarketRefreshError) {
      catalogStatus.textContent = `${products.filter((product) => !product.id.startsWith('coin:')).length} live coins and ${products.filter((product) => product.id.startsWith('coin:')).length} custom tokens shown. Prices are provided by CoinGecko.${storageWarning}`;
    }
  }
}

function renderProducts(filter = '') {
  const query = filter.trim().toLocaleLowerCase();
  const matching = products.filter((product) => {
    const matchesSearch = `${product.name} ${product.symbol} ${product.country || ''} ${product.detail || ''}`.toLocaleLowerCase().includes(query);
    const matchesCountry = pageType !== 'Company' || !selectedCompanyCountry
      || normalizeCompanyCountry(product.country) === normalizeCompanyCountry(selectedCompanyCountry);
    return matchesSearch && matchesCountry;
  });
  const visible = pageType === 'Stocks' ? matching.slice(0, stockVisibleCount) : matching;
  productsContainer.replaceChildren();
  visible.forEach((product) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `investment-demo-product${selectedProduct?.id === product.id ? ' is-selected' : ''}`;
    button.setAttribute('aria-pressed', String(selectedProduct?.id === product.id));
    const badge = document.createElement('img');
    badge.className = 'investment-demo-product-icon';
    badge.src = product.image || window.createMarketLogoSrc(product.symbol, pageType);
    badge.alt = '';
    badge.setAttribute('aria-hidden', 'true');
    badge.addEventListener('error', () => {
      badge.src = window.createMarketLogoSrc(product.symbol, pageType);
    }, { once: true });
    const name = document.createElement('strong');
    name.textContent = product.name;
    const symbol = document.createElement('small');
    symbol.textContent = product.symbol;
    const detail = document.createElement('span');
    detail.className = 'investment-demo-product-detail';
    detail.textContent = pageType === 'Coins' && Number.isFinite(product.currentPrice)
      ? `${formatCoinPrice(product.currentPrice)} · ${product.change24h >= 0 ? '+' : ''}${product.change24h.toFixed(2)}%`
      : product.country
      ? `${product.country} · ${product.detail || 'Company listing'}`
      : product.detail || 'Demo listing';
    button.append(badge, name, symbol, detail);
    button.addEventListener('click', () => selectProduct(product));
    productsContainer.appendChild(button);
  });
  if (pageType === 'Stocks' && !matching.length) {
    const empty = document.createElement('p');
    empty.className = 'investment-demo-stock-empty';
    empty.textContent = query
      ? 'No stock listings match this search.'
      : !selectedStockCountry
        ? 'Choose a country to see its available stock listings.'
      : stockLoadError || stockCatalogWarnings.join(' ') || 'No stock listings were returned for this country.';
    productsContainer.appendChild(empty);
  }
  if (pageType === 'Company' && !matching.length) {
    const empty = document.createElement('p');
    empty.className = 'investment-demo-stock-empty';
    empty.textContent = query
      ? `No company listings match this search${selectedCompanyCountry ? ` in ${selectedCompanyCountry}` : ''}.`
      : selectedCompanyCountry
        ? `No companies are listed in ${selectedCompanyCountry} yet. Add a company in the Investment Center and select this country.`
        : 'No company listings are available yet.';
    productsContainer.appendChild(empty);
  }
  if (stockLoadMoreButton) stockLoadMoreButton.hidden = visible.length >= matching.length;
  if (pageType === 'Coins') {
    catalogStatus.textContent = `${matching.length} coin${matching.length === 1 ? '' : 's'} match your search. ${coinMarketRefreshError ? `Live market data unavailable: ${coinMarketRefreshError}` : 'CoinGecko live market prices refresh periodically.'}${storageWarning}`;
    return;
  }
  catalogStatus.textContent = pageType === 'Stocks'
    ? matching.length
      ? `${visible.length} of ${matching.length} matching stock listings shown. No live quotes are provided.${stockCatalogWarnings.length ? ` Some exchanges could not be loaded: ${stockCatalogWarnings.join('; ')}` : ''}${storageWarning}`
      : selectedStockCountry
        ? `${getStockCountryName(selectedStockCountry)} stock listings unavailable. ${stockLoadError || stockCatalogWarnings.join(' ') || 'The provider returned no listings.'}${storageWarning}`
        : `Choose a country to see its available stock listings.${stockLoadError ? ` ${stockLoadError}` : ''}${storageWarning}`
    : pageType === 'Company'
      ? `${visible.length} compan${visible.length === 1 ? 'y' : 'ies'} shown${selectedCompanyCountry ? ` in ${selectedCompanyCountry}` : ''}.${catalogWarning}${storageWarning}`
    : `${visible.length} example listing${visible.length === 1 ? '' : 's'} shown. No live quotes are provided.${catalogWarning}${storageWarning}`;
}

function renderFacts(product) {
  factsList.replaceChildren();
  [
    ['Category', pageType],
    ['Reference', product.symbol],
    ...(pageType === 'Coins' && Number.isFinite(product.currentPrice) ? [['Live price', formatCoinPrice(product.currentPrice)]] : []),
    ...(pageType === 'Coins' && Number.isFinite(product.change24h) ? [['24-hour change', `${product.change24h >= 0 ? '+' : ''}${product.change24h.toFixed(2)}%`]] : []),
    ...(pageType === 'Coins' && Number.isFinite(product.marketCap) && product.marketCap > 0 ? [['Market cap', formatMoney(product.marketCap)]] : []),
    ...(product.country ? [['Country', product.country]] : []),
    ['Listing type', product.detail || 'Demo listing'],
    ['Data', pageType === 'Coins' && !product.id.startsWith('coin:')
      ? 'CoinGecko live market data'
      : pageType === 'Economy' ? 'Research watchlist only' : 'Static demo listing; no live quote']
  ].forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    wrapper.append(term, description);
    factsList.appendChild(wrapper);
  });
}

function drawLiveCoinChart() {
  const bounds = chartCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const ratio = window.devicePixelRatio || 1;
  const width = bounds.width;
  const height = bounds.height;
  chartCanvas.width = Math.round(width * ratio);
  chartCanvas.height = Math.round(height * ratio);
  const context = chartCanvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0c0c0c';
  context.fillRect(0, 0, width, height);

  if (coinChartPrices.length < 2) {
    context.fillStyle = '#9b927a';
    context.font = '12px Inter, sans-serif';
    context.fillText('Waiting for live price history...', 16, Math.max(32, height / 2));
    return;
  }
  const padding = { top: 18, right: 78, bottom: 25, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const prices = coinChartPrices.map((point) => point.price).filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length < 2) return;
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (min === max) {
    min *= 0.995;
    max *= 1.005;
  }
  const spread = max - min;
  min -= spread * 0.08;
  max += spread * 0.08;
  const y = (price) => padding.top + ((max - price) / (max - min)) * plotHeight;
  context.font = '10px Inter, sans-serif';
  context.lineWidth = 1;
  for (let row = 0; row <= 4; row += 1) {
    const price = max - (max - min) * row / 4;
    const lineY = y(price);
    context.strokeStyle = 'rgba(212, 175, 55, .14)';
    context.beginPath();
    context.moveTo(padding.left, lineY);
    context.lineTo(width - padding.right, lineY);
    context.stroke();
    context.fillStyle = '#9b927a';
    context.fillText(formatCoinPrice(price), width - padding.right + 6, lineY + 3);
  }
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const strokeColor = lastPrice >= firstPrice ? '#31d598' : '#ff6b7a';
  const points = coinChartPrices.filter((point) => Number.isFinite(point.price) && point.price > 0);
  const x = (index) => padding.left + plotWidth * index / (points.length - 1);
  context.strokeStyle = strokeColor;
  context.lineWidth = 2;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(x(index), y(point.price));
    else context.lineTo(x(index), y(point.price));
  });
  context.stroke();
  context.fillStyle = '#9b927a';
  context.fillText('24 hours ago', padding.left, height - 8);
  context.textAlign = 'right';
  context.fillText('Now', width - padding.right, height - 8);
  context.textAlign = 'left';
}

function drawProductChart(product) {
  if (pageType === 'Coins') {
    drawLiveCoinChart();
    return;
  }
  const bounds = chartCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const ratio = window.devicePixelRatio || 1;
  const width = bounds.width;
  const height = bounds.height;
  chartCanvas.width = Math.round(width * ratio);
  chartCanvas.height = Math.round(height * ratio);
  const context = chartCanvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0c0c0c';
  context.fillRect(0, 0, width, height);

  const padding = { top: 22, right: 48, bottom: 28, left: 12 };
  const min = 94;
  const max = 106;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const y = (value) => padding.top + ((max - value) / (max - min)) * plotHeight;
  context.font = '10px Inter, sans-serif';
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(212, 175, 55, .12)';
  context.fillStyle = '#9b927a';

  for (let row = 0; row <= 4; row += 1) {
    const value = max - row * 3;
    const lineY = y(value);
    context.beginPath();
    context.moveTo(padding.left, lineY);
    context.lineTo(width - padding.right, lineY);
    context.stroke();
    context.fillText(value.toFixed(0), width - padding.right + 8, lineY + 3);
  }
  for (let column = 0; column <= 6; column += 1) {
    const lineX = padding.left + (plotWidth * column) / 6;
    context.beginPath();
    context.moveTo(lineX, padding.top);
    context.lineTo(lineX, height - padding.bottom);
    context.stroke();
  }

  let seed = 0;
  for (const character of product.symbol) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const candleCount = 48;
  const step = plotWidth / candleCount;
  let previous = 100;
  for (let index = 0; index < candleCount; index += 1) {
    const open = previous;
    const close = Math.max(94.5, Math.min(105.5, open + (random() - 0.49) * 1.7));
    const high = Math.min(106, Math.max(open, close) + random() * 0.7);
    const low = Math.max(94, Math.min(open, close) - random() * 0.7);
    const x = padding.left + step * (index + 0.5);
    const color = close >= open ? '#31d598' : '#ff6b7a';
    context.strokeStyle = color;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y(high));
    context.lineTo(x, y(low));
    context.stroke();
    const candleHeight = Math.max(2, Math.abs(y(open) - y(close)));
    context.fillRect(
      x - Math.max(2, step * 0.32),
      Math.min(y(open), y(close)),
      Math.max(3, step * 0.64),
      candleHeight
    );
    previous = close;
  }
  context.fillStyle = '#9b927a';
  context.fillText('Illustrative index (100 base)', padding.left, 13);
  context.fillText('Sample history', padding.left, height - 8);
}

async function loadCoinChart(product) {
  const requestVersion = ++coinChartRequestVersion;
  coinChartPrices = [];
  drawLiveCoinChart();
  chartPrice.textContent = Number.isFinite(product.currentPrice) ? formatCoinPrice(product.currentPrice) : '--';
  if (product.id.startsWith('coin:')) {
    chartBadge.textContent = 'NO LIVE MARKET';
    chartNote.textContent = 'This user-created token does not have a CoinGecko market listing, so a live chart is not available.';
    drawLiveCoinChart();
    return;
  }
  chartBadge.textContent = 'LOADING LIVE DATA';
  chartNote.textContent = 'Loading 24-hour market history from CoinGecko...';
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(product.id)}/market_chart?vs_currency=usd&days=1&interval=hourly`);
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    const history = await response.json();
    if (requestVersion !== coinChartRequestVersion || selectedProduct?.id !== product.id) return;
    if (!Array.isArray(history.prices)) throw new Error('The market history response was invalid.');
    coinChartPrices = history.prices
      .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) && Number(point[1]) > 0)
      .map(([time, price]) => ({ time: Number(time), price: Number(price) }));
    if (coinChartPrices.length < 2) throw new Error('CoinGecko did not return enough price history to draw a chart.');
    chartBadge.textContent = 'LIVE MARKET DATA';
    chartNote.textContent = 'CoinGecko 24-hour price history. The current price refreshes every 60 seconds; demo allocations do not place real orders.';
    drawLiveCoinChart();
  } catch (error) {
    if (requestVersion !== coinChartRequestVersion || selectedProduct?.id !== product.id) return;
    chartBadge.textContent = 'LIVE HISTORY UNAVAILABLE';
    chartNote.textContent = `Live chart history could not be loaded: ${error.message}`;
    drawLiveCoinChart();
  }
}

async function refreshSelectedCoinPrice(product, requestVersion) {
  if (!product || product.id.startsWith('coin:')) return;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(product.id)}&sparkline=false&price_change_percentage=24h`);
    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
    const [market] = await response.json();
    if (requestVersion !== coinChartRequestVersion || selectedProduct?.id !== product.id) return;
    if (!market) throw new Error('CoinGecko returned no data for this coin.');
    const currentPrice = Number(market.current_price);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error('CoinGecko did not return a valid live price.');
    const updatedProduct = products.find((item) => item.id === product.id) || product;
    Object.assign(updatedProduct, {
      currentPrice,
      change24h: Number(market.price_change_percentage_24h) || 0,
      marketCap: Number(market.market_cap) || updatedProduct.marketCap,
      totalVolume: Number(market.total_volume) || updatedProduct.totalVolume
    });
    if (selectedProduct?.id === product.id) {
      selectedProduct = updatedProduct;
      chartProduct = updatedProduct;
    }
    chartPrice.textContent = formatCoinPrice(currentPrice);
    renderFacts(updatedProduct);
    renderProducts(searchInput.value);
    if (coinChartPrices.length) {
      coinChartPrices[coinChartPrices.length - 1] = { time: Date.now(), price: currentPrice };
      drawLiveCoinChart();
    }
    chartNote.textContent = coinChartPrices.length
      ? 'CoinGecko price history with the latest quote refreshed just now. Demo allocations do not place real orders.'
      : 'The latest CoinGecko quote refreshed just now, but price history is currently unavailable.';
  } catch (error) {
    if (requestVersion !== coinChartRequestVersion || selectedProduct?.id !== product.id) return;
    chartNote.textContent = `Live price refresh failed: ${error.message}. Showing the last available quote.`;
  }
}

function selectProduct(product) {
  selectedProduct = product;
  chartProduct = product;
  chartSection.hidden = false;
  chartCanvas.setAttribute('aria-label', `${pageType === 'Coins' ? 'Live market price chart' : 'Illustrative sample chart'} for ${product.name}`);
  if (pageType === 'Coins') {
    if (coinMarketRefreshTimer) window.clearInterval(coinMarketRefreshTimer);
    chartPrice.textContent = Number.isFinite(product.currentPrice) ? formatCoinPrice(product.currentPrice) : '--';
    chartBadge.textContent = product.id.startsWith('coin:') ? 'NO LIVE MARKET' : 'LIVE MARKET DATA';
    chartNote.textContent = product.id.startsWith('coin:')
      ? 'This user-created token does not have a CoinGecko market listing, so a live chart is not available.'
      : 'Loading 24-hour market history from CoinGecko...';
    loadCoinChart(product);
    if (!product.id.startsWith('coin:')) {
      const requestVersion = coinChartRequestVersion;
      coinMarketRefreshTimer = window.setInterval(
        () => refreshSelectedCoinPrice(product, requestVersion),
        60000
      );
    }
  } else {
    drawProductChart(product);
  }
  selectedTitle.textContent = product.name;
  const detail = pageType === 'Coins' && product.id.startsWith('coin:')
    ? 'User-created token. This token is not known to have a publicly listed live market price.'
    : product.detail || 'Static listing example for the demo portfolio.';
  selectedDescription.textContent = pageType === 'Options'
    ? `${detail}. This demo has no option-chain quotes, contract pricing, or exercise functionality.`
    : pageType === 'Futures'
      ? `${detail}. This demo does not model leverage, margin calls, expiry settlement, or live quotes.`
      : detail;
  renderFacts(product);
  submitButton.disabled = pageType === 'Economy';
  watchButton.disabled = false;
  actionStatus.textContent = '';
  renderProducts(searchInput.value);
  const requestedSymbol = new URLSearchParams(window.location.search).get('market');
  if (requestedSymbol && requestedSymbol === product.symbol) {
    actionStatus.textContent = 'This listing was selected from the Explore markets chart preview.';
  }
}

function renderPortfolio() {
  cashBalance.textContent = formatMoney(state.cash);
  const allocations = state.entries.filter((entry) => entry.kind === 'allocation');
  const watches = state.entries.filter((entry) => entry.kind === 'watch');
  positionCount.textContent = String(allocations.length);
  watchCount.textContent = String(watches.length);
  portfolioContainer.replaceChildren();
  portfolioStatus.textContent = state.entries.length
    ? `${allocations.length} demo allocation${allocations.length === 1 ? '' : 's'} and ${watches.length} watchlist item${watches.length === 1 ? '' : 's'}.${storageWarning}`
    : `No demo allocations or watchlist items yet.${storageWarning}`;
  state.entries.slice().reverse().forEach((entry) => {
    const row = document.createElement('article');
    row.className = 'investment-demo-portfolio-row';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const meta = document.createElement('small');
    meta.textContent = entry.kind === 'watch'
      ? `${entry.category} · ${entry.symbol} · Watchlist`
      : `${entry.category} · ${entry.symbol} · ${formatMoney(entry.amount)} · ${entry.term || 'Demo position'}${entry.contracts ? ` · ${entry.direction} · ${entry.contracts} contracts` : ''}${entry.optionType ? ` · ${entry.optionType.toUpperCase()} · strike ${formatMoney(entry.strike)}` : ''}${entry.expiry ? ` · expiry ${entry.expiry}` : ''}`;
    details.append(name, meta);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost';
    close.textContent = entry.kind === 'watch' ? 'Remove' : 'Close demo allocation';
    close.addEventListener('click', () => {
      const confirmed = window.confirm(entry.kind === 'watch'
        ? `Remove ${entry.name} from the demo watchlist?`
        : `Close the demo allocation in ${entry.name}? The original demo amount will return to the demo balance.`);
      if (!confirmed) return;
      const previousEntries = state.entries;
      const previousCash = state.cash;
      state.entries = state.entries.filter((item) => item.id !== entry.id);
      if (entry.kind === 'allocation') state.cash += entry.amount;
      try {
        saveState();
        renderPortfolio();
        actionStatus.textContent = entry.kind === 'watch' ? 'Watchlist item removed.' : 'Demo allocation closed; demo funds returned.';
      } catch (error) {
        state.entries = previousEntries;
        state.cash = previousCash;
        actionStatus.textContent = `Could not save the portfolio update. ${error.message}`;
      }
    });
    row.append(details, close);
    portfolioContainer.appendChild(row);
  });
}

searchInput.addEventListener('input', () => {
  stockVisibleCount = 100;
  renderProducts(searchInput.value);
});

if (coinLoadMoreButton) {
  coinLoadMoreButton.addEventListener('click', loadCoinMarkets);
}

if (stockLoadMoreButton) {
  stockLoadMoreButton.addEventListener('click', () => {
    stockVisibleCount += 100;
    renderProducts(searchInput.value);
  });
}

allocationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selectedProduct || pageType === 'Economy') {
    actionStatus.textContent = 'Choose an investment listing before recording an allocation.';
    return;
  }
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount < 1 || amount > state.cash) {
    actionStatus.textContent = `Enter an amount from $1.00 up to the available demo balance of ${formatMoney(state.cash)}.`;
    amountInput.focus();
    return;
  }
  const extraDetails = {};
  if (pageType === 'Futures') {
    const contracts = Number(contractDetails.contracts.value);
    if (!Number.isInteger(contracts) || contracts < 1 || !contractDetails.expiry.value) {
      actionStatus.textContent = 'Enter at least one paper contract and an illustrative expiry date.';
      return;
    }
    extraDetails.direction = contractDetails.direction.value;
    extraDetails.contracts = contracts;
    extraDetails.expiry = contractDetails.expiry.value;
  } else if (pageType === 'Options') {
    const strike = Number(contractDetails.strike.value);
    if (!Number.isFinite(strike) || strike <= 0 || !contractDetails.expiry.value) {
      actionStatus.textContent = 'Enter a positive illustrative strike and an expiry date.';
      return;
    }
    extraDetails.optionType = contractDetails.optionType.value;
    extraDetails.strike = strike;
    extraDetails.expiry = contractDetails.expiry.value;
  }
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: 'allocation',
    category: pageType,
    productId: selectedProduct.id,
    name: selectedProduct.name,
    symbol: selectedProduct.symbol,
    amount: Math.round(amount * 100) / 100,
    term: ['Futures', 'Options'].includes(pageType) ? 'Paper contract' : termSelect.value,
    ...extraDetails,
    createdAt: new Date().toISOString()
  };
  state.cash -= entry.amount;
  state.entries.push(entry);
  try {
    saveState();
    renderPortfolio();
    amountInput.value = '';
    actionStatus.textContent = `Demo allocation recorded for ${selectedProduct.name}. No order was sent.`;
  } catch (error) {
    state.cash += entry.amount;
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    actionStatus.textContent = `The demo allocation could not be saved. ${error.message}`;
  }
});

watchButton.addEventListener('click', () => {
  if (!selectedProduct) {
    actionStatus.textContent = 'Choose a listing before adding it to the watchlist.';
    return;
  }
  if (state.entries.some((entry) => entry.kind === 'watch' && entry.productId === selectedProduct.id && entry.category === pageType)) {
    actionStatus.textContent = `${selectedProduct.name} is already on your demo watchlist.`;
    return;
  }
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: 'watch',
    category: pageType,
    productId: selectedProduct.id,
    name: selectedProduct.name,
    symbol: selectedProduct.symbol,
    createdAt: new Date().toISOString()
  };
  state.entries.push(entry);
  try {
    saveState();
    renderPortfolio();
    actionStatus.textContent = `Added ${selectedProduct.name} to the demo watchlist.`;
  } catch (error) {
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    actionStatus.textContent = `Could not save the watchlist item. ${error.message}`;
  }
});

renderProducts();
renderPortfolio();
const requestedSymbol = new URLSearchParams(window.location.search).get('market');
if (pageType === 'Stocks') {
  loadStockCatalog();
} else if (pageType === 'Coins') {
  const initialProduct = requestedSymbol
    ? products.find((product) => product.symbol === requestedSymbol)
    : products[0];
  if (initialProduct) selectProduct(initialProduct);
  loadCoinMarkets().then(() => {
    if (!requestedSymbol) return;
    const linkedProduct = products.find((product) => product.symbol === requestedSymbol);
    if (linkedProduct) selectProduct(linkedProduct);
    else actionStatus.textContent = `The linked market (${requestedSymbol}) is not in this page's loaded coin markets.`;
  });
} else if (requestedSymbol) {
  const linkedProduct = products.find((product) => product.symbol === requestedSymbol);
  if (linkedProduct) selectProduct(linkedProduct);
  else actionStatus.textContent = `The linked market (${requestedSymbol}) is not in this page's demo catalog.`;
}

window.addEventListener('resize', () => {
  if (chartProduct && !chartSection.hidden) drawProductChart(chartProduct);
});
