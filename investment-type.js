import { COUNTRY_ORDER, STOCK_EXCHANGES } from './stocks-data.js';

const pageType = document.body.dataset.investmentType;
const pageTitle = document.querySelector('[data-page-title]');
const catalogTitle = document.querySelector('[data-catalog-title]');
const productsContainer = document.getElementById('investmentDemoProducts');
const catalogStatus = document.getElementById('investmentDemoCatalogStatus');
const searchInput = document.getElementById('investmentDemoSearch');
const selectedTitle = document.getElementById('investmentDemoSelectedTitle');
const selectedDescription = document.getElementById('investmentDemoDescription');
const factsList = document.getElementById('investmentDemoFacts');
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
  ['Bitcoin', 'BTC'], ['Ethereum', 'ETH'], ['XRP', 'XRP'], ['Solana', 'SOL'], ['Polkadot', 'DOT'],
  ['Dogecoin', 'DOGE'], ['Cardano', 'ADA'], ['BNB', 'BNB'], ['TRON', 'TRX'], ['Tether', 'USDT'], ['USD Coin', 'USDC']
].map(([name, symbol]) => ({ name, symbol, detail: 'Crypto asset example' }));

const defaultCompanies = [
  { name: 'Caribbean Renewables Ltd', symbol: 'CR', detail: 'Renewable energy business profile' },
  { name: 'Harbor Technology Group', symbol: 'HT', detail: 'Technology business profile' },
  { name: 'Island Foods Co.', symbol: 'IF', detail: 'Food and distribution business profile' }
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
      name: coin.name, symbol: coin.symbol.toUpperCase(), detail: 'User-created coin example', id: `coin:${coin.symbol.toUpperCase()}`
    }))];
    return all.map((product) => ({ ...product, id: product.id || `coin:${product.symbol}` }));
  }
  if (pageType === 'Stocks') {
    return COUNTRY_ORDER.flatMap((country) => {
      const exchange = STOCK_EXCHANGES[country];
      return (exchange.companies || []).map((company) => ({
        id: `stock:${country}:${company.symbol}:${company.name}`,
        name: company.name,
        symbol: company.symbol,
        detail: `${company.sector || 'Listed company'} · ${exchange.exchange}`,
        exchange: exchange.exchange
      }));
    });
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

let products = getProducts();
let selectedProduct = null;
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

function renderProducts(filter = '') {
  const query = filter.trim().toLocaleLowerCase();
  const visible = products.filter((product) => `${product.name} ${product.symbol} ${product.detail || ''}`.toLocaleLowerCase().includes(query));
  productsContainer.replaceChildren();
  visible.forEach((product) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `investment-demo-product${selectedProduct?.id === product.id ? ' is-selected' : ''}`;
    button.setAttribute('aria-pressed', String(selectedProduct?.id === product.id));
    const badge = document.createElement('img');
    badge.className = 'investment-demo-product-icon';
    badge.src = window.createMarketLogoSrc(product.symbol, pageType);
    badge.alt = '';
    badge.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
    name.textContent = product.name;
    const symbol = document.createElement('small');
    symbol.textContent = product.symbol;
    const detail = document.createElement('span');
    detail.className = 'investment-demo-product-detail';
    detail.textContent = product.detail || 'Demo listing';
    button.append(badge, name, symbol, detail);
    button.addEventListener('click', () => selectProduct(product));
    productsContainer.appendChild(button);
  });
  catalogStatus.textContent = `${visible.length} example listing${visible.length === 1 ? '' : 's'} shown. No live quotes are provided.${catalogWarning}${storageWarning}`;
}

function renderFacts(product) {
  factsList.replaceChildren();
  [
    ['Category', pageType],
    ['Reference', product.symbol],
    ['Listing type', product.detail || 'Demo listing'],
    ['Data', pageType === 'Economy' ? 'Research watchlist only' : 'Static example; not a live quote']
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

function selectProduct(product) {
  selectedProduct = product;
  selectedTitle.textContent = product.name;
  const detail = product.detail || 'Static listing example for the demo portfolio.';
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

searchInput.addEventListener('input', () => renderProducts(searchInput.value));

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
if (requestedSymbol) {
  const linkedProduct = products.find((product) => product.symbol === requestedSymbol);
  if (linkedProduct) selectProduct(linkedProduct);
  else actionStatus.textContent = `The linked market (${requestedSymbol}) is not in this page's demo catalog.`;
}
