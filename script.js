document.addEventListener('DOMContentLoaded', () => {
  const assetGrid = document.getElementById('assetGrid');
  const marketTableBody = document.getElementById('marketTableBody');
  const chartCanvas = document.getElementById('marketCanvas');
  const chartTitle = document.getElementById('marketChartTitle');
  const chartButtons = document.querySelectorAll('.chart-toggle button');
  const watchlist = document.getElementById('watchlist');
  const marketCapStat = document.getElementById('marketCapStat');
  const volumeStat = document.getElementById('volumeStat');
  const dominanceStat = document.getElementById('dominanceStat');
  const marketSearch = document.getElementById('marketSearch');
  const filterButtons = document.querySelectorAll('.filter-chip');
  const positionsCandleChart = document.getElementById('positionsCandleChart');
  const positionsChartTitle = document.getElementById('positionsChartTitle');
  const positionsChartPrice = document.getElementById('positionsChartPrice');
  const positionsChartStatus = document.getElementById('positionsChartStatus');
  const positionsChartWrap = document.querySelector('.positions-chart-wrap');
  const positionsChartResizer = document.getElementById('positionsChartResizer');
  const positionsMarketSelect = document.getElementById('positionsMarketSelect');
  const positionsToolsButton = document.getElementById('positionsToolsButton');
  const positionsToolsOptions = document.getElementById('positionsToolsOptions');
  const positionsBuyButton = document.getElementById('positionsBuyButton');
  const positionsSellButton = document.getElementById('positionsSellButton');

  if (!assetGrid && !marketTableBody && !chartCanvas) {
    return;
  }

  const marketConfig = {
    ids: [
      'bitcoin',
      'ethereum',
      'ripple',
      'solana',
      'dogecoin',
      'cardano',
      'binancecoin',
      'tron',
      'tether',
      'usd-coin'
    ],
    currency: 'usd',
    refreshMs: 30000,
    selectedSymbol: 'XRP',
    selectedFilter: 'all',
    searchText: ''
  };

  let assets = [];
  const positionsChartTools = JSON.parse(localStorage.getItem('positionsChartTools') || '{"indicators":[],"candleStyle":{"bodyWidth":58,"wickWidth":1}}');

  function savePositionsChartTools() {
    localStorage.setItem('positionsChartTools', JSON.stringify(positionsChartTools));
  }

  function calculateIndicator(values, type, period) {
    const output = [];
    let previous = values[0];
    values.forEach((value, index) => {
      if (index < period - 1) {
        output.push(null);
        return;
      }
      if (type === 'ema') {
        const multiplier = 2 / (period + 1);
        previous = index === period - 1
          ? values.slice(0, period).reduce((sum, item) => sum + item, 0) / period
          : (value - previous) * multiplier + previous;
        output.push(previous);
        return;
      }
      output.push(values.slice(index - period + 1, index + 1).reduce((sum, item) => sum + item, 0) / period);
    });
    return output;
  }

  function getCustomCoins() {
    const savedCoins = JSON.parse(localStorage.getItem('customCoins') || '[]');
    const legacyCoin = JSON.parse(localStorage.getItem('createdCoin') || 'null');
    const coins = legacyCoin && !savedCoins.some((coin) => coin.symbol === legacyCoin.symbol)
      ? [...savedCoins, legacyCoin]
      : savedCoins;

    return coins.filter((coin) => coin.name && /^[A-Z0-9]{2,8}$/.test(coin.symbol));
  }

  function createCustomAsset(coin) {
    const seed = [...(coin.symbol + coin.name)].reduce((total, character) => total + character.charCodeAt(0), 0);
    const currentPrice = Math.max(0.01, (seed % 9000) / 100 + 1);
    const marketCap = Math.max(250000, (seed % 8000) * 1250);
    const change = ((seed % 170) - 85) / 10;
    const sparkline = Array.from({ length: 30 }, (_, index) => currentPrice * (1 + Math.sin(index / 3) * 0.03 + index * 0.001));

    return {
      id: `custom-${coin.symbol.toLowerCase()}`,
      name: coin.name,
      symbol: coin.symbol,
      current_price: currentPrice,
      market_cap: marketCap,
      total_volume: Math.round(marketCap * 0.08),
      market_cap_rank: null,
      price_change_percentage_24h: change,
      sparkline_in_7d: { price: sparkline },
      isCustom: true
    };
  }

  function getCustomAssets() {
    return getCustomCoins().map(createCustomAsset);
  }

  function addCustomMarketOptions(customAssets) {
    if (!positionsMarketSelect) return;
    customAssets.forEach((asset) => {
      if (positionsMarketSelect.querySelector(`option[value="${asset.symbol}"]`)) return;
      const option = document.createElement('option');
      option.value = asset.symbol;
      option.textContent = `${asset.symbol} / USD`;
      positionsMarketSelect.appendChild(option);
    });
  }

  function drawPositionsChart() {
    if (!positionsCandleChart || !assets.length) return;
    const asset = assets.find((item) => item.symbol.toUpperCase() === marketConfig.selectedSymbol) || assets[0];
    const prices = asset.sparkline_in_7d?.price || [];
    const source = prices.slice(-36);
    if (!source.length) return;
    const bounds = positionsCandleChart.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, bounds.width);
    const height = Math.max(260, positionsCandleChart.clientHeight || 320);
    positionsCandleChart.width = width * ratio;
    positionsCandleChart.height = height * ratio;
    const context = positionsCandleChart.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const candles = source.map((close, index) => {
      const open = index ? source[index - 1] : close;
      const spread = Math.max(close * 0.006, 0.000001);
      return { time: Date.now() - (source.length - index) * 3600000, open, close, high: Math.max(open, close) + spread, low: Math.max(0.000001, Math.min(open, close) - spread) };
    });
    const padding = { top: 18, right: 72, bottom: 38, left: 12 };
    const values = candles.flatMap((candle) => [candle.high, candle.low]);
    const min = Math.min(...values) * .997;
    const max = Math.max(...values) * 1.003;
    const xStep = (width - padding.left - padding.right) / Math.max(candles.length - 1, 1);
    const y = (value) => padding.top + ((max - value) / (max - min || 1)) * (height - padding.top - padding.bottom);
    const formatPrice = (value) => '$' + value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 });
    const formatTime = (time) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(0, 0, 0, .2)';
    context.fillRect(0, 0, width, height);
    context.font = '11px Inter, sans-serif';
    context.strokeStyle = 'rgba(212, 175, 55, .12)';
    context.fillStyle = '#cfc5a2';
    for (let row = 0; row < 5; row += 1) {
      const value = min + (max - min) * row / 4;
      const lineY = y(value);
      context.beginPath();
      context.moveTo(padding.left, lineY);
      context.lineTo(width - padding.right, lineY);
      context.stroke();
      context.fillText(formatPrice(value), width - padding.right + 8, lineY + 4);
    }
    const candleWidth = Math.max(4, xStep * (positionsChartTools.candleStyle.bodyWidth / 100));
    candles.forEach((candle, index) => {
      const pointX = padding.left + index * xStep;
      const color = candle.close >= candle.open ? '#31d598' : '#ff6b7a';
      context.strokeStyle = color;
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(pointX, y(candle.high));
      context.lineTo(pointX, y(candle.low));
          context.lineWidth = positionsChartTools.candleStyle.wickWidth;
          context.stroke();
      context.fillRect(pointX - candleWidth / 2, y(Math.max(candle.open, candle.close)), candleWidth, Math.max(2, Math.abs(y(candle.open) - y(candle.close))));
      if (index === 0 || index === candles.length - 1 || index % 9 === 0) context.fillText(formatTime(candle.time), pointX - 18, height - 12);
    });

    positionsChartTools.indicators.forEach((indicator) => {
      const values = calculateIndicator(source, indicator.type, indicator.period);
      context.beginPath();
      context.lineWidth = 2;
      context.strokeStyle = indicator.color;
      let started = false;
      values.forEach((value, index) => {
        if (value === null) return;
        const pointX = padding.left + index * xStep;
        const pointY = y(value);
        if (!started) {
          context.moveTo(pointX, pointY);
          started = true;
        } else {
          context.lineTo(pointX, pointY);
        }
      });
      if (started) context.stroke();
    });
    positionsChartTitle.textContent = `${asset.symbol.toUpperCase()} / USD`;
    positionsChartPrice.textContent = formatPrice(candles[candles.length - 1].close);
    positionsChartStatus.textContent = 'Hourly candles • timestamps shown in local time';
  }

  const formatCurrency = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '$0.00';
    }

    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 1000 ? 2 : value >= 1 ? 4 : 6
    }).format(value);

    return formatted;
  };

  const formatCompact = (value) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2
    }).format(value);
  };

  const getPriceChangeClass = (value) => (value >= 0 ? 'trend-up' : 'trend-down');

  function getFilteredAssets() {
    const normalized = marketConfig.searchText.trim().toLowerCase();

    return assets.filter((asset) => {
      const symbol = asset.symbol.toLowerCase();
      const name = asset.name.toLowerCase();
      const matchesSearch = !normalized || symbol.includes(normalized) || name.includes(normalized);
      const matchesFilter =
        marketConfig.selectedFilter === 'all' ||
        (marketConfig.selectedFilter === 'layer1' && ['btc', 'eth', 'sol', 'ada', 'dot', 'avax'].includes(symbol)) ||
        (marketConfig.selectedFilter === 'meme' && ['doge', 'pepe', 'shib'].includes(symbol)) ||
        (marketConfig.selectedFilter === 'stable' && ['usdt', 'usdc'].includes(symbol));

      return matchesSearch && matchesFilter;
    });
  }

  function renderAssetGrid() {
    if (!assetGrid) return;

    const filteredAssets = getFilteredAssets();

    assetGrid.innerHTML = filteredAssets
      .slice(0, 6)
      .map((asset) => {
        const change = asset.price_change_percentage_24h ?? 0;
        return `
          <button class="asset-card ${asset.symbol.toUpperCase() === marketConfig.selectedSymbol ? 'is-selected' : ''}" type="button" data-symbol="${asset.symbol.toUpperCase()}">
            <span class="coin-rank">#${asset.market_cap_rank || '--'}</span>
            <h4>${asset.symbol.toUpperCase()}</h4>
            <p>${asset.name}</p>
            <strong>${formatCurrency(asset.current_price)}</strong>
            <small class="${getPriceChangeClass(change)}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</small>
          </button>
        `;
      })
      .join('');

    if (!filteredAssets.length) {
      assetGrid.innerHTML = `
        <div class="asset-card asset-card-fallback">
          <h4>No matches</h4>
          <p>Try another market filter or symbol.</p>
        </div>
      `;
    }

    assetGrid.querySelectorAll('.asset-card').forEach((card) => {
      card.addEventListener('click', () => {
        const symbol = card.dataset.symbol;
        setSelectedSymbol(symbol);
      });
    });
  }

  function renderWatchlist() {
    if (!watchlist) return;

    const topWatch = assets.slice(0, 4);
    watchlist.innerHTML = topWatch
      .map((asset) => {
        const change = asset.price_change_percentage_24h ?? 0;
        return `
          <li>
            <div>
              <strong>${asset.symbol.toUpperCase()}</strong><br />
              <small>${asset.name}</small>
            </div>
            <div>
              <strong>${formatCurrency(asset.current_price)}</strong><br />
              <small class="${getPriceChangeClass(change)}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</small>
            </div>
          </li>
        `;
      })
      .join('');
  }

  function renderMarketTable() {
    if (!marketTableBody) return;

    const filteredAssets = getFilteredAssets();

    marketTableBody.innerHTML = filteredAssets
      .slice(0, 8)
      .map((asset, index) => {
        const change = asset.price_change_percentage_24h ?? 0;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>
              <span class="asset-cell">
                <span class="asset-badge">${asset.symbol.toUpperCase().slice(0, 1)}</span>
                <span>
                  <strong>${asset.symbol.toUpperCase()}</strong><br />
                  <small>${asset.name}</small>
                </span>
              </span>
            </td>
            <td>${formatCurrency(asset.current_price)}</td>
            <td class="${getPriceChangeClass(change)}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</td>
            <td>${formatCompact(asset.total_volume)}</td>
            <td>${formatCompact(asset.market_cap)}</td>
          </tr>
        `;
      })
      .join('');
  }

  function renderChart() {
    if (!chartCanvas || !assets.length) return;

    const asset = assets.find((item) => item.symbol.toUpperCase() === marketConfig.selectedSymbol) || assets[0];
    const ctx = chartCanvas.getContext('2d');
    const values = asset?.sparkline_in_7d?.price || Array.from({ length: 30 }, (_, index) => Math.sin(index / 3) * 120 + 25000 + index * 55);

    const width = chartCanvas.width;
    const height = chartCanvas.height;
    const padding = 24;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    ctx.clearRect(0, 0, width, height);
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, 'rgba(212, 175, 55, 0.10)');
    background.addColorStop(1, 'rgba(0, 0, 0, 0.20)');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d4af37';
    ctx.shadowColor = 'rgba(212, 175, 55, 0.35)';
    ctx.shadowBlur = 12;

    values.forEach((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.shadowBlur = 0;

    const lastX = padding + ((values.length - 1) / (values.length - 1)) * (width - padding * 2);
    const lastY = height - padding - ((values[values.length - 1] - min) / range) * (height - padding * 2);

    ctx.beginPath();
    ctx.fillStyle = '#d4af37';
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f5deb3';
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(`${asset.symbol.toUpperCase()} ${formatCurrency(asset.current_price)}`, padding, 24);
  }

  function setSelectedSymbol(symbol) {
    marketConfig.selectedSymbol = symbol;
    if (positionsMarketSelect && positionsMarketSelect.querySelector(`option[value="${symbol}"]`)) {
      positionsMarketSelect.value = symbol;
    }
    if (chartTitle) {
      const asset = assets.find((item) => item.symbol.toUpperCase() === symbol) || assets[0];
      chartTitle.textContent = `${asset.symbol.toUpperCase()} / USD live market`;
    }

    chartButtons.forEach((button) => {
      const active = button.dataset.chartSymbol === symbol;
      button.classList.toggle('is-active', active);
    });

    renderAssetGrid();
    renderMarketTable();
    renderChart();
    drawPositionsChart();
  }

  async function fetchLiveMarketData() {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${marketConfig.currency}&ids=${marketConfig.ids.join(',')}&order=market_cap_desc&per_page=12&page=1&sparkline=true&price_change_percentage=24h`
      );

      if (!response.ok) {
        throw new Error('Unable to load market data');
      }

      const data = await response.json();
      assets = data.map((coin) => ({
        ...coin,
        symbol: coin.symbol.toUpperCase(),
        sparkline_in_7d: coin.sparkline_in_7d || { price: Array.from({ length: 30 }, (_, index) => Math.sin(index / 2) * 0.02 + coin.current_price) }
      }));
      const customAssets = getCustomAssets();
      assets = [...customAssets, ...assets.filter((asset) => !customAssets.some((customAsset) => customAsset.symbol === asset.symbol))];
      addCustomMarketOptions(customAssets);

      if (customAssets.length && marketConfig.selectedSymbol === 'XRP') {
        marketConfig.selectedSymbol = customAssets[customAssets.length - 1].symbol;
      }

      if (!assets.length) {
        return;
      }

      if (!assets.some((item) => item.symbol === marketConfig.selectedSymbol)) {
        marketConfig.selectedSymbol = assets[0].symbol;
      }

      const totalMarketCap = assets.reduce((sum, asset) => sum + (asset.market_cap || 0), 0);
      const totalVolume = assets.reduce((sum, asset) => sum + (asset.total_volume || 0), 0);
      const bitcoinShare = assets.find((asset) => asset.symbol === 'BTC')?.market_cap;
      const dominance = totalMarketCap && bitcoinShare ? (bitcoinShare / totalMarketCap) * 100 : 0;

      if (marketCapStat) marketCapStat.textContent = formatCompact(totalMarketCap);
      if (volumeStat) volumeStat.textContent = formatCompact(totalVolume);
      if (dominanceStat) dominanceStat.textContent = `BTC ${dominance.toFixed(0)}%`;

      renderWatchlist();
      renderAssetGrid();
      renderMarketTable();
      setSelectedSymbol(marketConfig.selectedSymbol);
    } catch (error) {
      console.error('Market data error:', error);
      const customAssets = getCustomAssets();
      if (customAssets.length) {
        assets = customAssets;
        addCustomMarketOptions(customAssets);
        marketConfig.selectedSymbol = customAssets[0].symbol;
        renderWatchlist();
        renderAssetGrid();
        renderMarketTable();
        setSelectedSymbol(marketConfig.selectedSymbol);
        return;
      }
      if (assetGrid) {
        assetGrid.innerHTML = `
          <div class="asset-card asset-card-fallback">
            <h4>Market offline</h4>
            <p>Live crypto data is temporarily unavailable.</p>
          </div>
        `;
      }
    }
  }

  chartButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const symbol = button.dataset.chartSymbol;
      if (symbol) {
        setSelectedSymbol(symbol);
      }
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      marketConfig.selectedFilter = button.dataset.filter || 'all';
      filterButtons.forEach((chip) => chip.classList.toggle('is-active', chip === button));
      renderAssetGrid();
      renderMarketTable();
    });
  });

  if (marketSearch) {
    marketSearch.addEventListener('input', (event) => {
      marketConfig.searchText = event.target.value;
      renderAssetGrid();
      renderMarketTable();
    });
  }

  if (positionsMarketSelect) {
    positionsMarketSelect.addEventListener('change', (event) => {
      setSelectedSymbol(event.target.value);
    });
  }

  [
    [positionsBuyButton, 'BUY'],
    [positionsSellButton, 'SELL']
  ].forEach(([button, side]) => {
    if (!button) return;
    button.addEventListener('click', () => {
      const symbol = marketConfig.selectedSymbol;
      positionsChartStatus.textContent = `${side} selected for ${symbol}/USD. Use the position controls below to set quantity and risk. `;
    });
  });

  if (positionsToolsButton) {
    positionsToolsButton.addEventListener('click', () => {
      const isOpen = positionsToolsOptions.hidden;
      positionsToolsOptions.hidden = !isOpen;
      positionsToolsButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

  if (positionsChartResizer && positionsChartWrap) {
    positionsChartResizer.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      positionsChartResizer.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = positionsChartWrap.getBoundingClientRect().width;
      const startHeight = positionsChartWrap.getBoundingClientRect().height;
      const parentWidth = positionsChartWrap.parentElement.getBoundingClientRect().width;
      const resizeChart = (moveEvent) => {
        const nextWidth = Math.min(parentWidth, Math.max(320, startWidth + moveEvent.clientX - startX));
        const nextHeight = Math.min(720, Math.max(260, startHeight + moveEvent.clientY - startY));
        positionsChartWrap.style.width = `${nextWidth}px`;
        positionsChartWrap.style.height = `${nextHeight}px`;
        positionsChartWrap.style.minHeight = `${nextHeight}px`;
        drawPositionsChart();
      };
      const stopResize = () => {
        positionsChartResizer.removeEventListener('pointermove', resizeChart);
        positionsChartResizer.removeEventListener('pointerup', stopResize);
        positionsChartResizer.removeEventListener('pointercancel', stopResize);
      };
      positionsChartResizer.addEventListener('pointermove', resizeChart);
      positionsChartResizer.addEventListener('pointerup', stopResize);
      positionsChartResizer.addEventListener('pointercancel', stopResize);
    });
  }

  document.querySelectorAll('[data-chart-tool]').forEach((tool) => {
    tool.addEventListener('click', () => {
      positionsToolsOptions.hidden = true;
      positionsToolsButton.setAttribute('aria-expanded', 'false');
      if (tool.dataset.chartTool === 'import') {
        const imported = window.prompt('Paste indicator JSON');
        if (!imported) {
          positionsChartStatus.textContent = 'Indicator import cancelled.';
          return;
        }
        try {
          const indicator = JSON.parse(imported);
          if (!indicator.name || !['sma', 'ema'].includes(indicator.type)) throw new Error('Unsupported indicator');
          const period = Number(indicator.period);
          if (!Number.isInteger(period) || period < 2 || period > 100) throw new Error('Invalid period');
          positionsChartTools.indicators.push({ name: indicator.name, type: indicator.type, period, color: indicator.color || '#f3c969' });
          savePositionsChartTools();
          drawPositionsChart();
          positionsChartStatus.textContent = `${indicator.name} imported and drawn on the selected market.`;
        } catch (error) {
          positionsChartStatus.textContent = 'Import failed. Use JSON with name, type (sma or ema), period, and optional color.';
        }
      }
      if (tool.dataset.chartTool === 'create') {
        const name = window.prompt('Indicator name');
        const type = (window.prompt('Indicator type: sma or ema', 'sma') || '').toLowerCase();
        const period = Number(window.prompt('Period (2-100)', '20'));
        if (!name || !['sma', 'ema'].includes(type) || !Number.isInteger(period) || period < 2 || period > 100) {
          positionsChartStatus.textContent = 'Indicator creation cancelled or invalid.';
          return;
        }
        positionsChartTools.indicators.push({ name, type, period, color: '#ffb86b' });
        savePositionsChartTools();
        drawPositionsChart();
        positionsChartStatus.textContent = `${name} ${type.toUpperCase()} (${period}) is now drawn on the selected market.`;
      }
      if (tool.dataset.chartTool === 'custom-candles') {
        const bodyWidth = Number(window.prompt('Candle body width (10-90%)', String(positionsChartTools.candleStyle.bodyWidth)));
        const wickWidth = Number(window.prompt('Candle wick width (1-5px)', String(positionsChartTools.candleStyle.wickWidth)));
        if (!Number.isFinite(bodyWidth) || !Number.isFinite(wickWidth) || bodyWidth < 10 || bodyWidth > 90 || wickWidth < 1 || wickWidth > 5) {
          positionsChartStatus.textContent = 'Custom candlestick settings cancelled or invalid.';
          return;
        }
        positionsChartTools.candleStyle = { bodyWidth, wickWidth };
        savePositionsChartTools();
        drawPositionsChart();
        positionsChartStatus.textContent = `Custom candlesticks applied: ${bodyWidth}% body width and ${wickWidth}px wick width.`;
      }
    });
  });

  fetchLiveMarketData();
  window.setInterval(fetchLiveMarketData, marketConfig.refreshMs);
  window.addEventListener('resize', drawPositionsChart);
});

document.addEventListener('DOMContentLoaded', () => {
  const terminal = document.getElementById('terminalChart');
  if (!terminal || !window.LightweightCharts) return;

  const ui = {
    symbol: document.getElementById('terminalSymbol'),
    timeframe: document.querySelectorAll('[data-timeframe]'),
    price: document.getElementById('terminalPrice'),
    change: document.getElementById('terminalChange'),
    status: document.getElementById('binanceConnection'),
    orderModeTitle: document.getElementById('orderModeTitle'),
    orderModePill: document.getElementById('orderModePill'),
    orderHint: document.getElementById('orderHint'),
    chartStatus: document.getElementById('terminalChartStatus'),
    orderForm: document.getElementById('terminalOrderForm'),
    orderType: document.getElementById('orderType'),
    orderPrice: document.getElementById('orderPrice'),
    quantity: document.getElementById('orderQuantity'),
    stopLoss: document.getElementById('stopLoss'),
    takeProfit: document.getElementById('takeProfit'),
    estimate: document.getElementById('orderEstimate'),
    positions: document.getElementById('positionsList'),
    orders: document.getElementById('ordersList'),
    balance: document.getElementById('paperBalance'),
    library: document.getElementById('indicatorLibrary'),
    activeIndicators: document.getElementById('activeIndicators'),
    builder: document.getElementById('openIndicatorBuilder'),
    clearOrders: document.getElementById('clearOrders'),
    indicatorPanel: document.getElementById('indicatorPanel'),
    indicatorButton: document.getElementById('indicatorButton'),
    marketCreateIndicator: document.getElementById('marketCreateIndicator'),
    closeIndicatorPanel: document.getElementById('closeIndicatorPanel'),
    indicatorSearch: document.getElementById('indicatorSearch')
  };
  const chartOptions = { layout: { background: { type: 'solid', color: '#101010' }, textColor: '#9b927a' }, grid: { vertLines: { color: 'rgba(212,175,55,.08)' }, horzLines: { color: 'rgba(212,175,55,.08)' } }, rightPriceScale: { borderColor: 'rgba(212,175,55,.18)' }, timeScale: { borderColor: 'rgba(212,175,55,.18)', timeVisible: true, secondsVisible: false }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal } };
  const chart = LightweightCharts.createChart(terminal, chartOptions);
  const rsiChart = LightweightCharts.createChart(document.getElementById('terminalRsiChart'), chartOptions);
  const candleSeries = chart.addCandlestickSeries({ upColor: '#31d598', downColor: '#ff6b7a', borderVisible: false, wickUpColor: '#31d598', wickDownColor: '#ff6b7a' });
  const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', scaleMargins: { top: .82, bottom: 0 }, color: 'rgba(49,213,152,.35)' });
  const rsiSeries = rsiChart.addLineSeries({ color: '#ff8b6a', lineWidth: 2, priceLineVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
  const overlaySeries = new Map();
  const resizeCharts = () => { chart.applyOptions({ width: terminal.clientWidth }); const rsiContainer = document.getElementById('terminalRsiChart'); rsiChart.applyOptions({ width: rsiContainer.clientWidth }); };
  window.addEventListener('resize', resizeCharts);
  const state = { symbol: ui.symbol.value, interval: '1m', mode: 'spot', side: 'BUY', price: 0, change: 0, connected: false, candles: [], trades: [], socket: null, tradeSocket: null, positions: JSON.parse(localStorage.getItem('makingsPaperPositions') || '[]'), orders: JSON.parse(localStorage.getItem('makingsPaperOrders') || '[]'), indicators: JSON.parse(localStorage.getItem('makingsIndicators') || '[]'), settings: JSON.parse(localStorage.getItem('makingsIndicatorSettings') || '{}'), active: ['SMA 20', 'EMA 50'] };
  const indicatorCatalog = [{ name: 'SMA 20', type: 'sma', period: 20, color: '#f3c969' }, { name: 'EMA 50', type: 'ema', period: 50, color: '#69d2ff' }, { name: 'Bollinger Bands', type: 'bollinger', period: 20, color: '#d59cff' }, { name: 'RSI 14', type: 'rsi', period: 14, color: '#ff8b6a' }, { name: 'MACD', type: 'macd', period: 12, color: '#7ee2a8' }, { name: 'Community Trend Pack', type: 'ema', period: 21, color: '#ffb86b', price: '4.99' }];

  const formatPrice = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: value < 1 ? 5 : 2, maximumFractionDigits: value < 1 ? 5 : 2 });
  const saveState = () => { localStorage.setItem('makingsPaperPositions', JSON.stringify(state.positions)); localStorage.setItem('makingsPaperOrders', JSON.stringify(state.orders)); localStorage.setItem('makingsIndicators', JSON.stringify(state.indicators)); localStorage.setItem('makingsIndicatorSettings', JSON.stringify(state.settings)); };
  const getIndicator = (name) => { const base = [...indicatorCatalog, ...state.indicators].find((indicator) => indicator.name === name); return base ? { ...base, ...state.settings[name] } : null; };
  const endpoint = () => state.mode === 'futures' ? 'https://fapi.binance.com' : 'https://api.binance.com';
  const socketHost = () => state.mode === 'futures' ? 'wss://fstream.binance.com/ws/' : 'wss://stream.binance.com:9443/ws/';

  function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
  function sma(values, period) { return values.map((value, index) => index + 1 < period ? null : average(values.slice(index + 1 - period, index + 1))); }
  function ema(values, period) { const result = []; const multiplier = 2 / (period + 1); values.forEach((value, index) => { result[index] = index === 0 ? value : (value - result[index - 1]) * multiplier + result[index - 1]; }); return result; }
  function bollinger(values, period) { return values.map((value, index) => { if (index + 1 < period) return null; const sample = values.slice(index + 1 - period, index + 1); const mean = average(sample); const deviation = Math.sqrt(average(sample.map((item) => (item - mean) ** 2))); return { upper: mean + deviation * 2, lower: mean - deviation * 2 }; }); }
  function rsi(values, period) { return values.map((value, index) => { if (index < period) return null; let gains = 0; let losses = 0; for (let offset = index - period + 1; offset <= index; offset += 1) { const change = values[offset] - values[offset - 1]; if (change >= 0) gains += change; else losses -= change; } const averageGain = gains / period; const averageLoss = losses / period; return averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss)); }); }
  const asSeriesData = (values, candles) => values.map((value, index) => value === null || value === undefined ? null : ({ time: Math.floor(candles[index].time / 1000), value })).filter(Boolean);

  function drawChart() { if (!state.candles.length) return; const candles = state.candles.slice(-120); const candleData = candles.map((item) => ({ ...item, time: Math.floor(item.time / 1000) })); const closes = candles.map((item) => item.close); candleSeries.setData(candleData); volumeSeries.setData(candles.map((item) => ({ time: Math.floor(item.time / 1000), value: item.volume || 0, color: item.close >= item.open ? 'rgba(49,213,152,.35)' : 'rgba(255,107,122,.35)' }))); overlaySeries.forEach((series) => chart.removeSeries(series)); overlaySeries.clear(); state.active.forEach((name) => { const item = getIndicator(name); if (!item || item.visible === false || item.type === 'rsi') return; const series = chart.addLineSeries({ color: item.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }); const values = item.type === 'sma' ? sma(closes, item.period) : item.type === 'ema' ? ema(closes, item.period) : bollinger(closes, item.period).map((band) => band?.upper); series.setData(asSeriesData(values, candles)); overlaySeries.set(name, series); if (item.type === 'bollinger') { const lower = chart.addLineSeries({ color: item.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); lower.setData(asSeriesData(bollinger(closes, item.period).map((band) => band?.lower), candles)); overlaySeries.set(`${name}-lower`, lower); } }); const rsiItem = state.active.map(getIndicator).find((item) => item?.type === 'rsi' && item.visible !== false); rsiSeries.setData(rsiItem ? asSeriesData(rsi(closes, rsiItem.period), candles) : []); chart.timeScale().fitContent(); rsiChart.timeScale().fitContent(); }

  function renderIndicators() { const query = (ui.indicatorSearch?.value || '').trim().toLowerCase(); const catalog = [...indicatorCatalog, ...state.indicators].filter((indicator, index, list) => list.findIndex((item) => item.name === indicator.name) === index).filter((indicator) => indicator.name.toLowerCase().includes(query)); ui.activeIndicators.innerHTML = state.active.map((name) => `<button type="button" class="indicator-chip" data-remove-indicator="${name}">${name} x</button>`).join(''); ui.activeIndicators.querySelectorAll('[data-remove-indicator]').forEach((button) => button.addEventListener('click', () => { state.active = state.active.filter((name) => name !== button.dataset.removeIndicator); renderIndicators(); drawChart(); })); ui.library.innerHTML = catalog.length ? catalog.map((indicator) => { const item = getIndicator(indicator.name); const index = [...indicatorCatalog, ...state.indicators].findIndex((entry) => entry.name === indicator.name); const added = state.active.includes(indicator.name); return `<div class="indicator-row" data-indicator-index="${index}"><div class="indicator-row-name"><i style="background:${item.color}"></i><strong>${item.name}</strong>${item.price ? `<small>$${item.price}</small>` : ''}</div><div class="indicator-controls"><label>Period<input class="indicator-period" type="number" min="5" max="200" value="${item.period}" /></label><label>Color<input class="indicator-color" type="color" value="${item.color}" /></label><label class="indicator-visibility"><input class="indicator-visible" type="checkbox" ${item.visible !== false ? 'checked' : ''} />Show</label><button type="button" data-add-indicator="${item.name}">${added ? 'Remove' : item.price && !state.indicators.some((entry) => entry.name === item.name) ? 'Buy' : 'Add'}</button></div></div>`; }).join('') : '<div class="empty-state">No indicators match that name.</div>'; ui.library.querySelectorAll('.indicator-row').forEach((row) => { const index = Number(row.dataset.indicatorIndex); const indicator = [...indicatorCatalog, ...state.indicators][index]; const update = (changes) => { state.settings[indicator.name] = { ...(state.settings[indicator.name] || {}), ...changes }; saveState(); drawChart(); }; row.querySelector('.indicator-period').addEventListener('change', (event) => update({ period: Math.max(5, Math.min(200, Number(event.target.value) || indicator.period)) })); row.querySelector('.indicator-color').addEventListener('input', (event) => update({ color: event.target.value })); row.querySelector('.indicator-visible').addEventListener('change', (event) => update({ visible: event.target.checked })); row.querySelector('[data-add-indicator]').addEventListener('click', () => { if (indicator.price && !state.indicators.some((entry) => entry.name === indicator.name)) state.indicators.push({ ...indicator, purchased: true }); state.active = state.active.includes(indicator.name) ? state.active.filter((name) => name !== indicator.name) : [...state.active, indicator.name]; saveState(); renderIndicators(); drawChart(); }); }); }

  function renderOrders() { ui.orders.innerHTML = state.orders.length ? state.orders.slice(0, 8).map((order) => `<div class="order-row"><span><strong class="${order.side === 'BUY' ? 'trend-up' : 'trend-down'}">${order.side}</strong> ${order.symbol.toUpperCase()} <small>${order.mode}</small></span><span>${order.quantity} @ ${formatPrice(order.price)}</span><time>${new Date(order.time).toLocaleTimeString()}</time></div>`).join('') : '<div class="empty-state">Your paper orders will appear here.</div>'; }
  function renderPositions() { ui.positions.innerHTML = state.positions.length ? state.positions.map((position) => `<div class="position-row"><div><strong>${position.symbol.toUpperCase()}</strong><small>${position.side} ${position.mode} · ${position.quantity}</small></div><div><strong>${formatPrice(state.price)}</strong><small>SL ${position.stopLoss ? formatPrice(position.stopLoss) : '--'} · TP ${position.takeProfit ? formatPrice(position.takeProfit) : '--'}</small></div></div>`).join('') : 'No open paper positions.'; ui.balance.textContent = '10,000.00 USDT'; }

  async function loadCandles() { ui.chartStatus.hidden = false; try { const path = state.mode === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines'; const response = await fetch(`${endpoint()}${path}?symbol=${state.symbol.toUpperCase()}&interval=${state.interval}&limit=120`); if (!response.ok) throw new Error('Binance candles unavailable'); const data = await response.json(); state.candles = data.map((item) => ({ time: item[0], open: Number(item[1]), high: Number(item[2]), low: Number(item[3]), close: Number(item[4]), volume: Number(item[5]) })); ui.chartStatus.hidden = true; drawChart(); } catch (error) { ui.chartStatus.textContent = 'Live chart unavailable. Check your connection.'; } }
  function connectTicker() { if (state.socket) state.socket.close(); state.socket = new WebSocket(`${socketHost()}${state.symbol}@ticker`); state.socket.onopen = () => { ui.status.textContent = `BillionairesXchange ${state.mode} live`; }; state.socket.onmessage = (event) => { const ticker = JSON.parse(event.data); state.price = Number(ticker.c); state.change = Number(ticker.P); ui.price.textContent = `$${formatPrice(state.price)}`; ui.change.textContent = `${state.change >= 0 ? '+' : ''}${state.change.toFixed(2)}%`; ui.change.className = state.change >= 0 ? 'trend-up' : 'trend-down'; ui.orderPrice.placeholder = formatPrice(state.price); ui.estimate.textContent = `$${(state.price * (Number(ui.quantity.value) || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`; renderPositions(); }; state.socket.onerror = () => { ui.status.textContent = 'BillionairesXchange connection unavailable'; }; }
  function connectTradeStream() { if (state.tradeSocket) state.tradeSocket.close(); state.tradeSocket = new WebSocket(`${socketHost()}${state.symbol}@kline_${state.interval}`); state.tradeSocket.onmessage = (event) => { const candle = JSON.parse(event.data).k; if (!candle) return; const nextCandle = { time: Number(candle.t), open: Number(candle.o), high: Number(candle.h), low: Number(candle.l), close: Number(candle.c), volume: Number(candle.v) }; const lastCandle = state.candles[state.candles.length - 1]; if (lastCandle?.time === nextCandle.time) state.candles[state.candles.length - 1] = nextCandle; else state.candles.push(nextCandle); drawChart(); }; }
  function refreshMarket() { loadCandles(); connectTicker(); connectTradeStream(); }

  function setExecutionMode() {
    const live = state.connected;
    ui.orderModeTitle.textContent = live ? 'Live execution' : 'Paper execution';
    ui.orderModePill.textContent = live ? 'LIVE' : 'SIM';
    ui.orderHint.textContent = live ? 'Live orders are sent to Binance. Protective exits are not supported yet.' : 'Protective exits are monitored in this browser for paper trades.';
    ui.orderForm.querySelector('.order-submit').textContent = live ? 'Place live order' : 'Place paper order';
  }

  ui.symbol.addEventListener('change', () => { state.symbol = ui.symbol.value; refreshMarket(); }); ui.timeframe.forEach((button) => button.addEventListener('click', () => { state.interval = button.dataset.timeframe; ui.timeframe.forEach((item) => item.classList.toggle('is-active', item === button)); loadCandles(); })); document.querySelectorAll('[data-trade-mode]').forEach((button) => button.addEventListener('click', () => { state.mode = button.dataset.tradeMode; document.querySelectorAll('[data-trade-mode]').forEach((item) => item.classList.toggle('is-active', item === button)); refreshMarket(); })); document.querySelectorAll('[data-order-side]').forEach((button) => button.addEventListener('click', () => { state.side = button.dataset.orderSide; document.querySelectorAll('[data-order-side]').forEach((item) => item.classList.toggle('is-active', item === button)); })); ui.quantity.addEventListener('input', () => { ui.estimate.textContent = `$${(state.price * (Number(ui.quantity.value) || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`; }); ui.orderType.addEventListener('change', () => { ui.orderPrice.disabled = ui.orderType.value === 'MARKET'; });
  ui.orderForm.addEventListener('submit', async (event) => { event.preventDefault(); const price = ui.orderType.value === 'MARKET' ? state.price : Number(ui.orderPrice.value); const quantity = Number(ui.quantity.value); const stopLoss = Number(ui.stopLoss.value) || 0; const takeProfit = Number(ui.takeProfit.value) || 0; if (!price || !quantity || (stopLoss && takeProfit && ((state.side === 'BUY' && (stopLoss >= price || takeProfit <= price)) || (state.side === 'SELL' && (stopLoss <= price || takeProfit >= price))))) { ui.chartStatus.textContent = 'Check price, quantity, and protective exit levels.'; ui.chartStatus.hidden = false; return; } if (state.connected) { if (stopLoss || takeProfit) { ui.chartStatus.textContent = 'Remove protective exits before placing a live order.'; ui.chartStatus.hidden = false; return; } try { const response = await fetch('/api/binance/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: state.symbol, side: state.side, mode: state.mode, type: ui.orderType.value, quantity, price }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Live order failed.'); ui.chartStatus.textContent = `Live order accepted: ${result.order.orderId}`; ui.chartStatus.hidden = false; } catch (error) { ui.chartStatus.textContent = error.message; ui.chartStatus.hidden = false; } return; } const order = { symbol: state.symbol, side: state.side, mode: state.mode, quantity, price, stopLoss, takeProfit, time: Date.now() }; state.orders.unshift(order); state.positions.unshift(order); saveState(); renderOrders(); renderPositions(); ui.chartStatus.textContent = 'Paper order placed with risk controls.'; ui.chartStatus.hidden = false; }); ui.clearOrders.addEventListener('click', () => { state.orders = []; saveState(); renderOrders(); });
  setExecutionMode();
  const openIndicatorWorkspace = () => { ui.indicatorPanel.hidden = false; ui.indicatorSearch.focus(); ui.indicatorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  ui.indicatorButton.addEventListener('click', () => { if (ui.indicatorPanel.hidden) openIndicatorWorkspace(); else ui.indicatorPanel.hidden = true; }); ui.marketCreateIndicator.addEventListener('click', openIndicatorWorkspace); ui.closeIndicatorPanel.addEventListener('click', () => { ui.indicatorPanel.hidden = true; }); ui.indicatorSearch.addEventListener('input', renderIndicators);
  ui.builder.addEventListener('click', () => { const name = window.prompt('Indicator name'); const period = Number(window.prompt('Period (5-200)', '20')); if (!name || !period || period < 5 || period > 200) return; state.indicators.push({ name, type: 'sma', period, color: '#ffb86b' }); saveState(); renderIndicators(); });
  document.getElementById('openLibrary').addEventListener('click', () => { const raw = window.prompt('Paste an indicator JSON definition to import'); if (!raw) return; try { const imported = JSON.parse(raw); if (!imported.name || !['sma', 'ema', 'bollinger'].includes(imported.type)) throw new Error('Unsupported indicator'); state.indicators.push({ name: imported.name, type: imported.type, period: Number(imported.period) || 20, color: imported.color || '#ffb86b' }); saveState(); renderIndicators(); } catch (error) { window.alert('Import needs a name plus type: sma, ema, or bollinger.'); } });
  window.addEventListener('resize', drawChart); renderIndicators(); renderOrders(); renderPositions(); refreshMarket();
});

  document.addEventListener('DOMContentLoaded', () => {
    const bankAccountForm = document.getElementById('bankAccountForm');
    const bankOnlineForm = document.getElementById('bankOnlineForm');
    const cardForm = document.getElementById('cardForm');
    const addBankAccountBtn = document.getElementById('addBankAccountBtn');
    const addCardBtn = document.getElementById('addCardBtn');
    const topAddBankBtn = document.getElementById('topAddBankBtn');
    const paymentMethodsSection = document.getElementById('paymentMethodsSection');
    const paymentStatus = document.getElementById('paymentStatus');

    if (!bankAccountForm || !bankOnlineForm || !cardForm || !addBankAccountBtn || !addCardBtn) {
      return;
    }

    // Toggle payment methods section when top Add Bank button is clicked
    if (topAddBankBtn && paymentMethodsSection) {
      topAddBankBtn.addEventListener('click', () => {
        paymentMethodsSection.hidden = !paymentMethodsSection.hidden;
        if (!paymentMethodsSection.hidden) {
          paymentMethodsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    const paymentForms = [bankAccountForm, bankOnlineForm, cardForm];
    const showPaymentForm = (form) => {
      paymentForms.forEach((paymentForm) => {
        paymentForm.hidden = paymentForm !== form;
      });
      paymentStatus.textContent = '';
      const firstField = form.querySelector('input, select, textarea, button[type="submit"]');
      if (firstField) firstField.focus();
    };

    const bankRegion = document.getElementById('bankRegion');
    const bankProvider = document.getElementById('bankProvider');
    const bankName = document.getElementById('bankName');
    const onlineBankName = document.getElementById('onlineBankName');
    const bankModeButtons = document.querySelectorAll('[data-bank-mode]');
    const updateBankProvider = () => {
      const region = bankRegion.value;
      bankProvider.querySelectorAll('optgroup').forEach((group) => {
        const visible = group.label.toLowerCase().includes(region === 'usa' ? 'united states' : region === 'uk' ? 'united kingdom' : 'caribbean');
        group.hidden = !visible;
        if (visible && group.querySelector('option')) bankProvider.value = group.querySelector('option').value;
      });
      if (bankName) bankName.value = bankProvider.value;
      if (onlineBankName) onlineBankName.textContent = bankProvider.value;
    };
    bankRegion.addEventListener('change', updateBankProvider);
    bankProvider.addEventListener('change', () => { if (bankName) bankName.value = bankProvider.value; if (onlineBankName) onlineBankName.textContent = bankProvider.value; });
    bankModeButtons.forEach((button) => button.addEventListener('click', () => {
      bankModeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      showPaymentForm(button.dataset.bankMode === 'online' ? bankOnlineForm : bankAccountForm);
    }));
    updateBankProvider();
    addBankAccountBtn.addEventListener('click', () => showPaymentForm(bankOnlineForm));
    addCardBtn.addEventListener('click', () => showPaymentForm(cardForm));

    document.querySelectorAll('[data-close-form]').forEach((closeButton) => {
      closeButton.addEventListener('click', () => {
        document.getElementById(closeButton.dataset.closeForm).hidden = true;
      });
    });

    [bankAccountForm, bankOnlineForm, cardForm].forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        form.hidden = true;
        form.reset();
        paymentStatus.textContent = form === bankAccountForm
          ? 'Bank account added. It is ready for verification.'
          : form === bankOnlineForm
            ? `Secure connection started for ${bankProvider.value}. Complete authorization with your bank; Makings never receives your password.`
            : 'Card added. It is ready for verification.';
      });
    });

    const depositBtn = document.getElementById('depositBtn');
    const withdrawBtn = document.getElementById('withdrawBtn');
    const transferBtn = document.getElementById('transferBtn');
    const sendBtn = document.getElementById('sendBtn');
    const billsBtn = document.getElementById('billsBtn');

    const transactionMessages = {
      deposit: 'Opening Deposit form...\n\nYou can add funds from:\n- Bank Transfer\n- Credit/Debit Card\n- Crypto Transfer',
      withdraw: 'Opening Withdrawal form...\n\nSelect destination:\n- Bank Account\n- Credit/Debit Card\n- Crypto Wallet',
      transfer: 'Opening Transfer form...\n\nTransfer between:\n- Your Wallets\n- Trading Accounts\n- Vault Storage',
      send: 'Opening Send form...\n\nSend funds to:\n- Contacts\n- Beneficiaries\n- Email Address',
      bills: 'Opening Bill Payment form...\n\nPay:\n- Utility Bills\n- Electricity\n- Data Services\n- Other Services'
    };

    if (depositBtn) {
      depositBtn.addEventListener('click', () => {
        alert(transactionMessages.deposit);
      });
    }

    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', () => {
        alert(transactionMessages.withdraw);
      });
    }

    if (transferBtn) {
      transferBtn.addEventListener('click', () => {
        alert(transactionMessages.transfer);
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        alert(transactionMessages.send);
      });
    }

    if (billsBtn) {
      billsBtn.addEventListener('click', () => {
        alert(transactionMessages.bills);
      });
    }
  });

  // Holdings Management and Currency Conversion
  const initializeHoldings = () => {
    const holdingsTableBody = document.getElementById('holdingsTableBody');
    const preferredCurrencySelect = document.getElementById('preferredCurrency');
    const totalHoldingsValue = document.getElementById('totalHoldingsValue');
    const holdingsChange = document.getElementById('holdingsChange');
    const assetCount = document.getElementById('assetCount');
    const currencyLabel = document.getElementById('currencyLabel');

    if (!holdingsTableBody || !preferredCurrencySelect) {
      return;
    }

    // Sample holdings data
    const userHoldings = [
      { symbol: 'BTC', amount: 0.5, name: 'Bitcoin' },
      { symbol: 'ETH', amount: 5.2, name: 'Ethereum' },
      { symbol: 'SOL', amount: 25.0, name: 'Solana' },
      { symbol: 'DOGE', amount: 500, name: 'Dogecoin' },
      { symbol: 'ADA', amount: 1000, name: 'Cardano' }
    ];

    // Currency symbols and names
    const currencyMap = {
      usd: { symbol: '$', name: 'USD', rate: 1 },
      eur: { symbol: '€', name: 'EUR', rate: 0.92 },
      gbp: { symbol: '£', name: 'GBP', rate: 0.79 },
      jmd: { symbol: 'J$', name: 'JMD', rate: 154.5 },
      bbd: { symbol: 'Bds$', name: 'BBD', rate: 2.02 },
      ttd: { symbol: 'TT$', name: 'TTD', rate: 6.75 },
      xcd: { symbol: 'EC$', name: 'XCD', rate: 2.70 }
    };

    let exchangeRates = {};
    let marketData = {};

    // Fetch current crypto prices
    const fetchHoldingsPrices = async () => {
      try {
        const holdingIds = userHoldings.map(h => {
          const idMap = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'SOL': 'solana',
            'DOGE': 'dogecoin',
            'ADA': 'cardano'
          };
          return idMap[h.symbol];
        }).join(',');

        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${holdingIds}&vs_currencies=usd&include_24hr_change=true`
        );

        if (response.ok) {
          const data = await response.json();
          marketData = data;
          renderHoldings();
        }
      } catch (error) {
        console.error('Error fetching holdings prices:', error);
        renderHoldings();
      }
    };

    // Get exchange rates for currency conversion
    const fetchExchangeRates = async () => {
      try {
        const response = await fetch(
          'https://api.exchangerate-api.com/v4/latest/USD'
        );

        if (response.ok) {
          const data = await response.json();
          exchangeRates = data.rates;
          fetchHoldingsPrices();
        } else {
          // Fallback to predefined rates if API fails
          exchangeRates = {
            USD: 1,
            EUR: 0.92,
            GBP: 0.79,
            JMD: 154.5,
            BBD: 2.02,
            TTD: 6.75,
            XCD: 2.70
          };
          fetchHoldingsPrices();
        }
      } catch (error) {
        console.error('Error fetching exchange rates:', error);
        // Use fallback rates
        exchangeRates = {
          USD: 1,
          EUR: 0.92,
          GBP: 0.79,
          JMD: 154.5,
          BBD: 2.02,
          TTD: 6.75,
          XCD: 2.70
        };
        fetchHoldingsPrices();
      }
    };

    // Format currency value with symbol and appropriate decimal places
    const formatCurrencyValue = (value, currency) => {
      const currencyInfo = currencyMap[currency];
      const decimals = ['jmd', 'bbd', 'ttd', 'xcd'].includes(currency) ? 2 : 2;
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
      return `${currencyInfo.symbol}${formatted}`;
    };

    // Render holdings table
    const renderHoldings = () => {
      const selectedCurrency = preferredCurrencySelect.value;
      const currencyInfo = currencyMap[selectedCurrency];
      let totalValue = 0;
      let totalChange = 0;

      holdingsTableBody.innerHTML = '';

      userHoldings.forEach(holding => {
        const idMap = {
          'BTC': 'bitcoin',
          'ETH': 'ethereum',
          'SOL': 'solana',
          'DOGE': 'dogecoin',
          'ADA': 'cardano'
        };

        const coinId = idMap[holding.symbol];
        const priceData = marketData[coinId] || {};
        const priceUSD = priceData.usd || 0;
        const change24h = priceData.usd_24h_change || 0;

        // Convert price to selected currency
        const exchangeRate = exchangeRates[currencyInfo.name] || currencyMap[selectedCurrency].rate;
        const priceInCurrency = priceUSD * exchangeRate;
        const holdingValueUSD = priceUSD * holding.amount;
        const holdingValueInCurrency = holdingValueUSD * exchangeRate;

        totalValue += holdingValueInCurrency;
        totalChange += holdingValueUSD * (change24h / 100);

        const changeClass = change24h >= 0 ? 'positive' : 'negative';
        const changeSign = change24h >= 0 ? '+' : '';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>
            <div class="asset-name">
              <span class="asset-badge">${holding.symbol.charAt(0).toUpperCase()}</span>
              <div>
                <strong>${holding.symbol}</strong><br>
                <small>${holding.name}</small>
              </div>
            </div>
          </td>
          <td><strong>${holding.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</strong></td>
          <td>${formatCurrencyValue(priceInCurrency, selectedCurrency)}</td>
          <td><strong>${formatCurrencyValue(holdingValueInCurrency, selectedCurrency)}</strong></td>
          <td>
            <span class="price-change ${changeClass}">
              ${changeSign}${change24h.toFixed(2)}%
            </span>
          </td>
        `;
        holdingsTableBody.appendChild(row);
      });

      // Update summary
      const changeClass = totalChange >= 0 ? 'positive' : 'negative';
      const changeSign = totalChange >= 0 ? '+' : '';
      totalHoldingsValue.textContent = formatCurrencyValue(totalValue, selectedCurrency);
      holdingsChange.textContent = `${changeSign}${formatCurrencyValue(totalChange, selectedCurrency)}`;
      holdingsChange.className = `summary-value ${changeClass}`;
      assetCount.textContent = userHoldings.length;
      currencyLabel.textContent = currencyInfo.name;
    };

    // Handle currency selection change
    preferredCurrencySelect.addEventListener('change', () => {
      renderHoldings();
    });

    // Load currency preferences from localStorage
    const savedCurrency = localStorage.getItem('preferredCurrency') || 'usd';
    preferredCurrencySelect.value = savedCurrency;

    // Save currency preference
    preferredCurrencySelect.addEventListener('change', () => {
      localStorage.setItem('preferredCurrency', preferredCurrencySelect.value);
    });

    // Initial load
    fetchExchangeRates();
  };

  // Initialize holdings when page loads
  initializeHoldings();

  // server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;

// Helper: sign requests
function signQuery(queryString) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

// Get account balance
app.get('/balance', async (req, res) => {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = signQuery(queryString);

  const response = await axios.get(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': API_KEY }
  });

  res.json(response.data);
});

// Place a market buy order
app.post('/buy', async (req, res) => {
  const { symbol, quantity } = req.body;
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&side=BUY&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
  const signature = signQuery(queryString);

  const response = await axios.post(`https://api.binance.com/api/v3/order?${queryString}&signature=${signature}`, {}, {
    headers: { 'X-MBX-APIKEY': API_KEY }
  });

  res.json(response.data);
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
