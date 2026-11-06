(() => {
  const paperCash = document.getElementById('treasuryPaperCash');
  if (!paperCash) return;

  const status = document.getElementById('treasuryPortfolioStatus');
  const paperAccount = document.getElementById('treasuryPaperAccount');
  const realizedPnl = document.getElementById('treasuryRealizedPnl');
  const positionsBody = document.getElementById('treasuryPaperPositions');
  const coinAllocationsBody = document.getElementById('treasuryCoinAllocations');
  const money = (value) => new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);

  function readJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  }

  function appendRow(tableBody, values, columnCount) {
    const row = document.createElement('tr');
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    if (!values.length) {
      const cell = document.createElement('td');
      cell.colSpan = columnCount;
      cell.textContent = 'No saved positions.';
      row.appendChild(cell);
    }
    tableBody.appendChild(row);
  }

  async function loadCurrentPrices(positions) {
    const symbols = [...new Set(positions.map((position) => position.symbol.toUpperCase().replace(/USDT$/, '')))];
    if (!symbols.length) return new Map();
    const pairs = symbols.map((symbol) => `${symbol}USDT`);
    const query = encodeURIComponent(JSON.stringify(pairs));
    let lastError;
    for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
      try {
        const response = await fetch(`${base}/api/v3/ticker/price?symbols=${query}`, {
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) throw new Error(`Market price request failed (${response.status}).`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Market price response was not a list.');
        return new Map(data.map((item) => [item.symbol.replace(/USDT$/, ''), Number(item.price)]));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Market prices are temporarily unavailable.');
  }

  function readPositions() {
    const values = readJson('makingsPositionMarketPositions', []);
    if (!Array.isArray(values)) throw new Error('Saved trade positions are not a list.');
    const positions = values.filter((position) => {
      if (!position
        || typeof position.symbol !== 'string'
        || !/^[A-Z0-9]{2,16}$/i.test(position.symbol)
        || !Number.isFinite(Number(position.quantity))
        || Number(position.quantity) <= 0
        || !Number.isFinite(Number(position.averagePrice))
        || Number(position.averagePrice) <= 0) return false;
      return position.side == null || ['BUY', 'SELL'].includes(String(position.side).toUpperCase());
    });
    return { positions, invalidCount: values.length - positions.length };
  }

  async function refresh() {
    const warnings = [];
    try {
      let positions = [];
      let coinState = { cash: 10000, entries: [] };
      try {
        const savedPositions = readPositions();
        positions = savedPositions.positions;
        if (savedPositions.invalidCount) warnings.push(`${savedPositions.invalidCount} saved trade position${savedPositions.invalidCount === 1 ? '' : 's'} had invalid data and were omitted.`);
      } catch (error) {
        warnings.push(`Trade positions could not be read: ${error.message}`);
      }
      try {
        const savedState = readJson('makingsInvestmentDemoState', coinState);
        if (!savedState || !Number.isFinite(Number(savedState.cash)) || !Array.isArray(savedState.entries)) {
          throw new Error('Saved investment demo data has an invalid format.');
        }
        coinState = savedState;
      } catch (error) {
        warnings.push(`Coin demo allocations could not be read: ${error.message}`);
      }
      let currentPrices = new Map();
      try {
        currentPrices = await loadCurrentPrices(positions);
      } catch (error) {
        warnings.push(`Live prices are unavailable; position values use entry prices. ${error.message}`);
      }
      const readBalance = (key, fallback, allowNegative = false) => {
        const raw = localStorage.getItem(key);
        const value = raw === null ? fallback : Number(raw);
        if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
          warnings.push(`Saved balance ${key} is invalid.`);
          return null;
        }
        return value;
      };
      const cashBalance = readBalance('makingsPositionMarketBalance', 10000);
      const accountBalance = readBalance('makingsTradePaperAccountBalance', 0);
      const pnl = readBalance('makingsTradeRealizedProfit', 0, true);
      paperCash.textContent = cashBalance === null ? 'Unavailable' : money(cashBalance);
      paperAccount.textContent = accountBalance === null ? 'Unavailable' : money(accountBalance);
      realizedPnl.textContent = pnl === null ? 'Unavailable' : money(pnl);

      positionsBody.replaceChildren();
      positions.forEach((position) => {
        const symbol = position.symbol.toUpperCase().replace(/USDT$/, '');
        const price = currentPrices.get(symbol) || Number(position.averagePrice);
        const side = position.side == null ? 'Holding' : String(position.side).toUpperCase() === 'BUY' ? 'Long' : 'Short';
        appendRow(positionsBody, [
          `${symbol}/USDT`,
          side,
          `${Number(position.quantity).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${symbol}`,
          money(Number(position.averagePrice)),
          money(Number(position.quantity) * price)
        ], 5);
      });
      if (!positions.length) appendRow(positionsBody, [], 5);

      const allocations = coinState.entries.filter((entry) => entry
        && entry.kind === 'allocation'
        && entry.category === 'Coins'
        && Number.isFinite(Number(entry.amount))
        && Number(entry.amount) > 0);
      coinAllocationsBody.replaceChildren();
      allocations.forEach((entry) => appendRow(coinAllocationsBody, [
        `${entry.name || 'Coin'} (${String(entry.symbol || '').toUpperCase()})`,
        money(Number(entry.amount)),
        entry.term || 'Open-ended'
      ], 3));
      if (!allocations.length) appendRow(coinAllocationsBody, [], 3);

      status.textContent = (positions.length || allocations.length
        ? `Showing ${positions.length} open trade position${positions.length === 1 ? '' : 's'} and ${allocations.length} coin demo allocation${allocations.length === 1 ? '' : 's'} saved in this browser.`
        : 'No paper-trading positions or coin demo allocations are saved in this browser.')
        + (warnings.length ? ` ${warnings.join(' ')}` : '');
      status.classList.toggle('is-error', warnings.length > 0);
    } catch (error) {
      console.error('Treasury demo portfolio could not be loaded:', error);
      status.textContent = `Could not load saved demo balances or positions: ${error.message}`;
      status.classList.add('is-error');
    }
  }

  document.getElementById('treasuryPortfolioRefresh').addEventListener('click', refresh);
  window.addEventListener('storage', (event) => {
    if (!event.key || [
      'makingsPositionMarketPositions',
      'makingsPositionMarketBalance',
      'makingsTradePaperAccountBalance',
      'makingsTradeRealizedProfit',
      'makingsInvestmentDemoState'
    ].includes(event.key)) refresh();
  });
  window.setInterval(refresh, 30000);
  refresh();
  window.treasuryPortfolioRefresh = refresh;
})();
