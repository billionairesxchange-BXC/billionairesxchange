(() => {
  const keys = new Set([
    'makingsPositionMarketPositions',
    'makingsPaperOrders',
    'makingsPositionMarketBalance',
    'makingsWalletCreditCardBalance',
    'makingsTradePaperBalance',
    'makingsTradePaperAccountBalance',
    'makingsTradeRealizedProfit',
    'makingsInvestmentDemoState',
    'makingsBotBackgroundState',
    'makingsBotMemory',
    'botPositionRecords'
  ]);
  const allowed = (key) => keys.has(key)
    || /^makingsAutoPilotBotsV1:[^:]{1,128}$/.test(key)
    || /^makingsBot(Settings|Memory):[^:]{1,128}$/.test(key);
  let token = null;
  window.makingsBackgroundTradingEnabled = false;
  let originalSetItem = null;
  let writing = Promise.resolve();
  const pendingWrites = {};
  let flushScheduled = false;
  const reportFailure = (message) => {
    window.makingsBackgroundTradingEnabled = false;
    window.dispatchEvent(new CustomEvent('makings:paper-account-error', { detail: message }));
  };
  window.addEventListener('makings:paper-account-error', (event) => {
    const status = document.getElementById('positionsChartStatus')
      || document.getElementById('investmentDemoActionStatus')
      || document.getElementById('autoPilotStatus')
      || document.getElementById('botChartStatus');
    if (status) status.textContent = `Background paper account unavailable: ${event.detail}`;
  });

  const flushWrites = () => {
    flushScheduled = false;
    const updates = { ...pendingWrites };
    Object.keys(pendingWrites).forEach((key) => delete pendingWrites[key]);
    if (!Object.keys(updates).length || !token) return;
    writing = writing.then(async () => {
      token = await window.makingsGetIdToken?.();
      if (!token) throw new Error('Sign in again to continue syncing paper trades.');
      const result = await fetch(`${window.MAKINGS_API_BASE_URL || window.location.origin}/api/paper/state`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates)
      });
      if (!result.ok) throw new Error((await result.json()).error || 'Paper account update failed.');
    }).catch((error) => {
      console.error('Background paper account could not be updated:', error);
      reportFailure(error.message);
    });
  };
  const scheduleFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flushWrites);
  };
  window.addEventListener('pagehide', flushWrites);

  const ready = new Promise((resolve) => {
    let initializationFinished = false;
    const authTimeout = window.setTimeout(() => {
      if (initializationFinished) return;
      initializationFinished = true;
      reportFailure('Firebase sign-in initialization timed out.');
      resolve();
    }, 10000);
    const initialize = async () => {
      if (initializationFinished) return;
      try {
        token = await window.makingsGetIdToken?.();
        if (!token) {
          initializationFinished = true;
          window.clearTimeout(authTimeout);
          return resolve();
        }
        const base = window.MAKINGS_API_BASE_URL || window.location.origin;
        const response = await fetch(`${base}/api/paper/state`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Paper account could not be loaded.');
        const remote = await response.json();
        const local = {};
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (allowed(key)) local[key] = localStorage.getItem(key);
        }
        originalSetItem = Storage.prototype.setItem;
        Object.entries(remote).forEach(([key, value]) => {
          if (allowed(key) && typeof value === 'string') originalSetItem.call(localStorage, key, value);
        });
        const firstSave = Object.fromEntries(Object.entries(local).filter(([key]) => !(key in remote)));
        if (Object.keys(firstSave).length) {
          await fetch(`${base}/api/paper/state`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(firstSave)
          }).then(async (result) => {
            if (!result.ok) throw new Error((await result.json()).error || 'Paper account could not be saved.');
          });
        }
        window.makingsBackgroundTradingEnabled = true;
        Storage.prototype.setItem = function (key, value) {
          originalSetItem.call(this, key, value);
          if (this !== localStorage || !allowed(String(key)) || !token) return;
          pendingWrites[String(key)] = String(value);
          scheduleFlush();
        };
      } catch (error) {
        console.error('Background paper account could not be initialized:', error);
        reportFailure(error.message);
      } finally {
        initializationFinished = true;
        window.clearTimeout(authTimeout);
        resolve();
      }
    };
    document.addEventListener('makings:auth-ready', initialize, { once: true });
    if (window.makingsAuthInitialized) initialize();
  });
  window.makingsPaperAccountReady = ready;
})();
