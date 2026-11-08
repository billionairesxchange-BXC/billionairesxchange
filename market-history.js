(() => {
  const databaseName = 'bxc-market-history';
  const storeName = 'candles';
  const databaseVersion = 1;
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('This browser does not support persistent market history.'));
        return;
      }
      const request = indexedDB.open(databaseName, databaseVersion);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (database.objectStoreNames.contains(storeName)) return;
        const store = database.createObjectStore(storeName, { keyPath: 'id' });
        store.createIndex('marketModeIntervalTime', ['market', 'mode', 'interval', 'time']);
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => {
        databasePromise = null;
        reject(request.error || new Error('Persistent market history could not be opened.'));
      }, { once: true });
      request.addEventListener('blocked', () => {
        databasePromise = null;
        reject(new Error('Persistent market history is blocked by another open site tab.'));
      }, { once: true });
    });
    return databasePromise;
  }

  function normalizeCandle(candle) {
    const time = Number(candle.time);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volume = Number(candle.volume || 0);
    if (![time, open, high, low, close, volume].every(Number.isFinite)
      || time <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0
      || high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
    return { time, open, high, low, close, volume };
  }

  async function saveCandles({ market, mode = 'spot', interval, source, candles }) {
    const normalizedMarket = String(market || '').trim().toUpperCase();
    const normalizedMode = String(mode || '').trim().toLowerCase();
    const normalizedInterval = String(interval || '').trim().toLowerCase();
    if (!normalizedMarket || !normalizedInterval || !Array.isArray(candles)) {
      throw new Error('Market history requires a market, interval, and candle list.');
    }
    const records = candles.map(normalizeCandle).filter(Boolean).map((candle) => ({
      ...candle,
      market: normalizedMarket,
      mode: normalizedMode || 'spot',
      interval: normalizedInterval,
      source: String(source || 'chart').slice(0, 40),
      id: `${normalizedMarket}|${normalizedMode || 'spot'}|${normalizedInterval}|${candle.time}`
    }));
    if (!records.length) return 0;
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      records.forEach((record) => store.put(record));
      transaction.addEventListener('complete', () => resolve(records.length), { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('Market history transaction was aborted.')), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error || new Error('Market history could not be saved.')), { once: true });
    });
  }

  async function getCandles({ market, mode = 'spot', interval, limit = 2000 }) {
    const normalizedMarket = String(market || '').trim().toUpperCase();
    const normalizedMode = String(mode || '').trim().toLowerCase();
    const normalizedInterval = String(interval || '').trim().toLowerCase();
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(Number(limit) || 2000)));
    if (!normalizedMarket || !normalizedInterval) throw new Error('Market history lookup requires a market and interval.');
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const index = transaction.objectStore(storeName).index('marketModeIntervalTime');
      const range = IDBKeyRange.bound(
        [normalizedMarket, normalizedMode || 'spot', normalizedInterval, 0],
        [normalizedMarket, normalizedMode || 'spot', normalizedInterval, Number.MAX_SAFE_INTEGER]
      );
      const records = [];
      const request = index.openCursor(range, 'prev');
      request.addEventListener('success', () => {
        const cursor = request.result;
        if (!cursor || records.length >= safeLimit) {
          resolve(records.reverse());
          return;
        }
        records.push(cursor.value);
        cursor.continue();
      });
      request.addEventListener('error', () => reject(request.error || new Error('Market history could not be read.')), { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('Market history read was aborted.')), { once: true });
    });
  }

  window.BxcMarketHistory = Object.freeze({ saveCandles, getCandles });
})();
