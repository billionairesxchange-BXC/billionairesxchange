const tickerTrack = document.getElementById('homeCoinTickerTrack');
const tickerStatus = document.getElementById('homeCoinTickerStatus');

if (tickerTrack && tickerStatus) {
  const pageSize = 250;
  const coins = [];
  let nextApiPage = 1;
  let activeIndex = 0;
  let isLoading = false;
  let hasMoreCoins = true;
  let retryDelay = 5000;
  let retryAfter = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const formatMarketCap = (value) => value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value))
    ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2
    }).format(Number(value))
    : 'Unavailable';

  function createCoinFallback(symbol) {
    const fallback = document.createElement('span');
    fallback.className = 'home-coin-ticker-fallback';
    fallback.textContent = String(symbol || '?').slice(0, 4).toUpperCase();
    fallback.setAttribute('aria-hidden', 'true');
    return fallback;
  }

  function createCoinCard(coin) {
    const card = document.createElement('article');
    card.className = 'home-coin-ticker-card';

    const identity = document.createElement('div');
    identity.className = 'home-coin-ticker-identity';
    if (typeof coin.image === 'string' && /^https:\/\//i.test(coin.image)) {
      const image = document.createElement('img');
      image.src = coin.image;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        image.replaceWith(createCoinFallback(coin.symbol));
      }, { once: true });
      identity.appendChild(image);
    } else {
      identity.appendChild(createCoinFallback(coin.symbol));
    }

    const labels = document.createElement('span');
    labels.className = 'home-coin-ticker-labels';
    const name = document.createElement('strong');
    name.textContent = coin.name || 'Unknown coin';
    const symbol = document.createElement('small');
    symbol.textContent = String(coin.symbol || '').toUpperCase();
    labels.append(name, symbol);
    identity.appendChild(labels);

    const marketCap = document.createElement('strong');
    marketCap.className = 'home-coin-ticker-market-cap';
    marketCap.textContent = formatMarketCap(coin.market_cap);
    card.append(identity, marketCap);
    tickerTrack.appendChild(card);
  }

  function moveToCoin(index, reset = false) {
    const card = tickerTrack.children[index];
    if (!card) return;

    if (reset) {
      tickerTrack.classList.add('is-resetting');
      tickerTrack.style.transform = 'translateX(0)';
      tickerTrack.offsetWidth;
      tickerTrack.classList.remove('is-resetting');
      return;
    }

    const trackStyle = window.getComputedStyle(tickerTrack);
    const gap = Number.parseFloat(trackStyle.columnGap) || 0;
    tickerTrack.style.transform = `translateX(-${index * (card.getBoundingClientRect().width + gap)}px)`;
  }

  async function loadNextCoinPage() {
    if (isLoading || !hasMoreCoins) return false;
    isLoading = true;
    tickerStatus.textContent = `Loading live market data (page ${nextApiPage})...`;

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${pageSize}&page=${nextApiPage}&sparkline=false`
      );
      if (!response.ok) throw new Error(`Coin market request failed (${response.status}).`);
      const result = await response.json();
      if (!Array.isArray(result)) throw new Error('Coin market response was invalid.');

      result.forEach((coin) => {
        coins.push(coin);
        createCoinCard(coin);
      });
      nextApiPage += 1;
      hasMoreCoins = result.length === pageSize;
      retryDelay = 5000;
      retryAfter = 0;
      tickerStatus.textContent = reducedMotion
        ? `Showing ${coins.length.toLocaleString()} live coins. Scroll horizontally to browse.`
        : `Live market data · ${coins.length.toLocaleString()} coins loaded.`;
      return true;
    } catch (error) {
      console.error('Unable to load homepage coin ticker data:', error);
      retryAfter = Date.now() + retryDelay;
      retryDelay = Math.min(retryDelay * 2, 60000);
      tickerStatus.textContent = coins.length
        ? `Could not load more coins. Showing ${coins.length.toLocaleString()} already loaded.`
        : 'Live coin market data could not be loaded. Please try again later.';
      return false;
    } finally {
      isLoading = false;
    }
  }

  async function advanceTicker() {
    if (document.hidden || isLoading || (!coins.length && !hasMoreCoins)) return;

    if (activeIndex >= coins.length - 1) {
      if (hasMoreCoins) {
        if (Date.now() < retryAfter) return;
        if (!await loadNextCoinPage()) return;
      } else {
        activeIndex = 0;
        moveToCoin(activeIndex, true);
        tickerStatus.textContent = `All ${coins.length.toLocaleString()} available coins loaded. Restarting ticker.`;
        return;
      }
    }

    if (activeIndex < coins.length - 1) {
      activeIndex += 1;
      moveToCoin(activeIndex);
    }
  }

  loadNextCoinPage().then(() => {
    if (!reducedMotion) window.setInterval(advanceTicker, 1800);
  });
}
